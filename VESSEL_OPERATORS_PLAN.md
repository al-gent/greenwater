# Plan: `vessel_operators` — many-to-many operator ↔ vessel redesign

*Scoped 2026-07-16 against the codebase as of that date (line numbers may drift). Written to be
executable in a later session without re-deriving the analysis.*

## 1. Problem

`profiles.role` (`scientist | operator | admin`, single-valued) conflates **permission tier** with
**vessel relationship**, and `profiles.vessel_id` allows exactly **one vessel per user**. Real
requirements:

- One vessel has many operators (e.g. an institution's staff).
- One operator runs many vessels (the legacy user migration already receives `shipIds[]` arrays).
- Admins also operate vessels (true today for several admins) — but operator UI is gated on
  `role === 'operator'`, so they're locked out of their own vessel features.
- An operator may want to *inquire about another vessel* to coordinate research — but inquiries
  require `verified`, and verification is only granted through the admin "scientists" tab which
  lists `role = 'scientist'`, so operators can never become verified.

### Live bugs found during scoping (worth fixing even before the redesign)

1. **`app/api/migrate/users/route.ts:121-126`** — migration sets `vessel_id = body.shipIds[0]`,
   silently dropping every other ship. Data loss for multi-ship legacy users. Check
   `user_migrations` rows for already-migrated multi-ship users to recover lost links.
2. **`app/vessels/[id]/page.tsx:58`** — `isClaimed` uses `.maybeSingle()` on
   `profiles.eq('vessel_id', id)`. With 2+ profiles pointing at one vessel this **errors** (which
   currently silently reads as "unclaimed" → Claim button shows on a claimed vessel).
3. **`app/api/messages/route.ts:54-60`** — operator notification uses `.single()` on the same
   lookup; with 2+ operators the email notification silently fails for everyone.
4. **`app/api/admin/claims/route.ts:66`** — approval writes `{role:'operator', vessel_id}`
   unconditionally → approving an admin's claim demotes them from admin. (The identical bug in
   the submissions route was fixed 2026-07-16; claims was not.)

## 2. Target model

- **`profiles.role`** = permission tier only. Keep values `scientist` (default) and `admin`;
  **stop writing `operator` anywhere**. (Renaming `scientist` → `user` is a purely cosmetic
  follow-up; skip it in this pass to avoid a giant sweep of the scientists tab, pending-count,
  analytics segments, etc.)
- **`vessel_operators`** join table = the operator relationship. "Is an operator" stops being an
  identity; it's a per-vessel fact.
- **`profiles.verified`** stays as is and keeps gating inquiries/inbox — but because operators
  keep `role='scientist'`, they now appear in the admin verification tab and *can* become
  verified → solves the coordinate-research case with zero extra code.
- **Message side** (`messages.author_role`, values `scientist|operator`) stays a per-message
  side label; it's just *derived* from vessel membership instead of profile role at write time.

## 3. Schema changes

### 3a. New table (dated migration + mirror into `scripts/schema.sql`)

```sql
create table if not exists vessel_operators (
  user_id    uuid    not null references profiles(id) on delete cascade,
  vessel_id  integer not null references vessels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vessel_id)
);
create index if not exists idx_vessel_operators_vessel on vessel_operators (vessel_id);

alter table vessel_operators enable row level security;
-- Navbar/dashboard read memberships from the BROWSER client, so RLS must allow it:
create policy "own_memberships_select" on vessel_operators
  for select using (auth.uid() = user_id);
-- All writes go through supabaseAdmin (service role) — no insert/update/delete policies.
```

Note `on delete cascade` on `vessel_id`: this also structurally fixes the "can't delete a vessel
because a profile references it" annoyance (hit live 2026-07-16) once `profiles.vessel_id` is
dropped in Phase 6.

Optional but recommended: add `vessel_operators` to the `data_changes` audit triggers
(`scripts/schema.sql` ~454-510) so membership grants/revocations appear in the admin Changes tab.
The existing trigger audits UPDATEs only; membership changes are INSERT/DELETE, so either add
insert/delete triggers or skip.

### 3b. Backfill (same migration)

```sql
insert into vessel_operators (user_id, vessel_id)
select id, vessel_id from profiles
where vessel_id is not null
on conflict do nothing;
```

This intentionally includes admins with a `vessel_id` — that's the point.

### 3c. Phase 6 cleanup (LAST, after all code ships)

