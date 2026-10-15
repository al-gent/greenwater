# Resource timeline — plan

Goal: one horizontal timeline (resources as rows, time across the top, entries as bars) that
serves three jobs with the same component and the same table:

1. **ARF schedule, prettier.** The UNOLS/MFP data already synced into `cruises`, rendered as a
   fleet view that people prefer over mfp.us.
2. **Monterey Bay consortium.** Small boats and crew across Hopkins, MLML, NOAA sanctuary,
   MBARI, UCSC. Day and half-day trips. The pain (Chris Tomlinson, 2026-07-30): decentralized
   scheduling, no visibility, word of mouth, crew availability is the real gate.
3. **Scheduling a cruise in VesselConnect.** Pick the roles you need, fill each with a resource,
   every resource is checked for availability before the cruise can be scheduled, then hand off
   to the existing cruise UX.

Companion to `CRUISE_SCHEDULING_PLAN.md`. Source notes for MFP in `mfp-api/README.md`.

## Principles

1. **The component knows nothing about cruises.** It takes resources, entries and a window.
   Nothing in its interface says vessel, captain or cruise. A dive shop could feed it rows.
2. **One table for occupancy.** A cruise assignment and a maintenance block are the same shape:
   *this resource is taken from A to B*. They differ only in whether `cruise_id` is set.
3. **A resource is a vessel or a person.** No org membership, no qualifications in v0. The
   person scheduling the cruise is responsible for choosing qualified people.
4. **Availability is temporal only.** "Is this resource free in this window" is the whole check.
   The database enforces it for VesselConnect-authored entries.
5. **Visibility lives on the entry.** Vessel occupancy is public. People's occupancy is visible to
   signed-in operators only. The component never decides this; the loader just does not hand it
   rows the viewer may not see. _(2026-09-30: the `people` table itself is publicly readable for
   now so seats resolve on public cruise pages; revisit before crew contact details are entered.)_
6. **We plug into other systems, we do not replace them.** MLML's forms, NOAA's Vessel Project
   Manager and MFP keep owning their bookings. We render them and route requests.
7. **Fixed pixels-per-day out of the box.** Responsive and user-adjustable scale come later; the
   default has to look good because that is how most people will use it.

## Component contract

```ts
// lib/timeline/types.ts — no imports from lib/cruises or lib/vessels
export interface TimelineResource {
  id: string                  // opaque; 'vessel:123', 'person:uuid'
  label: string
  sublabel?: string           // 'MLML', '56 ft'
  group?: string              // row-group header: operator / institution
  kind?: string               // 'vessel' | 'person' | anything; drives the row icon
  href?: string
  imageUrl?: string
}

export interface TimelineEntry {
  id: string
  resourceId: string
  start: string               // ISO timestamptz
  end: string
  label: string
  kind: 'item' | 'block'      // block = unavailable, hatched, no link
  status?: string             // caller-defined; maps to a color via `palette`
  href?: string
  detail?: string             // tooltip / title
}

export interface TimelineWindow {
  start: string               // ISO date; first visible day
  end: string                 // exclusive
  pxPerDay: number            // 4 for a year of ARF cruises, 36 for a month of day trips
}

export interface ResourceTimelineProps {
  resources: TimelineResource[]
  entries: TimelineEntry[]
  window: TimelineWindow
  palette?: Record<string, string>   // status -> tailwind classes; brand default built in
  today?: string
  emptyRowText?: string
}
```

Rendering rules:

- **Layout.** CSS grid. Sticky top axis (months, then days when `pxPerDay >= 24`). Sticky left
  column with group headers and resource labels. Horizontal scroll container for the axis+bars.
  Server-renderable: no hooks in the core. A thin client wrapper adds scroll-to-today and
  hover cards later.
- **Lanes.** Entries in one row that overlap get stacked into sub-lanes (greedy interval
  packing, about fifteen lines). MFP produces tentative/firm overlaps on the same vessel, so this
  is needed on day one.
- **Bars.** Position = `(start - window.start) / day * pxPerDay`, clipped at both window edges
  with a visual cue that the bar continues. Label truncates; full label in `title`. Sub-day
  precision (a 4-hour trip is a narrow bar, not a full day).
