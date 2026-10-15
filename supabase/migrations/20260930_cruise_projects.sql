-- Cruise scheduling v0.1: cruises are what the vessel does; projects are why.
-- See CRUISE_SCHEDULING_PLAN.md § v0.1. The cruise feature is not deployed yet, so this
-- is one migration: create, backfill, merge, drop.
--
-- MFP schedules funded applications, not sailings; co-scheduled applications
-- get identical dates on one vessel and no shared key. 8 of 115 upcoming
-- vessel-windows carry 2+ applications (18 rows). This migration:
--   1. creates cruise_projects and backfills one project per existing cruise;
--   2. merges MFP cruises with identical (vessel, departure, arrival) into one
--      cruise carrying several projects;
--   3. drops the application-level columns from cruises.

-- ── cruise_projects ─────────────────────────────────────────────────────────
create table if not exists cruise_projects (
  id              uuid primary key default gen_random_uuid(),
  cruise_id       uuid not null references cruises(id) on delete cascade,
  title           text not null,
  reference       text,                    -- MFP Workflow.ReferenceNumber '26/6947', or the operator's own
  pi_name         text,                    -- as entered
  pi_person_id    uuid,                    -- -> people(id) once that table exists (RESOURCE_TIMELINE_PLAN.md)
  funding_source  text,
  discipline      text,
  requested_start_earliest date,
  requested_start_latest   date,
  requested_science_days   numeric,
  science_party_size integer,              -- headcount as reported on this project's form; cruise takes the max
  summary         text,
  source          text not null default 'vesselconnect',
  external_id     text,                    -- MFP CruiseApplication_id
  external_refs   jsonb,                   -- {workflow_id, cruise_id, voyage_event_id, organisation_id, derived_status}
  raw             jsonb,                   -- the MFP application payload (+ harvested sme)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint cruise_projects_source_check check (source in ('vesselconnect', 'unols_mfp'))
);
create index if not exists cruise_projects_cruise_idx on cruise_projects (cruise_id);
create unique index if not exists cruise_projects_external_key on cruise_projects (source, external_id) where external_id is not null;

alter table cruise_projects enable row level security;
create policy "cruise_projects_public_read" on cruise_projects for select
  using (exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null));

create trigger cruise_projects_set_updated_at before update on cruise_projects for each row execute function set_updated_at();

-- ── backfill 1: one project per existing cruise ─────────────────────────────
insert into cruise_projects (cruise_id, title, reference, science_party_size, summary, source, external_id, external_refs, raw, created_at)
select c.id, c.title, c.external_refs->>'reference_number', c.science_party_size, c.summary, c.source, c.external_id, c.external_refs, c.raw, c.created_at
from cruises c
where not exists (select 1 from cruise_projects p where p.cruise_id = c.id);

-- ── backfill 2: merge co-scheduled MFP cruises ──────────────────────────────
-- Survivor = the row carrying the operator's cruise number (AT50-14, SR2617: the
-- operator numbers the sailing, not the project), then firmest
-- (firm > sailed > scheduled > tentative), then oldest.
-- Losers' projects move to the survivor; their legs/stops/hops go with the row
-- (identical within a window on MFP data).
create temp table merge_plan on commit drop as
with ranked as (
  select c.id,
         first_value(c.id) over w as survivor,
         row_number()      over w as rn
  from cruises c
  where c.source = 'unols_mfp' and c.cancelled_at is null
  window w as (
    partition by c.vessel_id, c.departure_at, c.arrival_at
    order by (nullif(trim(c.cruise_code), '') is null),
             case c.external_refs->>'derived_status'
               when 'firm' then 0 when 'sailed' then 1 when 'scheduled' then 2 when 'tentative' then 3 else 4 end,
             c.created_at, c.id
  )
)
select id as loser, survivor from ranked where rn > 1;

update cruise_projects p set cruise_id = m.survivor
from merge_plan m where p.cruise_id = m.loser;

-- Survivor summary: headcount is the max (each MFP form reports the whole cruise's party,
-- so summing triple-counts); external_refs lists every voyage event.
update cruises c set
  science_party_size = s.party,
  external_refs = coalesce(c.external_refs, '{}'::jsonb)
                  || jsonb_build_object('voyage_event_ids', s.ves, 'project_count', s.n)
from (
  select p.cruise_id,
         max(p.science_party_size) as party,
         jsonb_agg(p.external_refs->'voyage_event_id') filter (where p.external_refs ? 'voyage_event_id') as ves,
         count(*) as n
  from cruise_projects p
  where p.cruise_id in (select distinct survivor from merge_plan)
  group by p.cruise_id
) s
where c.id = s.cruise_id;

delete from cruises where id in (select loser from merge_plan);

-- Every cruise now has at least one project; make that a rule for new rows via the
-- API (a cruise inserted from the operator form creates its first project in the
-- same transaction). Not a DB constraint: circular on insert.

-- ── drop what moved to projects ─────────────────────────────────────────────
-- cruises.external_refs stays as the importer-maintained summary
-- {derived_status, voyage_event_ids, project_count} that cruiseStage() reads.
drop index if exists cruises_source_external_id_key;
alter table cruises
  drop column if exists external_id,
  drop column if exists raw,
  drop column if exists project_id,
  drop column if exists proposal_id;
