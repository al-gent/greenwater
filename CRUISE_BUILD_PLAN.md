# Cruise planning — build order

What is designed but not built, in the order to build it. Design lives in
`CRUISE_SCHEDULING_PLAN.md` (cruise, legs, stops, hops, projects, equipment, berths) and
`RESOURCE_TIMELINE_PLAN.md` (timeline entries, people, positions, credentials, seats).
This file is only the sequence, the dependencies, and what "done" looks like for each step.

Ground rules from earlier decisions: the DB is shared prod and dev runs against it; the cruise
code is not pushed, so migrations can create+merge+drop in one go and nothing needs redirects.
Run each migration before pushing the code that reads it. The MFP importer/harvester stay
frozen unless the API key arrives; the 2026-09-17 snapshot is seed data.

## Live today

| Table | Rows | Read by |
|---|---|---|
| organizations | 16 | cruise pages |
| cruises | 1,723 (MFP) | list, detail, timeline |
| cruise_legs | 2,027 | detail, map, calendar |
| cruise_stops / cruise_hops | 15,549 / 11,386 | nothing yet |

Code, all uncommitted on `feature/cruise-schedules`: `/cruises` list + timeline toggle,
`/cruises/[slug]`, map, month calendar, `components/timeline/*`, loaders, importers.

## Milestones

### M1 — Projects split. DONE 2026-09-30.
- Run `20260930_cruise_projects.sql` (creates `cruise_projects`, merges 279 co-scheduled rows
  into 199 sailings, drops `external_id`/`raw`/hooks from `cruises`).
- Code already reads projects (detail page "Projects aboard", science party from projects,
  "+N" on list and timeline).
- Done: cruises 1,723 → 1,444 (identical windows) → 1,434 (contained piggybacks, 2026-10-01), projects 1,723, no orphans.
  SR2617 shows 3 projects, one bar "+2". Headcount on merged cruises = max across projects
  (MFP forms mix whole-cruise and per-project counts; 108 cruises exceed vessel berths, but
  that predates the merge — vessels.scientists is unreliable).

### M2 — Equipment. DONE 2026-09-30.
- Done: `equipment_types` (75, incl. CTD/ADCP/multibeam/crane/A-frame/ROV/AUV/HOV/diving that
  MFP lacks), `equipment` (1,013 units), `equipment_locations` (one open stay each; 767 aboard
  a vessel), `cruise_equipment` (empty). No pooled flag (QUIRKS #15); NDSF
  vehicles absent (QUIRKS #16) — add Jason/Alvin/Sentry by hand as pooled WHOI units.
- Done: `scripts/backfill_cruise_equipment.mjs` wrote 8,073 gear lines on 1,250 cruises from
  the SME forms (labels as printed, 99% typed, grouped ship / pool / science party); detail
  page shows them. No unit-level history exists in MFP (forms are category checkboxes), so
  `equipment_locations` holds only the seeded current stay per unit.
- Optional later: `/vessels/[id]` lists what is aboard (view `equipment_current_location`);
  ship-fitted units derived from the vessels.* capability columns (~400 rows).

### M3 — Timeline entries + people. DONE 2026-09-30.
One migration, dependency order: `positions`, `credentials`, `people`, `people_credentials`,
`timeline_entries` (vessel | person | equipment: exactly one), `cruise_people`, conflicts RPC,
cruise-dates sync trigger (vessel entry follows the cruise; seat entries follow their window;
visibility mirrors `published_at`), RLS, seeds, backfill one vessel entry per cruise (all-day, UTC).
- `lib/cruise-timeline.ts` switches from reading cruises to entries joined to cruises.
- Done when: timeline renders identically from entries; `select timeline_conflicts(...)` returns
  the right rows for a known overlap; inserting a second vesselconnect entry on the same vessel
  and window is rejected by the constraint.

### M4 — REFRAMED 2026-10-13: projects + bids (researcher initiates, operator bids, confirm → cruise). BUILT 10/14–16.
- `/projects/new`, `/projects/<slug>`, `/projects/<slug>/edit`, `/projects/<slug>/bid`; dashboard Projects tab (own projects
  with bid tallies + bids you've made with Confirm). API: `/api/projects`, `/api/projects/[id]`,
  `/api/projects/[id]/bids`, `/api/projects/[id]/bids/[bidId]` (accept/decline/update/withdraw/confirm),
  `/api/timeline/conflicts`. Confirm creates the cruise (published, confirmed), copies people → seats
  and bid gear → cruise_equipment, syncs entries; refuses if the vessel is no longer free.
- Operator's own calendar DONE 10/16: "Update availability" modal (`AvailabilityModal`, from the vessel
  page and each dashboard listing) adds/removes public blocks via `/api/timeline/blocks`; conflicts
  with cruises are refused and named. Drag-to-create on the timeline: later.
- Notifications DONE 10/16 (`lib/project-notify.ts`, templates in `lib/brevo.ts`): bid offered → author;
  accepted → vessel operators (confirm nudge); confirmed → author (cruise link); declined → operators;
  withdrawn → author. Honour the 'messages' pref; fire-and-forget. In dev, Brevo redirects to
  ADMIN_NOTIFY_DEV_EMAIL or drops.
- Remaining: people linking to the directory.

### M4-old — Operator authoring form (superseded; kept for reference).
Permission = membership in `vessel_operators` for the cruise's vessel (same check as
`/api/vessels/update`), admins anywhere.
- API: `POST/PATCH /api/cruises` (basics, dates, vessel), `PATCH …/publish`, `…/legs` (replace
  set), `…/projects` (at least one project per cruise: title, PI, reference).
- Every create/update writes the vessel's timeline entry in the same transaction; a conflict
  comes back as a 409 naming the colliding entry.
- Dashboard: "Cruises" tab listing the operator's cruises by stage; form with sections
  basics → dates (with confirmed time zone) → legs/ports → projects → berths (`berths_open`).
- Blocks: "mark unavailable" on a vessel from the dashboard (a labelled entry, no cruise).
- Done when: an operator creates a draft, sees it on their own timeline (operators-only
  visibility), publishes it, and it appears publicly on `/cruises`; a second cruise on the same
  dates is refused with the reason.

### M5 — People on projects and cruises. Needs M3.
- `project_people` mirrors `cruise_people`: project, role (shared `cruise_roles` list), person
  when known, name fallback. Replaces `projects.pi_name`. Form: repeating row of role + person
  picker (search the directory, "add someone new" when no match); the creator is a PI row by
  default. On bid confirm these copy to the cruise as science-party seats. People are LINKED,
  not just listed (Adam, 2026-10-15). Crew seats stay the operator's.
- People directory in the dashboard: add a person, credentials with expiry, organization.
- Cruise form gains "People aboard": add seats by position (with optional window for rotation),
  fill from the directory (candidates sorted by position), live conflicts via the RPC.
- "Equipment": lines with a type picker and free text; choosing a pooled item creates its
  timeline entry and is conflict-checked like a person.
- Done when: filling a captain who is already at sea that week is refused and the form says
  on which cruise; the captain's row on the timeline shows both seats.

### M6 — Berth requests. Needs M1 (requests point at a sailing).
- `berth_requests` (cruise_id, profile_id, party size, message, status) per the cruise plan;
  `POST /api/berth-requests`; operator sees them on the cruise in the dashboard; accept/decline
  updates `berths_open`; notifications via the existing messaging/Brevo paths.
- Cruise page: "Request a berth" when `berths_open` > 0 or unknown.
- Done when: a researcher requests, the operator accepts, `berths_open` decrements, both get
  the email.

### M7 — Consortium view. Needs M3, M5.
- `/timeline` scoped to an organization set or region; opens at week scale in the viewer's
  zone (scales, hour tier and zone handling already exist); vessels + people (+ equipment)
  rows for signed-in operators, vessels only for the public; "request this boat" routes to
  the inquiry flow.
- Done when: Hopkins can see Vita, the Grady White, MLML's boats and their operators on one
  screen and answer "is any boat free Thursday".

### M7b — Timeline on the homepage, driven by search. Not yet; Adam's direction 2026-10-01.
`FleetTimeline` is a drop-in block (`<FleetTimeline basePath="/" />`). The plan is to put it on
the homepage and have it show the schedules of whatever vessels the existing search/filters
return (location, country, activity…), instead of growing its own vessel filter. Rows = the
search result set; the timeline's own toolbar stays (Today, scale, row height). That is the
answer to "what happens with 200 rows": the homepage filters already narrow the fleet, and
the timeline just reflects them. Needs: `getArfFleet()` generalised to "resources for these
vessel ids", `HomeClient`'s filter state passed to the block (client-side, since the filters
are client state), and the entries API accepting a vessel-id list.

