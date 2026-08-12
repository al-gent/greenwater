# Future Work

## Messaging

- **SQL RPC for thread fetching**: The current two-query approach (fetch all messages, split in JS) works for V1. Replace with a `get_threads(p_vessel_id)` and `get_inbox(p_user_id)` SQL RPC once message volume warrants more efficient queries.
- **Scientist replies in inbox**: Currently read-only in V1. Add reply capability in `InboxClient` once the operator reply flow is validated.
- **Real-time updates**: Add Supabase Realtime subscriptions to push new messages without requiring page reload.
- **Message pagination**: Add cursor-based pagination once threads exceed 50+.

## Scientist Verification

- **Bulk verification actions**: Add bulk approve/reject in admin dashboard once scientist volume increases.
- **ORCID integration**: Validate `profile_url` against ORCID API to auto-verify institutional credentials.

## Vessel Claims

- **Private claim-documents bucket**: The `claim-documents` Supabase Storage bucket is currently public for simplicity. Documents may contain confidential information (registration certificates, employment letters, crew manifests). Switch to a private bucket and generate short-lived signed URLs server-side in the admin API when the admin clicks "View supporting document". Never expose the raw storage path client-side.

## Vessel Data


- **Auto-populate lat/lon from port city** — `primary_latitude` / `primary_longitude` removed from edit form; geocode programmatically from `port_city` / `country` (e.g. Nominatim). ~325/567 vessels currently have coordinates.

- **Rename `vessels.primary_latitude/longitude` → `homeport_latitude/longitude`** — vague names ("primary what?"). `vessel_submissions` already uses the clean `homeport_*` names + new `port_name` column; `vessels` still uses `primary_*`. On submission approval we map `homeport_*` → `primary_*`. Rename the vessels columns (+ code sweep: `lib/vessel-utils.ts`, `components/HomeMap.tsx`, edit form, etc.) to unify.

## Vessel Submission Form (`/list`)

- **Expand `vessel_submissions` table** — the new-vessel submission form only covers a subset of fields. To match the comprehensive edit form, add columns for facilities, science equipment, propulsion, etc. and update the form + API route.

- **Port city autocomplete** — low priority for the admin/operator edit form, higher priority when `/list` is expanded. Nominatim (OpenStreetMap) is free, no API key required, and can auto-fill lat/lon from a selected city.

- **Collapse `vessel_submissions` into a status flag on `vessels`** — instead of a separate table + copy-on-approval, insert new listings directly into `vessels` with `status='needs_review'` and have approval just flip to `status='active'` (`getAllVessels` already filters `status='active'`). Removes the schema drift where every new field must be added to both the submissions table AND the approval-copy mapping (e.g. `port_name`, `homeport_*`, `operating_area_geojson`). Requires: repoint the submission form/API to a vessels insert, update the admin dashboard to review `needs_review` rows, guard `getVesselById`/detail pages against pending rows, and rework RLS so a signed-in user can insert a pending vessel but not self-approve or set itself operator. Moderate refactor — deferred to keep the operating-area feature shippable.

## Operating Area / Location Search

Shipped V1: operators set operating area via a **free-text field + a hand-drawn box/polygon**
on a Leaflet (leaflet-geoman) map, stored as a GeoJSON FeatureCollection in
`operating_area_geojson` (on `vessels` and `vessel_submissions`). Home port uses a Photon
(OSM) autocomplete that fills city/state/country + verified coords.

Deferred — **gazetteer-backed region picker** (pre-built, then pulled out before shipping):
- We prototyped a "pick a named sea/region → auto-fill its real polygon" autocomplete against
  the live Marine Regions REST API. **Removed because the live API was too slow for good UX**
  (each pick fetched + parsed + simplified a multi-MB WKT polygon server-side).
