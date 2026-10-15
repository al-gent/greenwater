-- Resource timeline: who/what is busy when, plus the people it takes to run a cruise.
-- See RESOURCE_TIMELINE_PLAN.md (data model) and CRUISE_BUILD_PLAN.md M3.
--
-- One occupancy index (timeline_entries) for three resource kinds — vessel, person,
-- equipment unit — with a database guarantee against double booking for rows we author.
-- Semantic facts stay where they belong: cruises.vessel_id says which boat, cruise_people
-- says who sits in which seat; entries just say "busy from A to B because of this cruise".
-- The logic that keeps entries in step with cruises and seats lives in TypeScript
-- (lib/timeline-service.ts), not in triggers; the database only guarantees no double
-- booking (exclusion constraints). Blocks (yard time, vacation, out of service) are entries
-- with no cruise and a label. Rows are soft-deleted (deleted_at); nothing is hard-deleted.
--
-- Order: vocabularies → people → entries → seats → RLS → backfill.

create extension if not exists btree_gist;   -- one GiST index can check "same resource" AND "ranges overlap"

-- ── vocabularies (seeded, operators can add) ───────────────────────────────
-- Roles aboard a cruise. Crew and science party share one list so a cruise's people are one table.
create table if not exists cruise_roles (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  label       text not null,
  created_by  uuid references profiles(id),  -- null = seed
  created_at  timestamptz not null default now()
);
insert into cruise_roles (slug, label) values
  ('captain', 'Captain'), ('mate', 'Mate'), ('engineer', 'Engineer'), ('deckhand', 'Deckhand'),
  ('operator', 'Small boat operator'), ('marine_tech', 'Marine technician'),
  ('dive_safety_officer', 'Dive safety officer'), ('medic', 'Medic'),
  ('chief_scientist', 'Chief scientist'), ('pi', 'Principal investigator'), ('co_pi', 'Co-investigator'),
  ('scientist', 'Scientist'), ('technician', 'Technician'), ('student', 'Student'),
  ('observer', 'Observer'), ('other', 'Other')
on conflict (slug) do nothing;

