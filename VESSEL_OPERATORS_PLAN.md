# Plan: `vessel_operators` — many-to-many operator ↔ vessel redesign

*Scoped 2026-07-16 against the codebase as of that date (line numbers may drift). Written to be
executable in a later session without re-deriving the analysis.*

## 0. Status update — re-verified 2026-08-12

**Phase 0 SHIPPED 2026-08-12** (`20260812_vessel_operators.sql`, applied + mirrored into
schema.sql): table, index, RLS select-own policy, and backfill — **13 rows**, not 12, because
the backfill was widened to `profiles.vessel_id UNION approved vessel_claims`. Audit of Mark's
claims proved the plan's core complaint in the wild: his approved Agulhas claim (6/18) was
silently overwritten by his Cosmo approval (6/24) under the single-vessel model; the union
backfill recovered it.

**Phases 1-4 IMPLEMENTED 2026-08-12** (uncommitted, awaiting Adam's verification), same
session, with deviations from the file-by-file table:
- `lib/operators.ts` as specced. New `GET /api/operators/me` (`{vesselIds, isAdmin}`) — client
  components use it instead of querying vessel_operators via RLS (Adam: keep client data access
  in the API ecosystem). The §3a RLS policy stays but currently has no consumer.
- All §5 API swaps + write paths done (claims/submissions grant memberships + verified, no role
  writes; migrate inserts one row per shipId). DB side: `20260812_membership_read_paths.sql`
  rewrote `message_unread_count` (counts operator + inquirer sides) and `get_signup_stats`
  (operator_signups = first-membership month), and restored backfill created_at from claim
  reviewed_at / profile created_at (else all 13 would count as August signups).
- Dashboard redesigned beyond the plan (Adam, 2026-08-12): /dashboard is now the account home
  for EVERY signed-in user, with tabs — My Listings (multi-vessel cards + per-listing view
  counts from page_views head-counts), Messages (per-vessel InquiryThread + Open Inbox card for
  verified users), Profile (info, badges, notification prefs, Edit Profile) — and Sign Out on
  the tab bar. `components/DashboardTabs.tsx`. Edit page takes ?vessel=.
- Navbar collapsed to Admin (admins) + a single Dashboard link with the unread badge; the
  prefs bell, profile avatar, Sign Out, My Vessel and Inbox links all moved into the dashboard.
  /api/operators/me no longer has a Navbar consumer (edit page still uses it).
- **Co-operator direction (many users per vessel) DEFERRED by Adam** — see §7. Claim surfaces
  stay closed on claimed vessels; everything else (schema, fan-out, approval upsert) supports it.
- **Phase 6 STAGED 2026-08-12, beyond the original plan (Adam's call):** profiles.role is
  replaced by `is_admin boolean` outright, not just collapsed. Additive half applied
  (`20260812_is_admin_column.sql`: column + backfill + is_admin-based get_signup_stats +
  storage policies); ALL code reads is_admin — zero profiles.role references remain. The
  destructive half (`20260812_drop_role_column.sql`: drop role AND vessel_id) is written and
  runs ONLY after this code deploys. Bonuses beyond rename: admin "Users" tab derives its
  operator chip from membership, analytics stamps operator from membership.
- **Phase 5 DONE 2026-08-13** (20260813_recover_multiship_memberships.sql): 4 dropped memberships restored — Mark regains Western Flyer, Dohrn, Odon de Buen; Larissa regains Mojave (ROV). Every phase of this plan is now shipped except the deliberately deferred co-operator claims.

Checked against the live DB and codebase after the /claim + admin-email work shipped (13e5d0c).
`lib/operators.ts` does not exist; Phases 1-6 have not started. Changes since scoping:

- **Live bug #3 (operator notify `.single()`): FIXED** by the 8/3 messaging work —
  `lib/message-notify.ts` `operatorRecipients()` fetches *all* operator profiles for a vessel and
  respects mute prefs. Still keyed on `profiles.vessel_id + role='operator'`, so the §5 swap now
  lives there (one internal query), not in `app/api/messages/route.ts`.
- **Live bug #4 (claims approval demotes admins): HALF-FIXED** — `app/api/admin/claims/route.ts:64-95`
  now preserves `role='admin'` and additionally grants `verified: true` on approval (keep that
  in the rewrite). It still writes `role='operator'` + single `vessel_id` for everyone else.
- **Live bug #2 (`isClaimed` `.maybeSingle()`): STILL LIVE**, now at `app/vessels/[id]/page.tsx:62`.
  Latent — no vessel currently has 2+ operator profiles — but it fires the day one does.
- **Live bug #1 (migration drops `shipIds[1..]`): moot-ish** — the user migration is over
  (28/29 migrated). Exactly **2** legacy users have multiple ships; Phase 5 recovery is a
  two-row one-off. NB the column is `user_migrations.ship_ids` (integer[]), not a JSON payload.
- **New write/read sites created after scoping** (added to §5 below):
  `app/claim/page.tsx` (claimed-vessel set from `profiles.vessel_id`), and the
  `get_signup_stats()` RPC (admin-email stats footer counts `role='operator'` — goes to zero
  after Phase 6 unless switched to memberships).
- **Data snapshot 2026-08-12:** 44 profiles — 5 admin / 10 operator / 29 scientist. 12 hold a
  `vessel_id` (10 operators + 2 admins: lisa.quinanola→1221, g.mark.miller1→1180 — the
  "admins locked out of operator UI" case is real today). Backfill in §3b = 12 rows.
- **Related backlog item (FUTURE.md):** rename admin "Scientists" tab → "New users" with an
  operator chip. After this redesign the chip should derive from membership existence, not
  `role='operator'` — implement together or sequence the rename after Phase 6.

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
  lists `role = 'scientist'`, so operators can never become verified. *(Softened since scoping:
  claims approval now grants `verified: true`, so claim-path operators are no longer stranded.
  The structural fix below still applies.)*

### Live bugs found during scoping (status re-checked 2026-08-12, see §0)

1. ~~**`app/api/migrate/users/route.ts:121-126`**~~ — migration sets `vessel_id = shipIds[0]`,
   dropping other ships. **Migration is over**; recovery = 2 users via `user_migrations.ship_ids`
   (Phase 5).
2. **STILL LIVE — `app/vessels/[id]/page.tsx:62`** — `isClaimed` uses `.maybeSingle()` on
   `profiles.eq('vessel_id', id)`. With 2+ profiles pointing at one vessel this **errors** (which
   currently silently reads as "unclaimed" → Claim button shows on a claimed vessel). Latent:
   no vessel has 2+ operator profiles yet.
3. ~~**`app/api/messages/route.ts:54-60`**~~ — **FIXED 2026-08-03**: `lib/message-notify.ts`
   `operatorRecipients()` notifies all operators, mute-aware. §5 swap now targets that helper.
4. **HALF-FIXED — `app/api/admin/claims/route.ts:64-95`** — admin demotion fixed (role preserved,
   `verified: true` granted). Still writes `role='operator'` + single `vessel_id` for non-admins.

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
-- Widened at implementation time (2026-08-12): approved claims are the durable
-- record of every grant — profile links get overwritten by each new approval.
insert into vessel_operators (user_id, vessel_id)
select id, vessel_id from profiles where vessel_id is not null
union
select user_id, vessel_id from vessel_claims where status = 'approved' and user_id is not null
on conflict do nothing;
```

This intentionally includes admins with a `vessel_id` — that's the point. (Shipped 2026-08-12:
13 rows — 12 current profile links + Mark's overwritten Agulhas claim recovered via the union.)

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
| `lib/message-notify.ts:5-15` *(moved here from messages/route.ts — bug #3 already fixed)* | `operatorRecipients()` selects profiles by `vessel_id + role='operator'`, mute-aware, all rows | swap the query to join `vessel_operators` → `profiles`; keep the mute filter. Callers unchanged |
| `app/api/admin/claims/route.ts:64-95` | preserves admin role; writes `{role:'operator', vessel_id, verified:true}` for others | `insert into vessel_operators (user_id, vessel_id) on conflict do nothing` + `update profiles set verified=true` — **keep the verified grant**, drop the role/vessel_id writes. Multiple approved claims per vessel now legal; the admin special-case becomes unnecessary |
| `app/claim/page.tsx:17-20` *(new since scoping — shipped 2026-08-12)* | claimed-vessel set from `profiles.select('vessel_id').not('vessel_id','is',null)` | `select vessel_id from vessel_operators` (distinct). Feeds the "already claimed" flags in the /claim dropdown |
| `get_signup_stats()` RPC (`20260811_admin_stats_footer.sql:27-30`) *(new since scoping)* | `operator_signups` counts profiles by `role='operator'` — reads zero after Phase 6 | count users whose **first membership row** was created in the month (`min(created_at)` per user in `vessel_operators`). Needs a new dated migration + schema.sql mirror in Phase 6 |
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

- `app/api/analytics/pageview/route.ts` — segments page views by `profile.role`; after the
  role collapse the `operator` segment stops accruing. Cosmetic; optionally derive
  operator-ness from membership. Historical rows keep old labels (`AnalyticsTab` `ROLE_LABELS`).
  (Since 2026-08-03 admin traffic isn't recorded at all — a280bec — so only the
  scientist/operator split is affected.)
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
6. **Phase 5 — recovery**: one-off insert over `user_migrations.ship_ids` (integer[]) for the
   **2** already-migrated multi-ship users whose extra ships were dropped (live bug #1
   aftermath): unnest `ship_ids`, join `supabase_user_id`, insert memberships on conflict
   do nothing. Verify the vessel ids still exist first.
7. **Phase 6 — cleanup** (after everything above is verified in prod): §3c — drop
   `profiles.vessel_id`, collapse `operator` → `scientist`, remove any dead reads, update
   `scripts/schema.sql`, memory/docs.

Phases 0-2 are low risk and mechanical (~half a day). Phase 3 is the design-sensitive part
(dashboard UX for multiple vessels). Phase 4-6 are small.

## 7. Decisions made (revisit if product disagrees)

- Keep role values `scientist | admin`; do NOT rename `scientist` → `user` in this pass.
- **Adam, 2026-08-12: co-operator claims (many users per vessel) are DEFERRED.** The schema
  supports them, notifications already fan out, and approval would grant a second membership
  fine — but the claim surfaces stay closed: the vessel page shows the Claim button only on
  unclaimed vessels, and the /claim dropdown disables claimed ones. When this reopens, the
  agreed flow is co-operator consent: existing operator(s) get asked before a new person is
  added (email + accept/decline surface), on top of admin review. Only the one-user-many-vessels
  direction shipped.
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
- [ ] /claim dropdown: vessels with any operator show the claimed flag; a second claimant can
      still submit (per §7); approving files a membership, not a role write.
- [ ] Admin-email stats footer: `operator_signups` still counts correctly post-Phase 6
      (membership-based), and the monthly numbers don't double-count multi-vessel operators.
- [ ] Regression: anonymous browsing, scientist inquiry flow, admin dashboard tabs all unchanged.

## 9. Out of scope (tracked in FUTURE.md)

- Renaming `scientist` → `user`; per-vessel operator titles/permissions (owner vs crew);
  operator invitations (operator adds a colleague without a claim flow); transfer of ownership.