- **Blocks.** Hatched, muted, no link, label optional ("Yard", "Vacation").
- **Today marker.** Vertical line through all rows.
- **Palette.** Brand default: navy for scheduled/firm, teal for tentative, gold for underway,
  gray for completed, hatched gray for blocks. Callers can override per status.
- **Empty rows stay.** A boat with nothing scheduled is the point of the consortium view.

Files:

```
lib/timeline/types.ts          contract above
lib/timeline/lanes.ts          interval packing, pure, tested
components/timeline/ResourceTimeline.tsx   server component, no cruise imports
components/timeline/TimelineAxis.tsx
components/timeline/TimelineRow.tsx
lib/cruise-timeline.ts         adapter: cruises + timeline_entries -> resources/entries
```

## Data model

### timeline_entries

The occupancy index: which resource is taken, from when to when, and why. Nothing that needs a
join to explain lives here. Semantic facts (which vessel a cruise uses, what position a person
holds on it) live on `cruises` and `cruise_people`; the entry just says "busy".

```sql
create extension if not exists btree_gist;   -- lets one GiST index check vessel_id = AND range &&

create table timeline_entries (
  id          uuid primary key default gen_random_uuid(),
  -- exactly one of these names the resource
  vessel_id   integer references vessels(id) on delete cascade,
  person_id   uuid references people(id) on delete cascade,

  start_at    timestamptz not null,           -- instants, always
  end_at      timestamptz not null,
  all_day     boolean not null default false, -- true: treat as dates, snap to day boundaries in the display zone
  tz          text not null,                  -- IANA zone the user confirmed when entering; MFP rows 'UTC'

  cruise_id   uuid references cruises(id) on delete cascade,  -- set = assignment; null = block
  label       text,                           -- block reason, free text: 'Haul-out', 'In the yard'
  notes       text,

  source      text not null default 'vesselconnect',   -- vesselconnect | unols_mfp | (future: mlml, noaa_vpm)
  visibility  text not null default 'operators',       -- public | operators | private; vessel path sets public explicitly
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  check (end_at > start_at),
  check ((vessel_id is null) <> (person_id is null)),
  check (cruise_id is not null or label is not null),
  -- No double booking for rows we author. Half-open ranges: back-to-back is fine.
  -- MFP tentative/firm overlaps are outside the predicate and import cleanly.
  -- Cross-source overlaps (operator block vs MFP cruise) are reported by the RPC, not enforced.
  constraint no_vessel_overlap exclude using gist
    (vessel_id with =, tstzrange(start_at, end_at) with &&)
    where (vessel_id is not null and source = 'vesselconnect'),
  constraint no_person_overlap exclude using gist
    (person_id with =, tstzrange(start_at, end_at) with &&)
    where (person_id is not null and source = 'vesselconnect')
);
create index on timeline_entries (vessel_id, start_at);
create index on timeline_entries (person_id, start_at);
create index on timeline_entries (cruise_id);
```

Time zones: store instants; the form shows the zone it is interpreting in (browser default,
user can change) and the entry records it in `tz`. The component takes a `timeZone` prop and
does all day-boundary math in it (UTC for the ARF page, America/Los_Angeles for the consortium
page). `all_day` rows ignore time-of-day and snap to that zone's day boundaries.

Sync: `lib/timeline-service.ts` (not triggers — logic stays editable in TypeScript) updates the entry's window when mobilization / departure / arrival
/ demobilization change. Window = `coalesce(mobilization_at, departure_at)` to
`coalesce(demobilization_at, arrival_at)`; if they collapse to the same instant, floor to one
day. Backfill inserts one entry per existing cruise with `source` copied from the cruise and
`tz = 'UTC'`, `all_day = true` for MFP rows.

Permissions: operators block their own vessels; admins any vessel. Deferred until real usage.

### People and vocabularies

One migration creates everything in dependency order: cruise_roles, credentials, people,
people_credentials, timeline_entries, cruise_people. `organizations` already exists
(`20260923_cruises.sql`) with `vessels.organization_id`; people point at it the same way.

