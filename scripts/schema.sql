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

-- ── In-platform messaging (Phase 2) ─────────────────────────────────────────

-- Extend profiles with scientist identity fields + verification flag
alter table profiles
  add column if not exists email        text,
  add column if not exists first_name   text,
  add column if not exists last_name    text,
  add column if not exists institution  text,
  add column if not exists title        text,
  add column if not exists profile_url  text,
  add column if not exists verified     boolean not null default false;

-- Update trigger to populate new fields from signup metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name, last_name, institution, title, profile_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'institution',
    new.raw_user_meta_data->>'title',
    new.raw_user_meta_data->>'profile_url'
  );
  return new;
end;
$$;

-- Messages table (replaces vessel_inquiries)
create table messages (
  id          uuid    primary key default gen_random_uuid(),
  thread_id   uuid    not null,
  vessel_id   integer not null references vessels(id),
  author_id   uuid    not null references auth.users on delete cascade,
  author_role text    not null check (author_role in ('scientist', 'operator')),
  body        text    not null,
  start_date  date,
  end_date    date,
  status      text    not null default 'new',
  created_at  timestamptz default now()
);
alter table messages enable row level security;

create policy "authenticated_insert"
  on messages for insert to authenticated
  with check (auth.uid() = author_id);

-- Scientists can read threads they started (root + replies)
create policy "scientist_read_own"
  on messages for select
  using (
    auth.uid() = author_id
    or thread_id in (
      select id from messages where author_id = auth.uid() and thread_id = id
    )
  );

create index if not exists idx_messages_thread_id on messages(thread_id);
create index if not exists idx_messages_vessel_id on messages(vessel_id);
create index if not exists idx_messages_author_id on messages(author_id);

-- Drop old inquiries table (verify no production data first)
drop table if exists vessel_inquiries;

-- Add document support to vessel_claims
alter table vessel_claims add column if not exists document_url text;

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

-- ── Expand vessels with full detail fields ────────────────────────────────────
-- Storage URLs
alter table vessels
  add column if not exists photo_urls  text[],
  add column if not exists doc_urls    text[];

-- Timestamps
alter table vessels
  add column if not exists last_updated timestamptz;

-- Contact & metadata
alter table vessels
  add column if not exists "Owner"          text,
  add column if not exists "Contact"        text,
  add column if not exists contact_email    text,
  add column if not exists "Operator_Add1"  text,
  add column if not exists "Operator_Add2"  text,
  add column if not exists "Operator_Add3"  text,
  add column if not exists phone            text,
  add column if not exists fax              text,
  add column if not exists email            text,
  add column if not exists url_schedule     text,
  add column if not exists "NODC_Code"      text,
  add column if not exists "ISM_Cert"       text,
  add column if not exists "Unols"          boolean,
  add column if not exists "Euro"           boolean;

-- Physical specs
alter table vessels
  add column if not exists "Hull_Material"  text,
  add column if not exists officers         integer,
  add column if not exists "Gross_Tons"     numeric,
  add column if not exists "Power_HP"       numeric,
  add column if not exists range            numeric;

-- Facilities
alter table vessels
  add column if not exists "Capacity_dry"    numeric,
  add column if not exists "Capacity_fuel"   numeric,
  add column if not exists "Area_wetlab"     numeric,
  add column if not exists "Area_drylab"     numeric,
  add column if not exists "Water_gen"       numeric,
  add column if not exists "Water_capacity"  numeric,
  add column if not exists "Water_clean"     text,
  add column if not exists "Freeboard_deck"  numeric,
  add column if not exists "Free_deck_area"  numeric,
  add column if not exists "Space_cont_lab"  text,
  add column if not exists "Air_Cond"        integer,
  add column if not exists "Operating_grids" text;

