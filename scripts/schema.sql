-- Greenwater Foundation — Supabase Schema
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- This file is the source of truth for all table definitions.

-- ── Profiles (linked to Supabase auth.users) ────────────────────────────────
create table profiles (
  id         uuid    primary key references auth.users on delete cascade,
  role       text    not null default 'scientist', -- 'admin' | 'operator' | 'scientist'
  vessel_id  integer references vessels(id),
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "own_profile_select" on profiles for select using (auth.uid() = id);
create policy "own_profile_update" on profiles for update using (auth.uid() = id);

-- Trigger: auto-create profile row when a new user signs up
-- Note: `set search_path = public` is required — Supabase runs triggers in a
-- restricted context where the public schema is not on the search path by default.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── vessel_submissions: new listing requests from /list ──────────────────────
create table vessel_submissions (
  id             uuid        primary key default gen_random_uuid(),
  -- Core contact info
  vessel_name    text        not null,
  operator_name  text        not null,
  email          text        not null,
  port_city      text        not null,
  port_state     text,
  -- Identification
  country        text,
  mmsi           text,        -- 9-digit AIS identifier
  imo_number     text,        -- IMO vessel identifier
  call_sign      text,
  -- Physical specs
  year_built     integer,
  year_refit     integer,
  length_m       numeric,
  beam_m         numeric,
  draft_m        numeric,
  -- Performance & capacity
  speed_cruise   numeric,
  speed_max      numeric,
  scientists     integer,
  crew           integer,
  endurance      text,
  -- Research operations
  main_activity  text,
  operating_area text,
  dpos           text,        -- Dynamic Positioning class e.g. DP2
  ice_breaking   text,        -- Ice class e.g. 1A
  url_ship       text,
  -- Review
  status         text        not null default 'pending', -- pending | approved | rejected
  admin_notes    text,
  created_at     timestamptz default now(),
  reviewed_at    timestamptz
);
alter table vessel_submissions enable row level security;
-- Anyone can submit a listing (including unauthenticated visitors)
create policy "insert_submissions" on vessel_submissions for insert with check (true);

-- ── vessel_claims: operator claims on existing vessels ───────────────────────
create table vessel_claims (
  id             uuid        primary key default gen_random_uuid(),
  vessel_id      integer     not null,
  vessel_name    text        not null,
  user_id        uuid        not null references auth.users,
  claimant_name  text        not null,
  email          text        not null,
  role           text        not null,
  organization   text        not null,
  message        text,
  status         text        not null default 'pending', -- pending | approved | rejected
  admin_notes    text,
  created_at     timestamptz default now(),
  reviewed_at    timestamptz
);
alter table vessel_claims enable row level security;
-- Must be authenticated; user_id must match the session user
create policy "insert_claims"
  on vessel_claims for insert to authenticated
  with check (auth.uid() = user_id);

-- ── vessel_inquiries: "Connect with this Vessel" messages ───────────────────
-- Stored for Phase 2 chat. Currently displayed read-only in operator dashboard.
create table vessel_inquiries (
  id               uuid        primary key default gen_random_uuid(),
  vessel_id        integer     not null,
  vessel_name      text        not null,
  scientist_name   text        not null,
  scientist_email  text        not null,
  institution      text        not null,
  start_date       date,
  end_date         date,
  message          text        not null,
  status           text        not null default 'new', -- new | read | responded
  created_at       timestamptz default now()
);
alter table vessel_inquiries enable row level security;
-- Anyone can submit an inquiry (no account required)
create policy "insert_inquiries" on vessel_inquiries for insert with check (true);

-- ── Post-setup manual steps ──────────────────────────────────────────────────
-- 1. Create an admin user in Supabase Dashboard → Authentication → Users → Invite
-- 2. Then promote them:
--    update profiles set role = 'admin' where id = '<paste-user-uuid>';

-- ── Migrations (run after initial schema if tables already exist) ─────────────
-- Add MMSI and IMO to the vessels table
alter table vessels add column if not exists mmsi       text;
alter table vessels add column if not exists imo_number text;

-- Expand vessel_submissions with structured fields (replaces description blob)
alter table vessel_submissions drop column if exists description;
alter table vessel_submissions
  add column if not exists country        text,
  add column if not exists mmsi           text,
  add column if not exists imo_number     text,
  add column if not exists call_sign      text,
  add column if not exists year_built     integer,
  add column if not exists year_refit     integer,
  add column if not exists length_m       numeric,
  add column if not exists beam_m         numeric,
  add column if not exists draft_m        numeric,
  add column if not exists speed_cruise   numeric,
  add column if not exists speed_max      numeric,
  add column if not exists scientists     integer,
  add column if not exists crew           integer,
  add column if not exists endurance      text,
  add column if not exists main_activity  text,
  add column if not exists operating_area text,
  add column if not exists dpos           text,
  add column if not exists ice_breaking   text,
  add column if not exists url_ship       text;

-- Standardize home port: structured port_city + port_state columns
-- Run on vessels table (new structured columns alongside legacy homeport)
alter table vessels
  add column if not exists port_city  text,
  add column if not exists port_state text;

-- Run on vessel_submissions table (replace homeport with structured columns)
alter table vessel_submissions drop column if exists homeport;
alter table vessel_submissions
  add column if not exists port_city  text not null default '',
  add column if not exists port_state text;