```sql
alter table profiles drop column vessel_id;
update profiles set role = 'scientist' where role = 'operator';
```

Keep `scripts/schema.sql` in sync at every step (house rule: dated migration + schema.sql mirror).

## 4. Shared helper (new file, e.g. `lib/operators.ts`)

Server-side helpers used by API routes and server pages (via `supabaseAdmin`):

```ts
getOperatedVesselIds(userId): Promise<number[]>      // select vessel_id from vessel_operators
canOperateVessel(userId, vesselId): Promise<boolean> // membership row exists OR profile.role === 'admin'
getVesselOperators(vesselId): Promise<{id, email, first_name, last_name}[]> // join profiles, for notifications
```

Decision to make at implementation time: whether `canOperateVessel` includes the admin override.
Recommended: **yes for API authorization** (admins may edit anything — matches current
`/api/vessels/update` behavior), **no for UI listings** ("My Vessels" shows only actual
memberships, not every vessel because you're an admin).

## 5. Code changes, file by file

### Authorization / API routes

| File | Today | Change |
|---|---|---|
| `app/api/vessels/update/route.ts:14-36` | admin branch; else `role==='operator' && vessel_id === profile.vessel_id` | admin branch unchanged; else `canOperateVessel(user.id, vessel_id)` |
| `app/api/vessels/docs/route.ts:14-20` | same pattern | same swap |
| `app/api/messages/[threadId]/read/route.ts:13-36` | requires `role==='operator'`, then `root.vessel_id === profile.vessel_id` | replace both with `canOperateVessel(user.id, root.vessel_id)` |
| `app/api/messages/[threadId]/reply/route.ts:13-43` | `isOperator = role==='operator' && root.vessel_id === profile.vessel_id`; `isScientist = root.author_id === user.id` | `isScientist` first (author always replies as inquirer side — matters for self-inquiry edge case), else `isOperator = await canOperateVessel(...)`. `authorRole` write logic unchanged |
| `app/api/messages/route.ts:46-80` | notifies THE operator via `.eq('vessel_id').eq('role','operator').single()` | `getVesselOperators(vessel_id)` and email **all** of them (fixes live bug #3). Keep the `verified` gate on POST as is |
| `app/api/admin/claims/route.ts:~66` | `update profiles set {role:'operator', vessel_id}` | `insert into vessel_operators (user_id: claim.user_id, vessel_id: claim.vessel_id) on conflict do nothing` — no role write (fixes live bug #4). Multiple approved claims per vessel now legal |
| `app/api/admin/submissions/route.ts:155-175` | fixed 2026-07-16 to skip admins entirely (admin gets no vessel link) | replace whole block with membership insert for the submitter, admins included — the skip becomes unnecessary |
| `app/api/migrate/users/route.ts:121-126` | `vessel_id = shipIds[0]`, role write | insert one membership row per `shipIds` entry; drop the role write (fixes live bug #1) |

### Server pages

| File | Today | Change |
|---|---|---|
| `app/dashboard/page.tsx` (gate :17-21, vessel :47-51, inquiries :55-59) | one vessel, gated `role==='operator' && vessel_id` | gate on `getOperatedVesselIds(user.id).length > 0`; fetch all operated vessels; inquiries via `.in('vessel_id', ids)`. UI: vessel cards + inquiries grouped/labeled by vessel. This is the biggest UI change — "My Vessel" → "My Vessels" |
| `app/dashboard/edit/page.tsx:22-32` | edits `profile.vessel_id` | accept `?vessel=<id>` param (default: sole membership if exactly one); verify membership (or admin); dashboard links pass the id |
| `app/vessels/[id]/page.tsx:58,75` | `isClaimed` via `profiles.maybeSingle()` (live bug #2) | `exists` on `vessel_operators` (`.limit(1)` or head-count). Also compute `userOperatesThisVessel` to hide the Claim button for existing operators while still allowing *additional* people to claim an already-claimed vessel (decision recorded in §7) |

### Client components

| File | Today | Change |
|---|---|---|
| `components/Navbar.tsx` (profile fetch :35-52; operator links :130 desktop, :220 mobile; scientist inbox :146/:230) | links keyed off single role | fetch membership count alongside profile (browser client — needs the RLS select policy from §3a). Show My Vessel(s)/Messages when count > 0 — including for admins (admins show Admin *and* vessel links). Inbox link: change `role==='scientist' && verified` → `verified` (any verified user) |
| `components/ClaimButton.tsx` / `ClaimModal.tsx` | rendered only when `!isClaimed` | rendered when the current user doesn't already operate the vessel (server decides, passes prop). Copy tweak: "claimed" badge → "n operator(s)" or keep binary "claimed" |
| `components/InboxClient.tsx`, `ChatThread.tsx` | display `author_role` | unchanged (side labels still written the same way) |

### Unaffected but verify at implementation time

- `app/api/analytics/pageview/route.ts:44-58` — segments page views by `profile.role`; after the
  role collapse the `operator` segment stops accruing. Cosmetic; optionally derive
  operator-ness from membership. Historical rows keep old labels (`AnalyticsTab` `ROLE_LABELS`).
- `app/api/admin/scientists/route.ts:27` + `pending-count/route.ts:22` — `.eq('role','scientist')`
  keeps working because operators keep role `scientist`. Consequence (desired): operators appear
  in the verification queue and can be verified to send inquiries.
- `app/inbox/page.tsx` — keyed on `author_id`, no role logic. Unaffected.
- Admin gates everywhere (`role === 'admin'`) — unaffected.
- Emails in `lib/brevo.ts` — claim/submission approval templates don't mention roles; unaffected.

## 6. Sequencing (each phase independently shippable)

1. **Phase 0 — schema**: migration §3a + backfill §3b (+ optional audit trigger). Purely additive.
2. **Phase 1 — helpers**: `lib/operators.ts`. No behavior change.
3. **Phase 2 — API authorization swaps**: the 8 routes in §5. Behavior change is strictly
   *additive* (admins/multi-operators gain access; nobody loses it), because every profile with
   `vessel_id` got a membership row in Phase 0.
4. **Phase 3 — pages**: dashboard multi-vessel UI, edit page param, vessel-page claimed logic, Navbar.
5. **Phase 4 — write paths**: claims / submissions / migrate-users stop writing `role`/`vessel_id`
   and insert memberships instead. (After this, `profiles.vessel_id` is never written again.)
6. **Phase 5 — recovery**: one-off script over `user_migrations` to insert memberships for
   already-migrated multi-ship users whose extra ships were dropped (live bug #1 aftermath).
7. **Phase 6 — cleanup** (after everything above is verified in prod): §3c — drop
   `profiles.vessel_id`, collapse `operator` → `scientist`, remove any dead reads, update
   `scripts/schema.sql`, memory/docs.

Phases 0-2 are low risk and mechanical (~half a day). Phase 3 is the design-sensitive part
(dashboard UX for multiple vessels). Phase 4-6 are small.

## 7. Decisions made (revisit if product disagrees)

- Keep role values `scientist | admin`; do NOT rename `scientist` → `user` in this pass.
- Claiming stays open on already-claimed vessels (multiple operators are now a feature); the
  admin approving the claim is the safeguard against hijacking. If that feels too loose, gate
  second claims behind an "additional operator" label in the admin claims tab.
- `canOperateVessel` includes the admin override for API auth; "My Vessels" lists memberships only.
- Inquiry rights stay behind `verified` (now reachable by operators). No self-inquiry guard —
  if you inquire about your own vessel, author-side precedence in the reply route handles it.

## 8. Testing checklist (post-implementation)

- [ ] Operator with 2 vessels: dashboard lists both; can edit both; sees inquiries for both.
- [ ] Vessel with 2 operators: both see/reply/mark-read on its threads; both get inquiry emails;
      vessel page shows claimed; neither sees the Claim button.
- [ ] Admin with a vessel: sees Admin + My Vessels nav; can use /dashboard and operator edit;
      approving their own submission/claim does NOT change their role.
- [ ] Scientist → claim approved → gains membership, keeps `role='scientist'`, verified state
      untouched; can still use inbox as inquirer on other vessels.
- [ ] Operator requests verification → appears in admin scientists tab → verified → can inquire
      about a different vessel; reply threading puts them on the correct side of each thread.
- [ ] Delete a vessel with operators (post-Phase 6): succeeds, memberships cascade.
- [ ] Legacy migration with `shipIds.length > 1`: all memberships created.
- [ ] Regression: anonymous browsing, scientist inquiry flow, admin dashboard tabs all unchanged.

## 9. Out of scope (tracked in FUTURE.md)

- Renaming `scientist` → `user`; per-vessel operator titles/permissions (owner vs crew);
  operator invitations (operator adds a colleague without a claim flow); transfer of ownership.
