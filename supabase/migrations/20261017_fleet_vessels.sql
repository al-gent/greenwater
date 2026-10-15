-- A user's own watch list of vessels: the rows of their "My fleet" timeline.
-- One row per user and vessel; no fleet object yet. Sharing later = a fleets table + backfill.
create table if not exists fleet_vessels (
  user_id    uuid    not null references profiles(id) on delete cascade,
  vessel_id  integer not null references vessels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vessel_id)
);
create index if not exists fleet_vessels_vessel_idx on fleet_vessels (vessel_id);

alter table fleet_vessels enable row level security;
create policy fleet_vessels_own on fleet_vessels
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
