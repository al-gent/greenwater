-- Projects stand on their own; operators bid; a confirmed bid becomes a cruise.
-- See CRUISE_SCHEDULING_PLAN.md § v0.2 (to be written). Nothing is pushed, so this renames
-- in place. MFP rows are unaffected: they keep their cruise_id and stay unpublished-as-projects
-- (visible through their published cruise, as today).

-- ── projects: the researcher's object ───────────────────────────────────────
alter table cruise_projects rename to projects;
alter index if exists cruise_projects_cruise_idx rename to projects_cruise_idx;
alter index if exists cruise_projects_external_key rename to projects_external_key;
alter table projects rename constraint cruise_projects_source_check to projects_source_check;
alter trigger cruise_projects_set_updated_at on projects rename to projects_set_updated_at;

alter table projects
  alter column cruise_id drop not null,                       -- null = not scheduled on any cruise yet
  add column if not exists created_by     uuid references profiles(id),
  add column if not exists published_at   timestamptz,        -- null = private draft; set = open to everyone, biddable
  add column if not exists area_geojson   jsonb,              -- drawn with the vessel operating-area tool; no text
  add column if not exists party_size     integer,            -- people the researcher wants to bring (science_party_size stays MFP's reported figure)
  add column if not exists dates_notes    text,               -- 'any weekday in October', 'must avoid Nov 1–7'
  -- funding: where the money is coming from (funding_source already exists: 'NSF OCE', 'NOAA', 'institutional')
  add column if not exists funding_status text,               -- funded | pending | proposed | unfunded
  add column if not exists grant_number   text,               -- 'OCE-2345678'
  add column if not exists funding_notes  text;               -- 'ship time is in the award', 'cost-share from the department'
alter table projects add constraint projects_funding_status_check
  check (funding_status is null or funding_status in ('funded', 'pending', 'proposed', 'unfunded'));
create index if not exists projects_published_idx on projects (published_at) where published_at is not null and cruise_id is null;
create index if not exists projects_created_by_idx on projects (created_by);

-- Visibility: published projects are open; drafts only to their author (and admins).
drop policy if exists cruise_projects_public_read on projects;
create policy projects_public_read on projects for select
  using (published_at is not null
         or exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null));
create policy projects_own_read on projects for select to authenticated
  using (created_by = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- ── project_gear: what the researcher needs ─────────────────────────────────
create table if not exists project_gear (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  label             text not null,                           -- as written
  equipment_type_id uuid references equipment_types(id),     -- matched when the picker is used
  quantity          integer,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists project_gear_project_idx on project_gear (project_id);
alter table project_gear enable row level security;
create policy project_gear_read on project_gear for select
  using (exists (select 1 from projects p where p.id = project_id and (p.published_at is not null or p.created_by = auth.uid())));
create trigger project_gear_set_updated_at before update on project_gear for each row execute function set_updated_at();

-- ── project_bids: an operator's offer to run a project on a vessel ──────────
-- State is flags, not a status column: offered → accepted (researcher) → confirmed (operator,
-- creates the cruise) | declined (either side) | withdrawn (operator). The operator may edit
-- a bid freely until it is accepted; after that it is frozen and a change is a new bid.
create table if not exists project_bids (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  vessel_id             integer not null references vessels(id),

  proposed_departure_at timestamptz not null,
  proposed_arrival_at   timestamptz not null,
  tz                    text not null default 'UTC',
  berths                integer,                               -- science berths offered
  cost_amount           numeric,
  cost_currency         text,                                  -- 'USD'; vessels.daily_rate_currency pre-fills
  notes                 text,

  offered_at            timestamptz not null default now(),
  offered_by            uuid not null references profiles(id),
  accepted_at           timestamptz,
  accepted_by           uuid references profiles(id),
  confirmed_at          timestamptz,
  confirmed_by          uuid references profiles(id),
  declined_at           timestamptz,
  declined_by           uuid references profiles(id),
  withdrawn_at          timestamptz,
  withdrawn_by          uuid references profiles(id),

  cruise_id             uuid references cruises(id),           -- set on confirm: the cruise this bid became
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint project_bids_window check (proposed_arrival_at > proposed_departure_at)
);
create index if not exists project_bids_project_idx on project_bids (project_id);
create index if not exists project_bids_vessel_idx on project_bids (vessel_id);
alter table project_bids enable row level security;
-- A bid is visible to the project's author, the operators of the bidding vessel, and admins.
-- Competing operators do not see each other's cost.
create policy project_bids_read on project_bids for select to authenticated
  using (offered_by = auth.uid()
         or exists (select 1 from projects p where p.id = project_id and p.created_by = auth.uid())
         or exists (select 1 from vessel_operators vo where vo.vessel_id = project_bids.vessel_id and vo.user_id = auth.uid())
         or exists (select 1 from profiles pr where pr.id = auth.uid() and pr.is_admin));
create trigger project_bids_set_updated_at before update on project_bids for each row execute function set_updated_at();

-- ── bid_gear: what this bid can cover, per requested line ───────────────────
-- Only lines the operator can provide or support are listed; a requested line with no row
-- on a bid means "we cannot support this" (rendered by diffing against project_gear).
-- Three gear tables, three meanings: project_gear = the researcher's request; bid_gear = one
-- operator's offer against it; cruise_equipment = what is confirmed aboard a cruise (written
-- from bid_gear on confirm, and what piggybacking projects see).
create table if not exists bid_gear (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  bid_id          uuid not null references project_bids(id) on delete cascade,
  project_gear_id uuid not null references project_gear(id) on delete cascade,
  answer          text not null,                               -- 'provide' (aboard, ours) | 'support' (bring your own, we can handle it)
  equipment_id    uuid references equipment(id),               -- the unit, when the operator names one
  notes           text,
  created_at      timestamptz not null default now(),
  constraint bid_gear_answer_check check (answer in ('provide', 'support')),
  constraint bid_gear_once unique (bid_id, project_gear_id)
);
create index if not exists bid_gear_bid_idx on bid_gear (bid_id);
alter table bid_gear enable row level security;
create policy bid_gear_read on bid_gear for select to authenticated
  using (exists (select 1 from project_bids b where b.id = bid_id));   -- inherits the bid's policy through the join

-- ── cruise_equipment learns which project line it came from ─────────────────
alter table cruise_equipment add column if not exists project_gear_id uuid references project_gear(id) on delete set null;
alter table cruise_equipment add column if not exists project_id uuid references projects(id) on delete set null;
