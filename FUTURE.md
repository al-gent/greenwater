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

## General

- **Email delivery monitoring**: Add webhook logging for Brevo delivery events.