- The right approach: **bundle the source shapefiles offline** and store simplified polygons
  locally (Supabase `regions` table: `mrgid, name, place_type, bbox, geojson`). Then the picker
  searches local names and renders local geometry — no runtime API dependency.
  - Datasets (from marineregions.org/downloads): **IHO Sea Areas** (~101, already downloaded to
    `~/Downloads/world_seas/World_Seas_IHO_v3.shp`), **Large Marine Ecosystems (LMEs, ~66)**,
    **Marine Ecoregions of the World (MEOW, ~232)**. Stacked ≈ 400 regions.
  - Processing gotcha: big ocean basins (e.g. North Atlantic) are huge even after Douglas-Peucker
    simplification because they trace thousands of tiny coastline/island rings. **Drop small rings
    + simplify** (a point-in-ocean test doesn't need island detail); consider bbox fallback for the
    giant basins. `@turf/simplify` + `wellknown` were used in the prototype (uninstalled).
- Also build: a **derivation pass** to backfill `operating_area_geojson` for the ~423 existing
  vessels that have `operating_area` text, matching text → region (gazetteer-first, AI normalizer
  on miss for typos/aliases — validated at ~42% raw match, much higher with normalization). A
  review notebook exists at `notebooks/operating_area_review.ipynb`.
- Front-end search: location box (Photon) → point → client-side point-in-polygon over vessels'
  `operating_area_geojson`. Render a vessel's polygons on its detail map first; home-map overlay later.

## Vessel Edit UX

- **Auto-save on blur instead of an explicit Save button** — patch each field (or section) to `/api/vessels/update` when it loses focus, with a subtle "Saved" indicator, rather than collecting the whole form and submitting once. Removes the "did my change persist?" ambiguity and the full-form re-submit (which is what surfaced the geocode-overwrite bug — every save re-sent every field). Consider debouncing, optimistic UI, and a per-field saved/saving/error state. Applies to `VesselEditForm`; the update route already accepts partial patches.

## Roles & Permissions

> **Full redesign scoped:** see `VESSEL_OPERATORS_PLAN.md` (2026-07-16) — many-to-many
> `vessel_operators` join table, role collapse, phased migration. It supersedes the items below,
> which are kept as the raw symptom inventory.

- **Admin + vessel_id doesn't work** (surveyed 2026-07-16). `profiles.role` is single-valued
  (`scientist | operator | admin`) but several admins also have a vessel via `profiles.vessel_id`,
  and everything operator-facing is gated on `role === 'operator'`, so an admin with a vessel is
  locked out of their own vessel features. Affected gates:
  - `app/dashboard/page.tsx:21` and `app/dashboard/edit/page.tsx:24` — redirect unless
    `role === 'operator' && vessel_id`; admins can't see their vessel dashboard/inquiries or use
    the operator edit form (workaround: `/admin/vessels/[id]/edit`).
  - `app/api/messages/[threadId]/read/route.ts:18` — mark-as-read requires `role === 'operator'`;
    an admin can never mark their vessel's inquiries read.
  - `app/api/messages/[threadId]/reply/route.ts:36` — `isOperator` requires `role === 'operator'`;
    an admin replying on their own vessel's thread is misclassified as the non-operator side.
  - `components/Navbar.tsx` (desktop + mobile menu) — "My Vessel" / "Messages" links only render
    for `role === 'operator'`; admins with a vessel get no entry point.
  - Fine as is: `/api/vessels/update` and `/api/vessels/docs` already special-case admins.

  **Recommended direction:** keep `role` as the permission tier and treat "operates a vessel" as
  an orthogonal fact (`vessel_id != null`). Add a shared helper (e.g. `canOperateVessel(profile,
  vesselId)`), gate the dashboard pages / message routes / Navbar links on it, and let an admin
  with a vessel see both Admin and My Vessel links. Watch the same pattern on
  `role === 'scientist' && verified` (Inbox) — an admin-scientist has the same class of problem.

- **Role demotion on approval**: FIXED 2026-07-16 in both routes — submissions and claims
  approval now preserve `role='admin'` and set only `vessel_id` for admin submitters/claimants.
  (Non-admins still get promoted to operator as before.) Superseded by the join-table redesign,
  which removes role writes from approval entirely.

- **`profiles.vessel_id` FK has no ON DELETE behavior** — deleting a vessel a profile points at
  fails with an FK error (hit manually 2026-07-16). If vessel deletions become routine:
  `alter table profiles drop constraint profiles_vessel_id_fkey, add constraint
  profiles_vessel_id_fkey foreign key (vessel_id) references vessels(id) on delete set null;`
  Current strict behavior does prevent silently orphaning an operator's dashboard, so this is a
  judgment call.

## Photo Credits (follow-ups to the 2026-07-16 feature)

- **Show credits in the admin submissions review UI** — credits are captured on `/list-your-vessel`
  and carried through approval, but the AdminDashboard submissions tab doesn't display them.
- **Normalize messy legacy credit strings** (`photo:MBARI`, `credit_dave_allen_niwa`, trailing
  commas) — either clean in DB or strip prefixes/punctuation at render time.
- **One unmatched legacy credit**: vessel 1180 (Cosmo) — source file `IMG_1239-scaled.jpeg` has a
  credit but no matching URL in `photo_urls` (photo likely never uploaded or was replaced).

## Discoverability in AI assistants (GEO / "SEO for LLMs")

Researchers increasingly start with ChatGPT/Claude/Perplexity rather than a search box, so
"which vessels can do coastal work off Peru" should surface VesselConnect. This is a separate
track from the classic SEO plan and from Google Ads — see `GOOGLE_ADS_PLAN.md`.

- **Paid placement is mostly not available to us.** Perplexity pulled ads entirely (Feb 2026).
  ChatGPT runs ads on Free/Go tiers only, sold at ~$60 CPM — brand-advertising economics, not
  nonprofit-grant economics, and heavily skewed to shopping queries. Google is the exception:
  ads now appear in AI Overviews and AI Mode, and **Ad Grants search campaigns can surface
  there without any extra setup**. So the near-term AI play is organic, not paid.
- **Presence in the corpora models train on and cite** — this is the main lever, and it is not an
  on-page problem. Models learn about a thing from where people discuss it: Reddit
  (r/oceanography, r/marinebiology, r/AskScienceDiscussion), Wikipedia, university and society
  pages, forum threads, published articles. VesselConnect is currently absent from all of them,
  so no amount of markup will make an assistant recommend it.
  - The legitimate version is genuine participation and earned citation: answering real
    "how do I find ship time" questions where they're already asked, getting listed on
    institutional and society resource pages, a Wikipedia mention if notability is ever met,
    and writing something citable about ETP vessel availability that others link to.
  - **Not** astroturfing: fake accounts and seeded praise violate Reddit's rules, get domains
    shadow-banned, and are the kind of thing a nonprofit cannot afford to be caught doing.
  - Slow lever. Training cutoffs mean anything published now shows up in models much later —
    but retrieval-augmented answers (assistants that search live) pick it up immediately, which
    makes it worth starting well before it pays off.
- **Make the vessel data legible to models**: clean semantic HTML, real headings, specs as text
  rather than only in images or map layers, one durable URL per vessel.
- **Structured data**: JSON-LD per vessel (already queued in the SEO plan) is the highest-leverage
  item — it's what both crawlers and answer engines read most reliably.
- **Be citable**: assistants cite pages that state facts plainly and carry a clear publisher.
  A short "about this data" page (sources, coverage, update cadence) is worth more here than
  marketing copy.
- **Don't block the crawlers** — check `robots.txt` against GPTBot, ClaudeBot, PerplexityBot,
  Google-Extended and decide deliberately rather than by default.
- **Measure it**: periodically ask the major assistants the questions a researcher would ask and
  record whether VesselConnect appears. There's no analytics for this yet; manual spot-checks are
  the state of the art.

## Operator-reported vessel location (scoped 2026-08-12)

Let operators keep their vessel's position fresh from the dashboard — "your current location
says X, update it with Y." GFW can't cover everyone (skips Great Lakes, ~242 vessels have no
coordinates at all), and the operator always knows best.

