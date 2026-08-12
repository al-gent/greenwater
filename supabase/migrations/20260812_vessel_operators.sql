-- Phase 0 of the vessel_operators redesign (VESSEL_OPERATORS_PLAN.md §3a/§3b).
-- Purely additive: creates the operator↔vessel join table and backfills it.
-- No code reads this table yet; profiles.role / profiles.vessel_id are untouched
-- until later phases.

create table if not exists vessel_operators (
  user_id    uuid        not null references profiles(id) on delete cascade,
  vessel_id  integer     not null references vessels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vessel_id)
);
create index if not exists idx_vessel_operators_vessel on vessel_operators (vessel_id);

-- Navbar/dashboard will read memberships from the browser client, so RLS must
-- allow reading your own rows. All writes go through the service role (which
-- bypasses RLS) — deliberately no insert/update/delete policies.
alter table vessel_operators enable row level security;
create policy "own_memberships_select" on vessel_operators
  for select using (auth.uid() = user_id);

-- Backfill from BOTH sources, not just profiles.vessel_id: the single-vessel
-- model overwrote the profile link on each new claim approval, so a user with
-- two approved claims kept only the newest (live case: Mark's approved Agulhas
-- claim was overwritten by his later Cosmo approval). Approved claims are the
-- durable record of every grant. 13 rows as of 2026-08-12.
insert into vessel_operators (user_id, vessel_id)
select id, vessel_id from profiles where vessel_id is not null
union
select user_id, vessel_id from vessel_claims where status = 'approved' and user_id is not null
on conflict do nothing;