Global directory: any signed-in operator can see and schedule any person. MFP already
publishes chief scientists and operator contacts by name. No person pages indexed by Google.

```sql
-- ---------- vocabularies (seeded, operators can add) ----------

-- Jobs aboard. Crew and science party share one list so a cruise's people are one table.
create table cruise_roles (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- 'captain', 'mate', 'chief_scientist'
  label       text not null,
  kind        text not null,                 -- 'crew' | 'science'
  sort        integer not null default 100,
  created_by  uuid references profiles(id)   -- null = seed
);
-- seed crew:    captain, mate, engineer, deckhand, operator (small boat), marine_tech,
--               dive_safety_officer, medic
-- seed science: chief_scientist, pi, co_pi, scientist, technician, student, observer
-- both:         other

-- What a person can hold. USCG MMC endorsements plus the research-world ones.
create table credentials (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,          -- 'uscg_master_100_nc', 'uscg_oupv', 'aaus_dso', 'stcw_basic', 'sci_boat_operator'
  label       text not null,                 -- 'USCG Master 100 GRT Near Coastal'
  issuer      text,                          -- 'USCG', 'AAUS', 'UC', 'Stanford'
  sort        integer not null default 100,
  created_by  uuid references profiles(id)   -- null = seed
);

-- ---------- people ----------

create table people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  phone       text,
  organization_id uuid references organizations(id),  -- exists already (cruise migration); vessels have it too
  affiliation text,                          -- as-entered fallback when no org row yet (MFP science party)
  profile_id  uuid unique references profiles(id),   -- null until they sign up
  external_id text,                          -- MFP Person_id, for sync
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index people_email_key on people (lower(email)) where email is not null;
create unique index people_external_key on people (external_id) where external_id is not null;

-- What a person holds. Not verified in v0; shown to the booker.
create table people_credentials (
  person_id     uuid not null references people(id) on delete cascade,
  credential_id uuid not null references credentials(id),
  number        text,
  expires_at    date,
  notes         text,
  primary key (person_id, credential_id)
);

-- ---------- who is on a cruise, in what seat ----------

-- One row per seat. person_id null = open slot the planner still needs to fill.
-- The set of rows IS the cruise's requirements; the planner creates them, so nothing
-- about crew needs lives on cruises or vessels.
-- A seat may cover only part of the cruise (crew rotation at a port stop, AM/PM operators):
-- start_at/end_at null = whole cruise. Two captain rows with different windows = a rotation.
create table cruise_people (
  id            uuid primary key default gen_random_uuid(),
  cruise_id     uuid not null references cruises(id) on delete cascade,
  role_id   uuid not null references cruise_roles(id),
  person_id     uuid references people(id) on delete set null,
  start_at      timestamptz,                 -- null = cruise start
  end_at        timestamptz,                 -- null = cruise end
  name          text,                        -- as-entered fallback when no person record (MFP science party)
  notes         text,
  external_id   text,                        -- MFP Person_id on the science-party side
  created_at    timestamptz not null default now(),
  check (start_at is null or end_at is null or end_at > start_at)
  -- no check on person/name: both null = an open slot
  -- no unique on (cruise, person): one person may hold two seats in sequence; the
  -- person exclusion constraint on timeline_entries is what stops self-overlap.
);
create index on cruise_people (cruise_id);
create index on cruise_people (person_id);
```

Flow: filling a seat inserts the `cruise_people.person_id` and the person's `timeline_entries`
row (window = seat window, falling back to the cruise window) in one transaction. The
exclusion constraint rejects the transaction if the person is already busy; the API surfaces
which entry collided. Clearing a seat deletes the entry.

Sync trigger rules: the vessel entry always follows the cruise window (and moves if
`vessel_id` changes). A person entry for a seat with null bounds follows the cruise; one with
explicit bounds keeps them, clamped to the cruise if it shrinks. A mid-cruise vessel swap is
not modeled in v0 (change `vessel_id`, or split the cruise); legs already carry dates if it is
ever needed.

Deferred, not v0: `position_credentials` (which credentials satisfy a position) for gating;
per-vessel default seats to pre-fill `cruise_people` when a vessel is chosen.

