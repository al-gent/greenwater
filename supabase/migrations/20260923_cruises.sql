-- Cruise scheduling v0: organizations, cruises, cruise_legs.
--
-- Operator side first. A cruise is what ONE vessel is doing between a departure
-- and an arrival — dates, ports (legs), operating area. It is operator/organization
-- owned. Researcher proposals, equipment links, research activities and the
-- vessel calendar come in later migrations and FK to cruises.id.
--
-- Seeded from UNOLS/MFP history (source='unols_mfp', external_id=CruiseApplication_id)
-- so the shape is exercised by ~1,700 real rows before operators enter their own.
-- Investigation: mfp-api/README.md.
--
-- Conventions: RLS on, public can read published rows, all writes go through
-- server routes with the service role (same as the rest of the app).

-- ── organizations ────────────────────────────────────────────────────────────
-- Operators / institutions. Minimal for now: today an org only exists as text
-- on vessels (operator_name / owner / affiliation). Cleanup + full backfill of
-- vessels.organization_id is a separate pass; here only the 16 MFP operators.
create table if not exists organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  short_name          text,                       -- 'SIO', 'WHOI'
  kind                text not null default 'operator', -- operator | institution | agency | company | other
  website             text,
  country             text,
  mfp_organisation_id integer unique,             -- MFP Organisation_id, for sync joins
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists organizations_name_key on organizations (lower(name));

alter table vessels add column if not exists organization_id uuid references organizations(id);
create index if not exists vessels_organization_id_idx on vessels (organization_id);

-- The 16 UNOLS operator organisations as MFP lists them (id = MFP Organisation_id).
insert into organizations (name, short_name, kind, mfp_organisation_id) values
  ('University-National Oceanographic Laboratory System', 'UNOLS',   'operator', 1),
  ('Scripps Institution of Oceanography',                 'SIO',     'operator', 4),
  ('University of Washington',                            'UW',      'operator', 5),
  ('Woods Hole Oceanographic Institution',                'WHOI',    'operator', 6),
  ('Skidaway Institute of Oceanography',                  'SkIO',    'operator', 7),
  ('University of Alaska Fairbanks',                      'UAF',     'operator', 8),
  ('Lamont-Doherty Earth Observatory',                    'LDEO',    'operator', 9),
  ('University of Hawaii',                                'UH',      'operator', 10),
  ('Oregon State University',                             'OSU',     'operator', 11),
  ('University of Rhode Island',                          'URI',     'operator', 12),
  ('Bermuda Institute of Ocean Sciences',                 'BIOS',    'operator', 13),
  ('University of Delaware',                              'UDel',    'operator', 14),
  ('Louisiana Universities Marine Consortium',            'LUMCON',  'operator', 15),
  ('University of Miami',                                 'UMIAMI',  'operator', 16),
  ('University of Minnesota Duluth',                      'UMN',     'operator', 17),
  ('United States Coast Guard',                           'USCG',    'operator', 772)
on conflict (mfp_organisation_id) do nothing;

alter table organizations enable row level security;
create policy "organizations_public_read" on organizations for select using (true);

-- ── cruises ──────────────────────────────────────────────────────────────────
create table if not exists cruises (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id),
  vessel_id             integer not null references vessels(id),
  created_by            uuid references profiles(id),      -- null for imports
  project_id            uuid,                              -- hook; no table yet
  proposal_id           uuid,                              -- hook; no table yet

  title                 text not null,
  cruise_code           text,                              -- operator's code: 'SKQ2610S', 'AR84-03'
  summary               text,

  -- where: same pair as vessels.operating_area / operating_area_geojson so the
  -- existing map rendering applies unchanged. geojson is a FeatureCollection.
  operating_area        text,
  operating_area_geojson jsonb,

  -- when: the calendar block. mob/demob are part of the cruise (operator's view).
  mobilization_at       timestamptz,
  departure_at          timestamptz not null,
  arrival_at            timestamptz not null,
  demobilization_at     timestamptz,
  actual_departure_at   timestamptz,
  actual_arrival_at     timestamptz,

  -- who / how many
  science_party_size    integer,
  berths_total          integer,                           -- snapshot of vessels.scientists at creation; editable
  berths_open           integer,                           -- null = unknown (never 0 by default)

  -- lifecycle as flags, not a status column
  confirmed_at          timestamptz,
  confirmed_by          uuid references profiles(id),
  cancelled_at          timestamptz,
  cancelled_by          uuid references profiles(id),
  published_at          timestamptz,                       -- null = not on the public calendar

  -- provenance
  source                text not null default 'vesselconnect', -- vesselconnect | unols_mfp
  external_id           text,                              -- MFP CruiseApplication_id
  external_refs         jsonb,                             -- {workflow_id, voyage_event_id, cruise_id, reference_number, organisation_id}
  raw                   jsonb,                             -- source record (PI, funding, equipment ids…) until those tables exist
  synced_at             timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint cruises_dates_check check (arrival_at >= departure_at),
  constraint cruises_berths_check check (berths_open is null or berths_total is null or berths_open <= berths_total),
  constraint cruises_source_check check (source in ('vesselconnect', 'unols_mfp'))
);
create unique index if not exists cruises_source_external_id_key on cruises (source, external_id) where external_id is not null;
create index if not exists cruises_vessel_departure_idx on cruises (vessel_id, departure_at);
create index if not exists cruises_organization_idx on cruises (organization_id);
create index if not exists cruises_published_departure_idx on cruises (departure_at) where published_at is not null and cancelled_at is null;

alter table cruises enable row level security;
create policy "cruises_public_read" on cruises for select using (published_at is not null);

-- ── cruise_legs ──────────────────────────────────────────────────────────────
-- A leg is a port-to-port segment of the vessel's track (MFP "Destination").
-- What happens at sea (stations, dives, moorings) is NOT a leg; that is a later
-- cruise_activities table. Ports are text + optional UN/LOCODE + coords for now;
-- a ports table can be joined on unlocode later.
create table if not exists cruise_legs (
  id                uuid primary key default gen_random_uuid(),
  cruise_id         uuid not null references cruises(id) on delete cascade,
  seq               integer not null,

  depart_port       text not null,
  depart_unlocode   text,                                  -- 'USLWP'
  depart_lat        double precision,
  depart_lon        double precision,
  depart_at         timestamptz not null,

  arrive_port       text not null,
  arrive_unlocode   text,
  arrive_lat        double precision,
  arrive_lon        double precision,
  arrive_at         timestamptz not null,

  notes             text,
  external_id       text,                                  -- MFP Destination_id
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint cruise_legs_seq_key unique (cruise_id, seq),
  constraint cruise_legs_dates_check check (arrive_at >= depart_at)
);
create index if not exists cruise_legs_cruise_idx on cruise_legs (cruise_id);

alter table cruise_legs enable row level security;
create policy "cruise_legs_public_read" on cruise_legs for select
  using (exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null));

-- ── updated_at ───────────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger organizations_set_updated_at before update on organizations for each row execute function set_updated_at();
create trigger cruises_set_updated_at       before update on cruises       for each row execute function set_updated_at();
create trigger cruise_legs_set_updated_at   before update on cruise_legs   for each row execute function set_updated_at();