-- Power & propulsion
alter table vessels
  add column if not exists "Engine_number"   integer,
  add column if not exists "Engine_make"     text,
  add column if not exists "Engine_power"    text,
  add column if not exists "Prop_diam"       numeric,
  add column if not exists "Prop_maxrpm"     numeric,
  add column if not exists "Aux_Diesel_pwr"  numeric;

-- Electrical
alter table vessels
  add column if not exists "AC_Voltage"            text,
  add column if not exists "AC_Voltage_kVA"        text,
  add column if not exists "AC_Voltage_phases"     text,
  add column if not exists "AC_Voltage_freq"       text,
  add column if not exists "AC_Voltage_Stabilized" text,
  add column if not exists "AC_Amps_Stabilized"    text,
  add column if not exists "AC_Freq_Stabilized"    text,
  add column if not exists "DC_Voltages"           text,
  add column if not exists "DC_Voltage_max"        text;

-- Navigation & comms
alter table vessels
  add column if not exists "Nav_Equipment"      text,
  add column if not exists "Nav_Communications" text,
  add column if not exists "Nav_Satcomm"        text,
  add column if not exists "Nav_GPS"            text;

-- Acoustics
alter table vessels
  add column if not exists "Acoustic_echosound" text,
  add column if not exists "Acoustic_sonar"     text,
  add column if not exists "Acoustic_silent"    text;

-- Oceanographic cables & winches
alter table vessels
  add column if not exists "OC_winches"         integer,
  add column if not exists "OC_steelwire_len"   numeric,
  add column if not exists "OC_steelwire_load"  numeric,
  add column if not exists "OC_condcable_len"   numeric,
  add column if not exists "OC_condcable_load"  numeric,
  add column if not exists "OC_trawl_len"       numeric,
  add column if not exists "OC_trawl_load"      numeric,
  add column if not exists "OC_Other_len"       numeric,
  add column if not exists "OC_Other_load"      numeric;

-- Cranes & gantries
alter table vessels
  add column if not exists "Gantry_pos"           text,
  add column if not exists "Gantry_abovedeck"     numeric,
  add column if not exists "Gantry_outboard_ext"  numeric,
  add column if not exists "Gantry_load"          numeric,
  add column if not exists "Crane_pos"            text,
  add column if not exists "Crane_abovedeck"      numeric,
  add column if not exists "Crane_outboard_ext"   numeric,
  add column if not exists "Crane_load"           numeric,
  add column if not exists "Winch_other"          text;

-- Data processing
alter table vessels
  add column if not exists "DP_Equip"          text,
  add column if not exists "DP_Equip_printing" text;

-- Specialized science equipment
alter table vessels
  add column if not exists "Radioactive"             text,
  add column if not exists "Core_capable"            text,
  add column if not exists "Core_grab"               text,
  add column if not exists "Core_box"                text,
  add column if not exists "Core_gravity"            text,
  add column if not exists "Core_piston"             text,
  add column if not exists "Core_multi"              text,
  add column if not exists "CTD_cap"                 text,
  add column if not exists "CTD_make"                text,
  add column if not exists "CTD_towed"               text,
  add column if not exists "CTD_oxy"                 text,
  add column if not exists "CTD_trans"               text,
  add column if not exists "CTD_fluor"               text,
  add column if not exists "CTD_rosette"             text,
  add column if not exists "Aquis_SMS"               text,
  add column if not exists "Aquis_Multibeam"         text,
  add column if not exists "Aquis_sidescan"          text,
  add column if not exists "Aquis_ADCP"              text,
  add column if not exists "Underwater_vehicles"     text,
  add column if not exists "Underwater_vehicles_rov" text,
  add column if not exists "Underwater_vehicles_auv" text,
  add column if not exists "Underwater_vehicles_sub" text,
  add column if not exists "Diving_cap"              text;

-- Vessel classification & notes
alter table vessels
  add column if not exists "Vessel_construct" text,
  add column if not exists "Vessel_class"     text,
  add column if not exists "Vessel_other"     text,
  add column if not exists notes              text,
  add column if not exists amenities          text;