Keeping assignment windows in sync with the cruise: a trigger on `cruises` updates
`start_at`/`end_at` of its assignment entries whenever mobilization/departure/arrival/
demobilization change. Occupancy = `coalesce(mobilization_at, departure_at)` to
`coalesce(demobilization_at, arrival_at)`, because the boat and crew are busy during mob/demob.

Availability check, as an RPC so the scheduling form and the constraint agree:

```sql
create function timeline_conflicts(p_vessel_ids int[], p_person_ids uuid[], p_start timestamptz, p_end timestamptz, p_ignore_cruise uuid default null)
returns setof timeline_entries language sql stable as $$
  select * from timeline_entries
  where tstzrange(start_at, end_at) && tstzrange(p_start, p_end)
    and (vessel_id = any(p_vessel_ids) or person_id = any(p_person_ids))
    and (p_ignore_cruise is null or cruise_id is distinct from p_ignore_cruise)
$$;
```

RLS: `public` rows readable by anon; `operators` rows readable by any signed-in operator;
`private` rows by `created_by` and admins. Insert/update via the API only, using the
service-role client with an explicit operator check, same pattern as `/api/vessels/update`.

Mirror everything into `scripts/schema.sql` (feedback: migrations + schema.sql together).

## Phases

**Phase 0 — component on ARF data, no migration.** _Built 2026-09-30: `/cruises?view=timeline`._
Build `ResourceTimeline` and the adapter. Adapter reads `cruises` directly (vessel_id +
dates), one entry per cruise, grouped by operator organization. Ship it on `/cruises` as a
"Timeline" toggle beside the existing month list. Window: today minus one month to today plus
eleven; `pxPerDay` 4. This exercises axis, lanes, clipping, sticky headers, palette and today
marker against ~50 vessels and a few hundred cruises. Design pass here: this is the view we
want people to open instead of mfp.us.

**Phase 1 — the migration, vessels only in the UI.**
One migration: all tables above, constraints, trigger, RPC, RLS, seeds for cruise_roles and
credentials. Backfill one vessel entry per existing cruise (`source` copied from the cruise).
MFP importer writes/updates entries and lands its science party in `cruise_people`.
Adapter switches from reading cruises to reading entries joined to cruises. Operators get
"mark unavailable" on their vessel (a block) from the dashboard.

**Phase 2 — people in the UI.**
No schema. Operators add people, their credentials and organization from the dashboard.
Person rows appear on the
timeline for signed-in operators, with a resource-kind filter (vessels / people / both) in the
page toolbar. People blocks (vacation).

**Phase 3 — scheduling flow.**
Cruise form gains a "people" step: add the seats this cruise needs (position rows in
`cruise_people`), fill each with a person, live conflict list from `timeline_conflicts`, save blocked until clear. On save the assignments are
inserted in one transaction; the exclusion constraint is the backstop for races. Then the
existing cruise detail UX takes over.

**Phase 4 — consortium view.**
A `/timeline` page scoped to a region or organization set, `pxPerDay` 36, two-week default
window, AM/PM axis ticks. Requests route to the existing inquiry flow. This is what Hopkins,
MLML and the sanctuary would look at.

**Phase 5 — scale and preferences.**
Fit-to-viewport scale, zoom presets (week / month / quarter / year), remembered per user.
Hover cards. Mobile layout (labels collapse to initials, axis to weeks).

## Open items

- **Foreign bookings.** MLML forms and NOAA VPM have no API we know of. Phase 4 assumes those
  operators enter or import their bookings; a `source` value per system is reserved so a
  scraper or CSV import can land rows later without a schema change.
- **Draft cruises (decided).** A draft cruise's vessel entry exists (the boat is reserved, the
  conflict check needs it) with `visibility = 'operators'`; the sync trigger flips it to
  `public` when `published_at` is set. No fourth visibility value.
- **Where it lives (decided).** `/cruises?view=timeline` for the ARF view, same loader and
  filters as the list. The consortium view (Phase 4) is its own page: different window, zone.
- **Which people are "resources" for a public viewer.** Never. Confirmed above; noting it so
  it does not get relaxed by accident.
