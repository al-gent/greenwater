-- Cruise plan detail: stops and hops.
--
-- A leg is port → port (the operator's booking). Inside a leg the vessel visits
-- STOPS (port, station, mooring, lander, …) in order, and the transit between
-- two consecutive stops is a HOP (planned steaming hours, speed, routed track).
-- Research activity attaches to a stop (at-anchor work) or a hop (underway
-- work) — never to a leg; that comes in a later migration.
--
-- Backfilled from the MFP planner GeoJSON (cruises.operating_area_geojson):
-- Point features → stops, ShipTransect LineStrings → hops, chained end→start
-- (scripts/import_mfp_stops_hops.mjs). The GeoJSON column stays as the raw
-- source and still carries Research Area / Transect features.

create table if not exists cruise_stops (
  id            uuid primary key default gen_random_uuid(),
  cruise_id     uuid not null references cruises(id) on delete cascade,
  leg_id        uuid references cruise_legs(id) on delete set null,   -- null = couldn't be placed in a leg
  seq           integer not null,                                      -- sailing order within the cruise
  kind          text not null,                                         -- port | station | mooring | lander | vehicle | glider | waypoint | other
  name          text,                                                  -- 'VLF-E', 'Station 12', 'Nome'
  lat           double precision not null,
  lon           double precision not null,
  station_hours numeric,                                               -- planned time on station
  depth_m       numeric,
  activity      text,                                                  -- free text for now ('recover mooring')
  asset_id      uuid,                                                  -- hook: persistent sea asset (moorings table, later)
  external_id   text,                                                  -- MFP Link_id
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cruise_stops_kind_check check (kind in ('port','station','mooring','lander','vehicle','glider','waypoint','other')),
  constraint cruise_stops_seq_key unique (cruise_id, seq)
);
create index if not exists cruise_stops_cruise_idx on cruise_stops (cruise_id, seq);
create index if not exists cruise_stops_leg_idx on cruise_stops (leg_id);

create table if not exists cruise_hops (
  id            uuid primary key default gen_random_uuid(),
  cruise_id     uuid not null references cruises(id) on delete cascade,
  from_stop_id  uuid not null references cruise_stops(id) on delete cascade,
  to_stop_id    uuid not null references cruise_stops(id) on delete cascade,
  seq           integer not null,                                      -- sailing order within the cruise
  hours         numeric,                                               -- planned steaming time
  speed_kn      numeric,
  distance_nm   numeric,                                               -- null until computed from the track
  track         jsonb,                                                 -- GeoJSON LineString geometry (routed path); null = straight line
  external_id   text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cruise_hops_seq_key unique (cruise_id, seq),
  constraint cruise_hops_ends_check check (from_stop_id <> to_stop_id)
);
create index if not exists cruise_hops_cruise_idx on cruise_hops (cruise_id, seq);

alter table cruise_stops enable row level security;
alter table cruise_hops  enable row level security;
create policy "cruise_stops_public_read" on cruise_stops for select
  using (exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null));
create policy "cruise_hops_public_read" on cruise_hops for select
  using (exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null));

create trigger cruise_stops_set_updated_at before update on cruise_stops for each row execute function set_updated_at();
create trigger cruise_hops_set_updated_at  before update on cruise_hops  for each row execute function set_updated_at();
