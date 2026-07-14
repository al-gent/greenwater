-- GFW loitering events (2026-07-14)
-- At-sea station-keeping/work periods from Global Fishing Watch — combined
-- with port_calls these form the vessel's historic track.

create table if not exists loitering_events (
  id                       uuid primary key default gen_random_uuid(),
  vessel_id                integer references vessels(id) on delete cascade,
  lat                      numeric,       -- average position during the event
  lon                      numeric,
  started_at               timestamptz,
  ended_at                 timestamptz,
  duration_hrs             numeric,       -- loitering.totalTimeHours
  avg_speed_knots          numeric,       -- loitering.averageSpeedKnots
  avg_distance_from_shore_km numeric,     -- loitering.averageDistanceFromShoreKm
  recorded_at              timestamptz default now(),
  unique(vessel_id, started_at)
);

create index if not exists idx_loitering_vessel_started
  on loitering_events (vessel_id, started_at desc);