-- What a person can hold. USCG MMC endorsements plus the research-world ones.
create table if not exists credentials (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  label       text not null,
  issuer      text,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
insert into credentials (slug, label, issuer) values
  ('uscg_master_unlimited', 'USCG Master, unlimited tonnage', 'USCG'),
  ('uscg_master_1600', 'USCG Master 1600 GRT', 'USCG'),
  ('uscg_master_500', 'USCG Master 500 GRT', 'USCG'),
  ('uscg_master_200', 'USCG Master 200 GRT', 'USCG'),
  ('uscg_master_100', 'USCG Master 100 GRT', 'USCG'),
  ('uscg_master_50', 'USCG Master 50 GRT', 'USCG'),
  ('uscg_master_25', 'USCG Master 25 GRT', 'USCG'),
  ('uscg_oupv', 'USCG OUPV (six-pack)', 'USCG'),
  ('uscg_mate', 'USCG Mate', 'USCG'),
  ('uscg_chief_engineer', 'USCG Chief Engineer', 'USCG'),
  ('uscg_able_seaman', 'USCG Able Seaman', 'USCG'),
  ('uscg_ordinary_seaman', 'USCG Ordinary Seaman', 'USCG'),
  ('stcw_basic', 'STCW Basic Safety Training', 'IMO/USCG'),
  ('twic', 'TWIC', 'TSA'),
  ('aaus_scientific_diver', 'AAUS Scientific Diver', 'AAUS'),
  ('aaus_dso', 'AAUS Dive Safety Officer', 'AAUS'),
  ('sci_boat_operator', 'Scientific boat operator (institutional)', 'Institution'),
  ('first_aid_cpr', 'First aid / CPR', 'Various'),
  ('marine_radio_operator', 'Marine radio operator permit', 'FCC')
on conflict (slug) do nothing;

-- ── people ──────────────────────────────────────────────────────────────────
-- Global directory, publicly readable for now. No account needed to be scheduled;
-- profile_id links one once they sign up.
create table if not exists people (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text,
  phone           text,
  organization_id uuid references organizations(id),
  affiliation     text,                              -- as entered when no org row matches
  profile_id      uuid unique references profiles(id),
  source          text not null default 'vesselconnect',   -- vesselconnect | unols_mfp
  external_id     text,                              -- MFP Person_id
  notes           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists people_email_key on people (lower(email)) where email is not null;
create unique index if not exists people_external_key on people (source, external_id) where external_id is not null;
create index if not exists people_org_idx on people (organization_id);
create trigger people_set_updated_at before update on people for each row execute function set_updated_at();

-- What a person holds. Not verified in v0; shown to the booker.
create table if not exists people_credentials (
  person_id     uuid not null references people(id) on delete cascade,
  credential_id uuid not null references credentials(id),
  number        text,
  expires_at    date,
  notes         text,
  primary key (person_id, credential_id)
);

-- ── timeline_entries: the occupancy index ───────────────────────────────────
create table if not exists timeline_entries (
  id            uuid primary key default gen_random_uuid(),

  -- exactly one of these names the resource
  vessel_id     integer references vessels(id) on delete cascade,
  person_id     uuid references people(id) on delete cascade,
  equipment_id  uuid references equipment(id) on delete cascade,

  start_at      timestamptz not null,           -- instants, always
  end_at        timestamptz not null,           -- exclusive
  all_day       boolean not null default false, -- true: dates; snap to day boundaries in the display zone
  tz            text not null default 'UTC',    -- IANA zone the user confirmed when entering

  cruise_id     uuid references cruises(id) on delete cascade,   -- set = assignment; null = block
  seat_id       uuid,                           -- -> cruise_people(id), added below (table order)
  label         text,                           -- block reason: 'Haul-out', 'Vacation'
  notes         text,

  source        text not null default 'vesselconnect',   -- vesselconnect | unols_mfp
  visibility    text not null default 'operators',       -- public | operators | private
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,                    -- soft delete; every query filters on it

  constraint timeline_entries_window   check (end_at > start_at),
  constraint timeline_entries_resource check ((vessel_id is not null)::int + (person_id is not null)::int + (equipment_id is not null)::int = 1),
  constraint timeline_entries_reason   check (cruise_id is not null or label is not null),
  constraint timeline_entries_visibility check (visibility in ('public', 'operators', 'private')),

  -- No double booking for live rows we author. Half-open ranges: back-to-back is fine.
  -- MFP rows are outside the predicate (their tentative/firm overlaps import cleanly);
  -- cross-source overlaps are reported by findConflicts() in the service, not enforced.
  -- NOTE: superseded by 20261013_timeline_same_cruise.sql, which adds `coalesce(cruise_id, id)
  -- with <>` so two seats on the SAME cruise (PI + chief scientist) never collide.
  constraint no_vessel_overlap exclude using gist
    (vessel_id with =, tstzrange(start_at, end_at) with &&)
    where (vessel_id is not null and source = 'vesselconnect' and deleted_at is null),
  constraint no_person_overlap exclude using gist
    (person_id with =, tstzrange(start_at, end_at) with &&)
    where (person_id is not null and source = 'vesselconnect' and deleted_at is null),
  constraint no_equipment_overlap exclude using gist
    (equipment_id with =, tstzrange(start_at, end_at) with &&)
    where (equipment_id is not null and source = 'vesselconnect' and deleted_at is null)
);
create index if not exists timeline_entries_vessel_idx    on timeline_entries (vessel_id, start_at) where deleted_at is null;
create index if not exists timeline_entries_person_idx    on timeline_entries (person_id, start_at) where deleted_at is null;
create index if not exists timeline_entries_equipment_idx on timeline_entries (equipment_id, start_at) where deleted_at is null;
create index if not exists timeline_entries_cruise_idx    on timeline_entries (cruise_id) where deleted_at is null;
create index if not exists timeline_entries_window_idx    on timeline_entries using gist (tstzrange(start_at, end_at)) where deleted_at is null;
create trigger timeline_entries_set_updated_at before update on timeline_entries for each row execute function set_updated_at();

-- ── cruise_people: seats ────────────────────────────────────────────────────
-- One row per seat. person_id null = open slot the planner still needs to fill; the set of
-- rows IS the cruise's requirements. A seat may cover part of the cruise (crew rotation,
-- AM/PM operators): start_at/end_at null = whole cruise.
create table if not exists cruise_people (
  id            uuid primary key default gen_random_uuid(),
  cruise_id     uuid not null references cruises(id) on delete cascade,
  role_id       uuid not null references cruise_roles(id),
  person_id     uuid references people(id) on delete set null,
  start_at      timestamptz,                    -- null = cruise start
  end_at        timestamptz,                    -- null = cruise end
  name          text,                           -- as-entered fallback when no person record
  notes         text,
  source        text not null default 'vesselconnect',
  external_id   text,                           -- MFP Person_id on the science-party side
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint cruise_people_window check (start_at is null or end_at is null or end_at > start_at)
  -- no unique on (cruise, person): one person may hold two seats in sequence; the person
  -- exclusion constraint on timeline_entries is what stops self-overlap.
);
create index if not exists cruise_people_cruise_idx on cruise_people (cruise_id) where deleted_at is null;
create index if not exists cruise_people_person_idx on cruise_people (person_id) where deleted_at is null;
create trigger cruise_people_set_updated_at before update on cruise_people for each row execute function set_updated_at();

alter table timeline_entries
  add constraint timeline_entries_seat_fk foreign key (seat_id) references cruise_people(id) on delete cascade;
create unique index if not exists timeline_entries_seat_key on timeline_entries (seat_id) where seat_id is not null and deleted_at is null;
create unique index if not exists timeline_entries_cruise_vessel_key on timeline_entries (cruise_id) where cruise_id is not null and vessel_id is not null and deleted_at is null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Writes go through API routes with the service-role client (operator check in code).
alter table cruise_roles       enable row level security;
alter table credentials        enable row level security;
alter table people             enable row level security;
alter table people_credentials enable row level security;
alter table timeline_entries   enable row level security;
alter table cruise_people      enable row level security;
create policy "cruise_roles_public_read" on cruise_roles for select using (true);
create policy "credentials_public_read" on credentials for select using (true);
-- People are public for now (Adam, 2026-09-30: "don't worry about privacy for now"); revisit
-- before crew with phone/email get entered at scale — RESOURCE_TIMELINE_PLAN.md principle 5.
create policy "people_public_read"             on people             for select using (true);
create policy "people_credentials_public_read" on people_credentials for select using (true);
create policy "timeline_entries_public_read" on timeline_entries for select using (visibility = 'public' and deleted_at is null);
create policy "timeline_entries_operators_read" on timeline_entries for select to authenticated
  using (deleted_at is null and (visibility in ('public', 'operators') or created_by = auth.uid()
         or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)));
