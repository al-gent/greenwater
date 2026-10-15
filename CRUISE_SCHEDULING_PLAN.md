# Cruise scheduling — v0 data model

Goal: operators plan cruises in VesselConnect (legs, ports, dates, operating area, science party,
gear); published plans appear alongside the U.S. Academic Research Fleet schedule (UNOLS/MFP);
researchers find and request vacant berths. **v0 = get the data structure right; the view iterates
later.** Source investigation: `mfp-api/README.md`.

## Principles

1. **A cruise is its own entity that references a vessel** (MFP's model: a cruise *application* is
   parked on a vessel's calendar as a VoyageEvent; the vessel can be unassigned or change).
2. **One table for both sources.** ARF cruises synced from MFP and operator-authored plans live in the
   same `cruises` table, distinguished by `source`. Everything the UI does (map, list, berth requests)
   works off one shape.
3. **Keep the free text, add the link.** Equipment, people, ports and organizations all keep the
   as-entered label and get a nullable FK that gets filled when we can resolve it.
4. **Requested ≠ scheduled.** Store the PI's requested window separately from the scheduled dates;
   never overwrite one with the other.
5. **Berths are ours.** MFP has no berth concept. `berths_total` comes from the vessel, `berths_open`
   is operator-maintained and null means "unknown", never 0.

## Entities

```
organizations ──< vessels (organization_id)
organizations ──< cruises (organization_id)
vessels       ──< cruises (vessel_id, nullable)
cruises       ──< cruise_legs        >── ports (depart / arrive)
cruises       ──< cruise_people      >── profiles (nullable), organizations (nullable)
cruises       ──< cruise_funding
cruises       ──< cruise_features    (GeoJSON pieces: transects, stations, moorings, area…)
cruises       ──< cruise_equipment   >── equipment (nullable) >── equipment_types
cruises       ──< berth_requests     >── profiles
equipment     >── vessels / organizations
```

## DDL sketch (not a migration yet)

```sql
-- ---------- organizations ----------
-- Operators, institutions, agencies. Today this is only text on vessels (operator_name/owner/affiliation).
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  short_name    text,                         -- 'SIO', 'WHOI'
  kind          text not null default 'operator', -- operator | institution | agency | company | other
  country       text,
  website       text,
  grid_id       text,                         -- 'grid.266100.3' (MFP uses GRID); ROR is the successor
  ror_id        text,
  mfp_organisation_id integer,                -- MFP Organisation_id (13 = BIOS …) for sync joins
  created_at    timestamptz not null default now(),
  unique (mfp_organisation_id)
);
alter table vessels add column organization_id uuid references organizations(id);
-- backfill: distinct vessels.operator_name -> organizations; the 16 MFP operator orgs get mfp_organisation_id.

-- ---------- ports ----------
create table ports (
  id            uuid primary key default gen_random_uuid(),
  unlocode      text unique,                  -- 'USLWP'; null for operator-defined spots
  name          text not null,
  subdivision   text,                         -- state / province
  country_code  text,
  lat           double precision,
  lon           double precision,
  source        text not null default 'vesselconnect' -- vesselconnect | unlocode | unols_mfp
);
-- seed: ~200 distinct LOCODEs in the MFP data (name, subdivision, country, lat/lon all present).

-- ---------- cruises ----------
create table cruises (
  id                uuid primary key default gen_random_uuid(),
  source            text not null default 'vesselconnect',  -- vesselconnect | unols_mfp
  external_id       text,                                   -- MFP CruiseApplication_id
  external_refs     jsonb,                                  -- {workflow_id, voyage_event_id, cruise_id, organisation_id, reference_number}
  organization_id   uuid references organizations(id),
  vessel_id         integer references vessels(id),         -- null = not yet assigned
  created_by        uuid references profiles(id),           -- null for synced rows

  title             text not null,
  short_name        text,
  cruise_code       text,                                   -- operator code: 'AR84-03', 'SKQ2610S'
  kind              text not null default 'science',        -- science | transit | charter | maintenance | outreach | inspection | other
  status            text not null default 'draft',          -- draft | tentative | scheduled | firm | underway | completed | cancelled
  visibility        text not null default 'private',        -- private | published

  -- scheduled (the calendar)
  mobilization_at   timestamptz,
  departure_at      timestamptz,
  arrival_at        timestamptz,
  demobilization_at timestamptz,
  actual_departure_at timestamptz,
  actual_arrival_at   timestamptz,

  -- requested (the PI's ask; drives "flexible dates" display while tentative)
  requested_start_earliest date,
  requested_start_latest   date,
  requested_science_days   numeric,
  requested_mob_days       numeric,
  requested_demob_days     numeric,

  -- where
  operating_area_text text,                                 -- 'Washington shelf, 5-30 nm offshore'
  area_geojson      jsonb,                                  -- union/summary geometry for the map (features table has detail)
  bbox              double precision[4],                    -- [w, s, e, n] for cheap map-viewport queries

  -- who / how many
  science_party_size integer,                               -- requested or planned headcount
  operator_techs     integer,
  berths_total       integer,                               -- snapshot from vessels.scientists at publish; editable
  berths_open        integer,                               -- operator-maintained; null = unknown
  berths_open_updated_at timestamptz,

  summary           text,
  notes             text,
  raw               jsonb,                                  -- source payload (synced rows) for re-derivation
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source, external_id)
);
create index on cruises (vessel_id, departure_at);
create index on cruises (status, departure_at) where visibility = 'published';

-- ---------- legs ----------
create table cruise_legs (
  id              uuid primary key default gen_random_uuid(),
  cruise_id       uuid not null references cruises(id) on delete cascade,
  seq             integer not null,
  depart_port_id  uuid references ports(id),
  arrive_port_id  uuid references ports(id),
  depart_port_text text,                                    -- as entered, kept even when linked
  arrive_port_text text,
  depart_at       timestamptz,
  arrive_at       timestamptz,
  mobilization_at timestamptz,
  demobilization_at timestamptz,
  external_id     text,                                     -- MFP Legs[].Destination_id
  notes           text,
  unique (cruise_id, seq)
);

-- ---------- people ----------
create table cruise_people (
  id              uuid primary key default gen_random_uuid(),
  cruise_id       uuid not null references cruises(id) on delete cascade,
  profile_id      uuid references profiles(id),             -- linked VesselConnect user, if any
  organization_id uuid references organizations(id),
  name            text not null,
  organization_text text,
  role            text not null,                            -- pi | co_pi | chief_scientist | scientist | technician | student | observer | other
  email           text,
  on_voyage       boolean,
  external_id     text                                      -- MFP Person_id
);

-- ---------- funding ----------
create table cruise_funding (
  id            uuid primary key default gen_random_uuid(),
  cruise_id     uuid not null references cruises(id) on delete cascade,
  agency_code   text,                                       -- 'NSF/OCE', 'NAVY', 'NOAA', 'INST'
  agency_name   text,
  grant_number  text,
  days          numeric,
  status        text                                        -- funded | pending | declined | withdrawn | unknown
);

-- ---------- map features ----------
create table cruise_features (
  id          uuid primary key default gen_random_uuid(),
  cruise_id   uuid not null references cruises(id) on delete cascade,
  kind        text not null,                                -- transect | station | mooring | lander | rov | auv | glider | waypoint | area | bounds | port | other
  name        text,
  seq         integer,
  geometry    jsonb not null,                               -- GeoJSON geometry
  properties  jsonb,                                        -- TravelTime, ShipSpeed, TimeAtStation, ExpectedSeaDepth…
  external_id text
);
create index on cruise_features (cruise_id);

-- ---------- equipment ----------
create table equipment_types (                              -- canonical taxonomy
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,                         -- 'CTD rosette', 'Multibeam (shallow)', 'Stern A-frame'
  category    text,                                         -- ship_fitted | pooled | sampling | vehicle | lab | nav | other
  parent_id   uuid references equipment_types(id),
  synonyms    text[]                                        -- for matching free text
);
create table equipment (                                    -- a unit (the inventory); seed the 1,013-row ARF inventory
  id                uuid primary key default gen_random_uuid(),
  equipment_type_id uuid references equipment_types(id),
  organization_id   uuid references organizations(id),      -- owner
  name              text not null,
  model             text, manufacturer text, serial_number text,   -- no model layer yet; add as one column if needed
  source            text not null default 'vesselconnect',
  external_id       text                                    -- MFP Equipment_id
);
create table equipment_locations (                          -- where a unit is: a log of stays, to_at null = now
  equipment_id uuid references equipment(id), vessel_id integer references vessels(id),
  organization_id uuid references organizations(id), place text, from_at timestamptz, to_at timestamptz,
  cruise_id uuid references cruises(id)                     -- the cruise that moved it
);
-- Availability (maintenance, out of service) is a block on timeline_entries with equipment_id, not a column here.
create table cruise_equipment (                             -- "keep the free text, add the link"
  id                uuid primary key default gen_random_uuid(),
  cruise_id         uuid not null references cruises(id) on delete cascade,
  label             text not null,                          -- as entered / as printed on the SME form
  equipment_type_id uuid references equipment_types(id),    -- filled when matched
  equipment_id      uuid references equipment(id),          -- filled when a specific item is chosen
  provided_by       text,                                   -- ship | pool | science_party
  quantity          integer,
  notes             text
);

-- ---------- berth requests (v0.1, once cruises exist) ----------
create table berth_requests (
  id            uuid primary key default gen_random_uuid(),
  cruise_id     uuid not null references cruises(id) on delete cascade,
  requester_id  uuid not null references profiles(id),
  seats         integer not null default 1,
  message       text,
  status        text not null default 'pending',            -- pending | accepted | declined | withdrawn
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);
```

## MFP → cruises mapping (sync)

| MFP (decoded gridtimeline) | cruises |
|---|---|
| `CruiseApplication_id` | `external_id` (dedupe key: `('unols_mfp', id)`) |
| `Workflow_id`, `Cruise.VoyageEvent_id`, `Cruise_id`, `Organisation_id`, `Workflow.ReferenceNumber` | `external_refs` |
| `Cruise.Start.Voyage.FlexLocation` (parked vessel) | `vessel_id` via ICES/MMSI/name → `vessels` (`Ships[]` is the PI wish list; ignore except for status) |
| `Organisation_id` | `organization_id` via `organizations.mfp_organisation_id` |
| `Name` / `ShortName` / `Workflow.AlternateReferenceNumber` | `title` / `short_name` / `cruise_code` |
| `VoyageEventTypeName` | `kind` (At Sea for Science, Science → science; Transit Cruise, Passage → transit; Charter/Barter → charter; Inspection, Outreach → same) |
| derived ladder (README) | `status` (Sailed → completed/underway by date; Firm; Scheduled; Tentative; Hide → cancelled + `visibility='private'`) |
| `Cruise.Start/End.{MobilisationDate, Departure, Arrival, DemobilisationDate, Actual*}` | scheduled + actual timestamps |
| `StartDate`, `LatestEndDate`, `PreferredDuration`, `Mob/DemobilisationDays` | `requested_*` |
| `ScienceLocationGeneral` | `operating_area_text` |
| `Read_CruiseApplicationGEOJson` features | `cruise_features` (Type → kind), `bbox` + `area_geojson` derived |
| `Legs[]` | `cruise_legs`, ports upserted by LOCODE |
| `Users[]` (PI, CS) | `cruise_people` |
| `DestinationFundings[]` | `cruise_funding` |
| SME pane: science party size, techs, equipment lists | `science_party_size`, `operator_techs`, `cruise_equipment` (labels; types matched by synonym) |
| `EquipmentTypes[]` / `Equipment[]` ids | **dropped** — no public lookup |

Cadence: daily; fetch `gridtimeline` for `[today−30d, today+3y]`, GeoJSON + SME pane only for
changed/new ids (hash of the decoded record). Rows absent for 2 runs → `status='cancelled'`.

## Operator-authored cruise (same table)

`source='vesselconnect'`, `created_by` = operator, `organization_id` = their org, `vessel_id`
required at publish. Form sections mirror the columns: basics → dates (scheduled, or requested
window if not fixed) → legs/ports → area (draw or pick a saved operating area) → science party &
berths → equipment (type picker + free text). `status` is operator-set (draft → tentative → scheduled
→ firm); `berths_open` is the number they're offering.

## v0.1 — cruises are what the vessel does; projects are why (2026-09-30)

Found while building the resource timeline (`RESOURCE_TIMELINE_PLAN.md`): 8 of 115 upcoming
MFP vessel-windows hold two or more applications on identical dates (18 rows); across the
whole history it is 199 sailings absorbing 279 extra rows out of 1,681 live MFP cruises, about
one in six (Atlantic Explorer runs BATS + Hydrostation S together on nearly every sailing;
Atlantis and Thompson file Alvin/Jason engineering dives as separate applications). E.g. BIOS's
Nov 16–22 sailing is Hydrostation S + ICONIC + BATS Bloom as three records; Sally Ride's
Oct 31 sailing is CalCOFI + a second CalCOFI requester + an eDNA add-on. MFP models funded
*applications* (its unit of accounting: NSF pays per day per award); co-scheduling is expressed
only by giving them the same dates. There is no shared key: cruise_id, voyage_event_id and
workflow_id all differ per application.

For us the vessel leaves port once. So:

- **`cruises` = one vessel, one departure, one return.** Keeps the physical facts: vessel, dates,
  legs, ports, operating area, science party total, berths, cruise code. The timeline draws these;
  berth requests point at these; people, equipment and features attach here.
- **`cruise_projects` = the funded work aboard.** One or more per cruise. What MFP calls a cruise.
  Carries the title, PI, reference number, funding, requested window, this project's headcount,
  and all MFP ids. The "Requested ≠ scheduled" principle lives here: the requested window
  belongs to the award, not the ship.

```sql
create table cruise_projects (
  id              uuid primary key default gen_random_uuid(),
  cruise_id       uuid not null references cruises(id) on delete cascade,
  title           text not null,
  reference       text,                    -- MFP Workflow.ReferenceNumber '26/6947', or operator's own
  pi_name         text,                    -- as entered
  pi_person_id    uuid,                    -- -> people(id) once that table exists (timeline plan)
  funding_source  text,
  discipline      text,
  requested_start_earliest date,
  requested_start_latest   date,
  requested_science_days   numeric,
  science_party_size integer,              -- this project's headcount; cruises.science_party_size = sum
  summary         text,
  source          text not null default 'vesselconnect',
  external_id     text,                    -- MFP CruiseApplication_id (moves here from cruises)
  external_refs   jsonb,                   -- {workflow_id, cruise_id, voyage_event_id, organisation_id, derived_status}
  raw             jsonb,                   -- the application payload (moves here from cruises)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on cruise_projects (cruise_id);
create unique index cruise_projects_external_key on cruise_projects (source, external_id) where external_id is not null;
```

Changes to `cruises`:

- `title`: derived from the single project when there is one; operator-editable when there are
  several ("BATS Bloom + Hydro S + ICONIC" needs a human name). Importer sets it to the firmest
  project's title on merge, never overwrites an edited one.
- `external_id`, `raw`: dropped in the same migration (they belong to the application).
- `external_refs`: kept as an importer-maintained summary `{derived_status, voyage_event_ids[]}`
  so `cruiseStage()` keeps working; `derived_status` = firmest across projects
  (firm > scheduled > tentative).
- `project_id`, `proposal_id` hooks: dropped; the relationship runs the other way.
- The partial unique index on `(source, external_id)` moves to `cruise_projects`.

Direction of import (matters only if the MFP API key arrives): **applications import as
projects, one to one, without interpretation; cruises are built from projects.** The importer
writes/updates `cruise_projects` by `external_id`, then groups them by the vessel and dates in
their payload and creates or repoints the cruise for each group. A project MFP moves to
another vessel or week simply lands on a different cruise. Projects do not carry vessel or
dates of their own (two truths about when the boat leaves); the cruise owns those, and MFP's
parking lives only in the project payload. Partial overlaps (3 pairs, all Savannah: a 2-day
project inside a 10-day one) stay separate cruises — we cannot tell a piggyback from a second
departure. A cruise whose last project disappears for 2 runs is cancelled.

Stage is ours, not MFP's: once operators author cruises, stage derives from our timestamps
(`published_at`, `confirmed_at`, actuals). MFP's derived status is mapped per project at
import; the cruise takes the firmest.

Backfill (`supabase/migrations/20260930_cruise_projects.sql`, one migration since nothing is
deployed): (1) one `cruise_projects` row per existing cruise, copying
title/external_id/external_refs/raw/science_party_size; (2) merge identical windows: survivor is
the row with the operator's cruise number (AT50-14, SR2617: operators number the sailing, not
the project), then firmest, then oldest; repoint the others' projects to it, sum headcounts, delete the others (old slugs die;
nothing is deployed). Then the timeline-entries backfill (timeline plan Phase 1)
runs on the merged set.

Cruise page: projects render as sections (title, PI, reference, requested window); the list and
timeline show one row/bar per cruise with a "+N" when several projects are aboard.

## Open decisions

1. **`organizations` vs. `vessel_operators`.** Proposed: keep `vessel_operators` as user↔vessel
   membership; add `organization_id` to `vessels` and later `profiles`. Org membership comes after v0.
2. **Geometry storage.** jsonb + bbox for v0 (no PostGIS dependency); revisit if we need spatial
   queries beyond viewport.
3. **Equipment taxonomy seed.** Start from the MFP inventory `Type` values (Sensor, Echo sounder,
   Winches, Rosette, Multicorer…) plus the SME "Ship Fitted Equipment" list; curate to ~60 names.
4. **Whether MFP rows with `Hide` status are stored at all.** Proposed: store, mark cancelled/private,
   so a later status flip doesn't look like a new cruise.