**v1 SHIPPED 2026-08-12** (with the dashboard work, uncommitted): table + index applied,
`POST /api/vessels/position` (canOperateVessel + Nominatim geocode), and the listing-card
LocationRow ("Last known: X · ship tracking/operator reported · date — Update" with inline
save). **Remaining: the public-map display below** — detail page + home map pins with the
"operator reported" legend.

**Data — never write into GFW-owned fields** (`vessel_last_port` / tracks are pipeline-owned
and would be clobbered on next sync; enrich-don't-overwrite in reverse). Own table,
insert-only, so we get a movement history for free:

```sql
create table vessel_position_reports (
  id          uuid primary key default gen_random_uuid(),
  vessel_id   integer not null references vessels(id) on delete cascade,
  user_id     uuid not null references profiles(id),
  port_text   text not null,          -- what the operator typed ("Dutch Harbor, AK")
  lat         numeric, lon numeric,   -- geocoded server-side (Nominatim, as vessels/update)
  reported_at timestamptz not null default now()
);
```

**Write path:** `POST /api/vessels/position`, authorized via `canOperateVessel()`; geocode
server-side; nullable lat/lon if geocode fails (port text still displays).

**Dashboard card:** small Leaflet map (dynamic ssr:false, as HomeMap) pinning the freshest of
(GFW last port, latest report), plus inline "Update location" text field on the listing card.

**Public display:** vessel detail map + home map show the freshest source, with a distinct
pin/legend — Adam wants a concise legend label, something like **"operator reported"** (vs the
implicit ship-tracking source). Freshness rule: newest of report.reported_at vs
vessel_last_port date wins.

## Vessel edit form: one unified Location section with a live map (scoped 2026-08-12)

The form's location data is scattered and miscategorized: "Home Port Location" and
"Operating Area" are separate collapsible sections, `ice_breaking` sits inside Operating Area
(`VesselEditForm.tsx:769` — it's a capability, not a location; move it to the physical/specs
section along with endurance + DPos if they fit better there), and the new current-location
reports aren't in the form at all.

**Target: one "Location" section** containing home port (PlaceAutocomplete-backed, as now),
operating area (text + the existing geojson map draw), and current location (the
vessel_position_reports flow from the dashboard card) — **all rendered live on a single map**
as the user edits, so they can see each layer (home-port pin, operating-area shape,
current-position pin) and verify it's right before saving. Building blocks all exist:
`PositionMap`, `PlaceAutocomplete`, the operating-area geojson editor already in the form,
`UpdateLocationModal`'s pick-or-pin pattern.

Queued behind: current dashboard/membership pile shipping, then this.

## Simplify messaging: one list, one read mechanism (scoped 2026-08-12)

**Window: the `messages` table has ZERO rows** (v0 shipped 8/3, never used; `vessel_inquiries`
already dropped). Schema changes are free until the first real message lands — do this before
promoting messaging anywhere.

**Keep** (the justified core): threads = root message with `thread_id = id`; two *sides* per
thread — the inquirer (a person) and the vessel (a position: any `vessel_operators` member).
Author-precedence in the reply route stays (thread author always replies as inquirer).

**Problems** (all four exist because "operator" used to be an identity):
1. Two parallel UIs over one table — `InquiryThread` (dashboard, operator side) and
   `InboxClient` (/inbox, inquirer side), ~190 lines of near-duplicate rendering. A user who
   operates one vessel and inquires about another has conversations split across two pages.
2. Two unread mechanisms — thread `status` (`new/read/responded`) for the operator side,
   `scientist_read_at` for the inquirer side. `status` conflates unread-tracking with funnel
   state; `responded` is derivable from who spoke last.
3. `author_role` is stored but derivable (author == thread author → inquirer side, else
   operator side).
4. Vestigial columns: `start_date`, `end_date` (old charter-inquiry idea, unused).

**Target:**
- **One thread list** in the dashboard Messages tab: every conversation the user is part of
  (threads they started ∪ threads on vessels they operate). Each row shows the counterpart —
  vessel name if you're the inquirer, inquirer name if it's your vessel. Merge
  InquiryThread + InboxClient into one component (ChatThread stays as the renderer).
  *(Partially done 2026-08-12: sent threads now render inline in the tab via InboxClient;
  /inbox and /profile/edit routes deleted, links updated in place. The two components still
  exist separately — the render-merge remains.)*
- **One thread per (user, vessel) pair** (Adam, 2026-08-12): ALREADY THE API BEHAVIOR —
  POST /api/messages appends to the caller's existing thread for that vessel (`existingRoot`).
  Parallel threads can only come from direct DB writes (test data did this on 8/12). Remaining
  work is just belt-and-braces: a partial unique index on root messages (author_id, vessel_id)
  so the invariant holds at the schema level too.
- **Symmetric read state:** replace `status` + `scientist_read_at` with two timestamps on the
  root (`inquirer_read_at`, `operator_read_at`) or a tiny `thread_reads(user_id, thread_id,
  read_at)` table (more general, works if co-operators return). `message_unread_count` RPC
  and the admin Messages tab funnel (status badges) both need matching updates — the admin
  view derives new/responded from last-message side + read timestamps instead.
- Keep `author_role` as a stored render label (harmless) OR derive it — decide at impl;
  dropping it touches ChatThread/admin views.
- Drop `start_date`/`end_date`.
- Emails unchanged (reply notifications already fan out per side).

**Sequencing:** UI merge first (no schema risk), then the read-state migration while the
table is still empty. Blocks nicely after the vessel_operators work ships.

## Notification preferences for all users

`profiles.notification_prefs` (jsonb, opt-out: missing key = subscribed, default `{}`) already
covers everyone — **no data backfill needed**. What's admin-shaped is the UI surface:
`NotificationPrefsMenu` renders only for operators/verified users and exposes only the
message pref, while admins get the full admin set. Work: define the user-facing pref keys
(messages, claim/submission status updates, newsletter?), show the menu to every signed-in
user, and make every outbound user email check its pref the way `wantsMessageEmails()` does.
(Adam, 2026-08-12: "start broad" — begin with one master key plus messages, split later.)

## Admin dashboard: "Scientists" tab → "Users" — DONE 2026-08-12

Display label renamed to "Users" (internal key stays `scientists` so admin-email deep links
`?tab=scientists` keep working); the operator chip now derives from vessel_operators
membership (`is_operator` in the /api/admin/scientists payload), so newly approved operators
badge correctly. Leftover cosmetics: the route name itself and internal state variable names
still say "scientists" — rename someday or never.

## Admin email stats footer — SHIPPED 2026-08-12

Implemented as specced below (RPC `get_signup_stats()`, appended once per `notifyAdmins()`
call, degrades to no-footer on error). Kept here for the one unbuilt extension: "of which N
arrived via ads" needs acquisition source (`gclid`/UTM) persisted into `profiles` at signup.

<details><summary>Original spec</summary>


Every automated email to admins should end with a small stats block so the team sees momentum
without opening the dashboard:

> **This month:** 25 researcher signups (+19% vs. last month) · 4 operator signups (−20%) ·
> 3 vessels listed (+50%)

- **Where:** one place — `notifyAdmins()` in `lib/admin-notify.ts` wraps every admin email, so
  append the footer there rather than editing each template in `lib/brevo.ts`. New notification
  types inherit it for free.
- **Data:** a single Postgres RPC (`get_signup_stats()` or similar) returning current-month and
  prior-month counts for: researcher signups, operator signups, vessels listed (and total actives
  for context). Aggregate in SQL, not JS (house rule). Month-over-month % computed from the two
  numbers; handle the divide-by-zero month gracefully ("n/a" not "+Infinity%").
- **Cost control:** these are cheap indexed counts, but don't run them once per recipient —
  compute the footer once per `notifyAdmins()` call. If volume ever grows, cache for an hour.
- **Failure mode:** footer generation must never break a notification — wrap it so a stats
  error degrades to "no footer," matching `notifyAdmins()`'s existing never-throw contract.
- Once Google Ads is live, a natural extension is adding "of which N arrived via ads" using the
  conversion data — but that requires storing acquisition source at signup, which is its own
  small feature (e.g. persist `gclid`/UTM into `profiles` at account creation).

</details>

## General

- **Email delivery monitoring**: Add webhook logging for Brevo delivery events.