create policy "cruise_people_public_read" on cruise_people for select
  using (deleted_at is null and exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null));

-- ── backfill ────────────────────────────────────────────────────────────────
-- Same rules as cruiseOccupancy() in lib/timeline-service.ts: the boat is busy from
-- mobilization (else departure) to demobilization (else arrival), ignoring mob/demob more
-- than 14 days from the cruise (QUIRKS #17); MFP dates are calendar days with arrival
-- inclusive, so all-day windows end the next day; floor to one day.

-- 1. One vessel entry per live cruise.
insert into timeline_entries (vessel_id, start_at, end_at, all_day, tz, cruise_id, source, visibility, created_by)
select c.vessel_id,
       case when c.mobilization_at is not null and c.departure_at - c.mobilization_at between interval '0' and interval '14 days' then c.mobilization_at else c.departure_at end,
       greatest(case when c.demobilization_at is not null and c.demobilization_at - c.arrival_at between interval '0' and interval '14 days' then c.demobilization_at else c.arrival_at end
                  + case when c.source = 'unols_mfp' then interval '1 day' else interval '0' end,
                case when c.mobilization_at is not null and c.departure_at - c.mobilization_at between interval '0' and interval '14 days' then c.mobilization_at else c.departure_at end + interval '1 day'),
       c.source = 'unols_mfp', 'UTC', c.id, c.source,
       case when c.published_at is not null then 'public' else 'operators' end, c.created_by
from cruises c
where c.cancelled_at is null and c.vessel_id is not null
  and not exists (select 1 from timeline_entries e where e.cruise_id = c.id and e.vessel_id is not null and e.deleted_at is null);

-- 2. MFP science party → people + seats. Each application lists its PI (always) and chief
--    scientist (a third of the time) with an MFP Person_id, so these are real, dedupable people.
insert into people (name, affiliation, source, external_id, created_at)
select distinct on (u->>'Person_id')
       trim(regexp_replace(u->>'FullName', '\s+', ' ', 'g')), nullif(u->>'Organisation', ''), 'unols_mfp', u->>'Person_id', now()
from cruise_projects p, jsonb_array_elements(p.raw->'Users') u
where p.source = 'unols_mfp' and nullif(u->>'Person_id', '') is not null and nullif(trim(u->>'FullName'), '') is not null
order by u->>'Person_id', (u->>'ModifiedDate') desc
on conflict (source, external_id) where external_id is not null do nothing;

insert into cruise_people (cruise_id, role_id, person_id, name, source, external_id)
select distinct on (p.cruise_id, u->>'Person_id', u->>'Role')
       p.cruise_id,
       (select id from cruise_roles where slug = case u->>'Role' when 'PI' then 'pi' when 'CS' then 'chief_scientist' else 'other' end),
       pe.id, pe.name, 'unols_mfp', u->>'Person_id'
from cruise_projects p
cross join jsonb_array_elements(p.raw->'Users') u
join people pe on pe.source = 'unols_mfp' and pe.external_id = u->>'Person_id'
where p.source = 'unols_mfp'
order by p.cruise_id, u->>'Person_id', u->>'Role';

-- 3. One person entry per seat on a live cruise (whole-cruise window; MFP seats have none of their own).
insert into timeline_entries (person_id, start_at, end_at, all_day, tz, cruise_id, seat_id, source, visibility)
select s.person_id, e.start_at, e.end_at, e.all_day, e.tz, s.cruise_id, s.id, s.source, 'operators'
from cruise_people s
join timeline_entries e on e.cruise_id = s.cruise_id and e.vessel_id is not null and e.deleted_at is null
where s.person_id is not null and s.deleted_at is null;
