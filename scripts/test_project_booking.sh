#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-$(pg_config --bindir)}"
if [[ ! -x "$PG_BIN/postgres" ]]; then
  echo 'Set PG_BIN to a PostgreSQL 15+ server bin directory.' >&2
  exit 1
fi
scratch="$(mktemp -d /tmp/greenwater-booking.XXXXXX)"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$scratch/db" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$scratch/db" -A trust --no-locale > "$scratch/init.log"
"$PG_BIN/pg_ctl" -D "$scratch/db" -l "$scratch/postgres.log" -o "-F -k $scratch -p 55443 -c listen_addresses='' -c timezone=UTC" start >/dev/null
export PGHOST="$scratch" PGPORT=55443 PGDATABASE=postgres PGUSER="$(id -un)" PG_BIN
unset PGSERVICE PGSERVICEFILE PGOPTIONS
run_sql() { "$PG_BIN/psql" -X -v ON_ERROR_STOP=1 "$@"; }
run_sql -q <<'SQL'
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
create table profiles (id uuid primary key, is_admin boolean default false);
create table vessels (id serial primary key, name text, status text);
create table vessel_operators (vessel_id integer references vessels(id), user_id uuid references profiles(id), status text);
SQL
migrations=(
  20260923_cruises 20260923_cruise_slugs 20260924_cruise_stops_hops
  20260930_cruise_projects 20261001_equipment 20261002_timeline
  20261013_timeline_same_cruise 20261014_projects_and_bids
  20261015_project_area_label 20261015_project_soft_delete
  20261015_project_people 20261015_project_slugs
  20261016_cruise_org_nullable 20261016_project_gear_rls 20261016_projects_own_people_gear
  20261114_research_publication 20261115073006_atomic_project_booking 20261121211444_restrict_booking_details
)
for migration in "${migrations[@]}"; do
  run_sql -q -1 -f "supabase/migrations/$migration.sql" >> "$scratch/migrations.log" 2>&1 || { cat "$scratch/migrations.log"; exit 1; }
done
run_sql -q -c 'grant select on all tables in schema public to anon, authenticated; grant all on all tables in schema public to service_role;'
run_sql -q -f scripts/test_project_booking.sql
node --test scripts/project_booking_concurrency.test.mjs
echo 'PASS: isolated project saves, booking rollback, authorization, retries and races'
