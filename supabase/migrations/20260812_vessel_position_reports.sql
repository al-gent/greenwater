-- Operator-reported vessel positions (FUTURE.md "Operator-reported vessel
-- location", v1). Deliberately separate from GFW-owned vessel_last_port —
-- pipeline data and human reports never overwrite each other; readers pick
-- the freshest source. Insert-only: history is a free movement log.
create table if not exists vessel_position_reports (
  id          uuid        primary key default gen_random_uuid(),
  vessel_id   integer     not null references vessels(id) on delete cascade,
  user_id     uuid        not null references profiles(id),
  port_text   text        not null,
  lat         numeric,
  lon         numeric,
  reported_at timestamptz not null default now()
);
create index if not exists idx_position_reports_vessel
  on vessel_position_reports (vessel_id, reported_at desc);

-- Server-side only: written via /api/vessels/position (service role),
-- read by server pages. No client access.
alter table vessel_position_reports enable row level security;
revoke all on vessel_position_reports from public, anon, authenticated;