### M6b — Route editing on the cruise page. Deferred until there are real users (Adam, 2026-10-16).
Operator and project authors edit the route together, on the cruise page, with an "Edit route"
mode; every edit stamped with who made it. Three layers matching the tables: legs (port→port
with dates; add a port via the place search), stops (stations/moorings/waypoints in sailing
order, added by clicking the map, hours on station), hops (never edited: regenerated between
consecutive stops, hours = distance / vessel cruise speed; planned time shown against booked
days). Operating area on the cruise is the operator's, seeded from the project at confirm,
editable in the same mode. MFP routes show read-only. Cheap first cut when wanted: read-only
itinerary from cruise_stops/cruise_hops on the page, legs editable in the list only.

### M8 — Finish and polish. Anytime; do the first three before pushing.
- Delete `app/tmp-cruise/` (reads gitignored files; would fail on Vercel).
- Commit the uncommitted work; the live schema has three migrations only one of which is in git.
- Links: nav entry for Cruises; vessel page lists its upcoming cruises with a timeline link.
- Detail page reads `cruise_stops`/`cruise_hops` for the itinerary instead of deriving it from
  GeoJSON client-side (or drop `lib/cruise-route.ts`).
- Timeline: DONE 2026-10-01 — day/week/month/year scales (`?scale=&at=&rows=`), endless
  horizontal lazy loading (`TimelineViewport`, `/api/timeline/vessels`), hour tier + now-line,
  day/hour gridlines, fixed fleet rows, viewer time zone (cookie or saved preference), scale
  and row-height preferences, bar labels = title — operating area (no cruise codes), hover
  cards with "Message the operator" (inquiry flow seeded with the cruise), one packaged block
  `components/FleetTimeline.tsx`. Remaining: mobile axis; a "back to today" nudge when today
  is off-screen; record the cruise on messages sent from the card (M6).

## Dependencies at a glance

```
M1 projects ─┬─> M6 berth requests
             └─> M3 entries+people ─┬─> M4 authoring ──> M5 seats+equipment ──> M7 consortium
M2 equipment ────────────────────────┘                          ▲
                                                                 └── M2 (pooled items as resources)
M8 anytime
```

M1 and M2 are ready to run now. M3 is the next migration to write. M4 is the largest piece of
code and the one every operator-facing feature waits on.
