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

-- New-signup webhook → /api/hooks/new-profile (admin notification + pending
-- vessel claim from the /claim page). Fires at signup, before email
-- confirmation. Replace __WEBHOOK_SECRET__ with SUPABASE_WEBHOOK_SECRET.
-- See supabase/migrations/20260808_new_profile_webhook.sql
drop trigger if exists profiles_new_user_webhook on public.profiles;
create trigger profiles_new_user_webhook
  after insert on public.profiles
  for each row
  execute function supabase_functions.http_request(
    'https://vesselconnect.org/api/hooks/new-profile',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"__WEBHOOK_SECRET__"}',
    '{}',
    '5000'
  );

-- ── vessel_submissions: new listing requests from /list ──────────────────────
create table vessel_submissions (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        references auth.users on delete set null,
  -- Core contact info
  vessel_name    text        not null,
  operator_name  text        not null,
  email          text        not null,
  port_city      text,
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
-- Authenticated users can submit listings; user_id must match the session user.
create policy "insert_submissions"
  on vessel_submissions for insert to authenticated
  with check (auth.uid() = user_id);

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

-- Per-user email notification preferences (opt-out: missing key = subscribed).
-- First consumers: admin notifications 'new_claim' / 'new_submission'.
alter table profiles
  add column if not exists notification_prefs jsonb not null default '{}';

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
  created_at  timestamptz default now(),
  -- Inquiry-notification bookkeeping (root rows only, 20260803):
  notified_via    text,   -- 'operator' | 'vessel_email' | 'unrouted'
  notified_email  text,   -- address the inquiry email went to
  delivery_status text,   -- 'sent' → brevo webhook: 'delivered' | 'bounced' | 'blocked' | 'spam'
  -- Scientist-side read marker (root rows only, 20260803); operator side
  -- lives in the status machine ('new' | 'read' | 'responded')
  scientist_read_at timestamptz
);

-- Unread-thread count for the navbar badge (see /api/messages/unread-count)
create or replace function message_unread_count(p_user_id uuid) returns integer as $$
declare
  prof record;
  n integer := 0;
begin
  select role, vessel_id into prof from profiles where id = p_user_id;

  if prof.role = 'operator' and prof.vessel_id is not null then
    select count(*) into n from messages
    where vessel_id = prof.vessel_id and thread_id = id and status = 'new';
  else
    select count(*) into n from messages root
    where root.author_id = p_user_id and root.thread_id = root.id
      and exists (
        select 1 from messages m
        where m.thread_id = root.id and m.author_role = 'operator'
          and m.created_at > coalesce(root.scientist_read_at, '-infinity'::timestamptz)
      );
  end if;

  return coalesce(n, 0);
end
$$ language plpgsql stable;
alter table messages enable row level security;

-- No insert policy: all writes go through the API (service role). The old
-- "authenticated_insert" policy was dropped 20260803 — it allowed any signed-in
-- user to forge rows (incl. author_role='operator') directly via PostgREST.

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

-- Associate vessel_submissions with the submitting user
alter table vessel_submissions
  add column if not exists user_id uuid references auth.users on delete set null;
drop policy if exists "insert_submissions" on vessel_submissions;
create policy "insert_submissions"
  on vessel_submissions for insert to authenticated
  with check (auth.uid() = user_id);

-- ── Expand vessels with full detail fields ────────────────────────────────────
-- Storage URLs
alter table vessels
  add column if not exists photo_urls  text[],
  add column if not exists doc_urls    text[];

-- Photo credits: array of {url, credit} matching entries in photo_urls
-- (mirrors supabase/migrations/20260716_photo_details.sql)
alter table vessels
  add column if not exists photo_details jsonb;

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

-- ── Listing timestamps ───────────────────────────────────────────────────────
-- (mirrors supabase/migrations/20260714_vessel_timestamps.sql)
-- created_at: entry into OUR system (null = legacy bulk import).
-- last_updated: human listing edits only; legacy rows carry the source
-- registry's own last-modified date. Machine syncs never set either.
alter table vessels add column if not exists created_at timestamptz default now();

-- ── Vessel of opportunity + daily charter rate ───────────────────────────────
-- (mirrors supabase/migrations/20260714_voo_daily_rate.sql)
-- VOO = pleasure/fishing/working craft that can also host research.
-- null = not answered; existing fleet backfilled to false (dedicated RVs).
alter table vessels
  add column if not exists vessel_of_opportunity boolean,
  add column if not exists daily_rate numeric,
  add column if not exists daily_rate_currency text; -- ISO 4217

alter table vessel_submissions
  add column if not exists vessel_of_opportunity boolean,
  add column if not exists daily_rate numeric,
  add column if not exists daily_rate_currency text;

-- Photos staged during the list-your-vessel flow
-- (mirrors supabase/migrations/20260714_submission_photos.sql)
alter table vessel_submissions add column if not exists photo_urls text[];

-- Per-photo credits: {url, credit}[] matching photo_urls entries
-- (mirrors supabase/migrations/20260716_submission_photo_details.sql)
alter table vessel_submissions add column if not exists photo_details jsonb;

-- (includes 20260714_submission_thumbs_policy.sql: thumbs/submissions/ is
-- writable too, for browser-generated thumbnails at upload time)
create policy "Authenticated users can stage submission photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vessel-photos'
    and (
      (storage.foldername(name))[1] = 'submissions'
      or ((storage.foldername(name))[1] = 'thumbs' and (storage.foldername(name))[2] = 'submissions')
    )
  );

create policy "Users can delete their own staged submission photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vessel-photos'
    and (
      (storage.foldername(name))[1] = 'submissions'
      or ((storage.foldername(name))[1] = 'thumbs' and (storage.foldername(name))[2] = 'submissions')
    )
    and owner = auth.uid()
  );

-- ── Change audit: data_changes table + triggers ──────────────────────────────
-- (mirrors supabase/migrations/20260715_vessel_data_changes.sql +
--  20260715_vessels_audit_trigger.sql + 20260715_audit_more_tables.sql)
-- Column-level diff of every UPDATE on vessels / profiles / vessel_claims /
-- vessel_submissions. Scripted batch changes insert rows directly with a
-- batch label; the trigger uses batch='trigger:update'. source = acting user
-- uuid (PostgREST JWT) or DB role. RLS keeps the table server-side only.
create table if not exists data_changes (
  id uuid primary key default gen_random_uuid(),
  vessel_id integer references vessels(id) on delete cascade,
  table_name text not null default 'vessels',
  record_id text,
  field text not null,
  old_value text,
  new_value text,
  source text,
  batch text not null,
  changed_at timestamptz default now()
);
create index if not exists idx_vdc_vessel on data_changes (vessel_id);
create index if not exists idx_vdc_batch on data_changes (batch);
create index if not exists idx_dc_table on data_changes (table_name);
alter table data_changes enable row level security;

create or replace function log_data_changes() returns trigger as $$
declare
  k text;
  oldj jsonb := to_jsonb(OLD);
  newj jsonb := to_jsonb(NEW);
  actor text;
  vid integer;
  skip text[] := case TG_TABLE_NAME
    when 'vessels' then array['last_updated', 'identity_verified_at']
    else array[]::text[]
  end;
begin
  -- x-audit-actor: user email set by API routes (supabaseAdminAs) — the
  -- service-role connection otherwise hides who the human was. Fallback
  -- carries application_name so psql ('postgres via Supavisor') and the
  -- Supabase dashboard's pg-meta service are distinguishable.
  actor := coalesce(
    nullif(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-audit-actor', ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    session_user::text
      || coalesce(' via ' || nullif(current_setting('application_name', true), ''), '')
  );
  vid := case TG_TABLE_NAME
    when 'vessels' then (oldj ->> 'id')::integer
    else nullif(coalesce(newj ->> 'vessel_id', oldj ->> 'vessel_id'), '')::integer
  end;
  for k in select jsonb_object_keys(newj) loop
    if (oldj -> k) is distinct from (newj -> k) and not (k = any(skip)) then
      insert into data_changes (vessel_id, table_name, record_id, field, old_value, new_value, source, batch)
      values (vid, TG_TABLE_NAME, oldj ->> 'id', k, nullif(oldj ->> k, ''), nullif(newj ->> k, ''), actor, 'trigger:update');
    end if;
  end loop;
  return NEW;
end
$$ language plpgsql;

drop trigger if exists vessels_audit on vessels;
create trigger vessels_audit after update on vessels
  for each row execute function log_data_changes();
drop trigger if exists profiles_audit on profiles;
create trigger profiles_audit after update on profiles
  for each row execute function log_data_changes();
drop trigger if exists vessel_claims_audit on vessel_claims;
create trigger vessel_claims_audit after update on vessel_claims
  for each row execute function log_data_changes();
drop trigger if exists vessel_submissions_audit on vessel_submissions;
create trigger vessel_submissions_audit after update on vessel_submissions
  for each row execute function log_data_changes();

-- ── GFW port call integration ────────────────────────────────────────────────
-- (mirrors supabase/migrations/20260325_gfw_port_calls.sql +
--  20260714_port_calls_history.sql)

-- GFW internal vessel UUID, set by scripts/load_gfw_data.mjs
alter table vessels add column if not exists vessel_id_gfw text;

-- Full port call history (accumulates weekly via scripts/sync_gfw.mjs)
create table if not exists port_calls (
  id           uuid primary key default gen_random_uuid(),
  vessel_id    integer references vessels(id) on delete cascade,
  port_name    text,          -- GFW endAnchorage name (e.g. "HAMBURG")
  port_flag    text,          -- ISO3 country code (e.g. "DEU")
  port_city    text,          -- reverse-geocoded (Nominatim), latest calls only
  port_state   text,
  port_country text,
  lat          numeric,       -- endAnchorage position
  lon          numeric,
  arrived_at   timestamptz,   -- event start
  departed_at  timestamptz,   -- event end
  duration_hrs numeric,       -- port_visit.durationHrs
  confidence   smallint,      -- port_visit.confidence (2=low..4=high)
  recorded_at  timestamptz default now(),
  unique(vessel_id, arrived_at)
);

create index if not exists idx_port_calls_vessel_arrived
  on port_calls (vessel_id, arrived_at desc);

-- Latest port call per vessel — used by getAllVessels() join, detail page,
-- and the last_port search mode
drop view if exists vessel_last_port;
create view vessel_last_port as
select distinct on (vessel_id)
  vessel_id, port_name, port_flag, port_city, port_state, port_country,
  lat, lon, arrived_at, departed_at, duration_hrs
from port_calls
order by vessel_id, arrived_at desc;

-- At-sea station-keeping/work periods (GFW loitering events) — combined with
-- port_calls these form the vessel's historic track
-- (mirrors supabase/migrations/20260714_loitering_events.sql)
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

-- ── Page-view analytics ──────────────────────────────────────────────────────
-- (mirrors supabase/migrations/20260423_page_views*.sql + 20260715_page_views_user_role.sql)
-- Written by POST /api/analytics/pageview; read by get_analytics_v2 /
-- get_country_pages RPCs (supabase/get_analytics_v2.sql, supabase/get_country_pages.sql).
create table if not exists page_views (
  id           uuid        primary key default gen_random_uuid(),
  site         text        not null check (site in ('app', 'cms')),
  path         text        not null,
  referrer     text,
  user_agent   text,
  country      text,                    -- ISO code from x-vercel-ip-country
  visitor_hash text,                    -- daily-rotating sha256(date:ip:ua) prefix
  user_role    text,                    -- null = anonymous; 'scientist' | 'operator' | 'admin'
  created_at   timestamptz not null default now()
);

create index if not exists page_views_created_at_idx   on page_views (created_at desc);
create index if not exists page_views_site_path_idx    on page_views (site, path);
create index if not exists page_views_visitor_hash_idx on page_views (visitor_hash, created_at);

alter table page_views enable row level security;
-- No anon insert policy: all writes go through POST /api/analytics/pageview
-- (service role, bot-filtered). Dropped 20260803 — the CMS's old direct-insert
-- path was the bots' way in.


-- ============================================================
-- Admin email stats footer
-- (mirrors supabase/migrations/20260811_admin_stats_footer.sql)
-- ============================================================
-- Monthly signup/listing counts appended to every notifyAdmins() email.
-- Counts by CURRENT profile role (role mutates on claim approval — accepted
-- drift); vessels_listed by vessels.created_at (null = legacy import, skipped).
create or replace function get_signup_stats()
returns table (metric text, this_month bigint, last_month bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', now())                     as cur_start,
           date_trunc('month', now()) - interval '1 month' as prev_start
  )
  select 'researcher_signups'::text,
         count(*) filter (where p.created_at >= b.cur_start),
         count(*) filter (where p.created_at >= b.prev_start and p.created_at < b.cur_start)
    from profiles p, bounds b where p.role = 'scientist'
  union all
  select 'operator_signups',
         count(*) filter (where p.created_at >= b.cur_start),
         count(*) filter (where p.created_at >= b.prev_start and p.created_at < b.cur_start)
    from profiles p, bounds b where p.role = 'operator'
  union all
  select 'vessels_listed',
         count(*) filter (where v.created_at >= b.cur_start),
         count(*) filter (where v.created_at >= b.prev_start and v.created_at < b.cur_start)
    from vessels v, bounds b;
$$;

revoke execute on function get_signup_stats() from public, anon, authenticated;

-- File the pending vessel claim in SQL at signup, in the same transaction as
-- the profile. Previously done over HTTP by /api/hooks/new-profile, where a
-- fire-and-forget pg_net delivery failure silently lost the claim. The webhook
-- now only sends admin email. See 20260812_claim_insert_in_trigger.sql.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
  declare
    claim     jsonb := new.raw_user_meta_data -> 'pending_claim';
    full_name text;
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

    -- Stashed by app/claim/ClaimSignupForm.tsx at signup.
    if claim is not null
       and coalesce(claim->>'vessel_id', '')   <> ''
       and coalesce(claim->>'vessel_name', '') <> ''
       and coalesce(claim->>'message', '')     <> ''
    then
      begin
        full_name := nullif(trim(concat_ws(' ',
          new.raw_user_meta_data->>'first_name',
          new.raw_user_meta_data->>'last_name')), '');

        -- role/organization/claimant_name are NOT NULL; metadata may not have them.
        insert into public.vessel_claims
          (vessel_id, vessel_name, user_id, claimant_name, email, role, organization, message)
        values (
          (claim->>'vessel_id')::int,
          claim->>'vessel_name',
          new.id,
          coalesce(full_name, 'Unknown'),
          coalesce(new.email, ''),
          coalesce(new.raw_user_meta_data->>'title', ''),
          coalesce(new.raw_user_meta_data->>'institution', ''),
          claim->>'message'
        );
      exception when others then
        -- A malformed claim must never block account creation.
        raise warning 'handle_new_user: claim insert failed for user %: %', new.id, sqlerrm;
      end;
    end if;

    return new;
  end;
$$;

-- New-signup webhook: pg_net POST from the DB to /api/hooks/new-profile on
-- profile creation. Email-only — the claim is filed by handle_new_user above.
-- URL + secret live in app_config (the secret is inserted out of band, never
-- committed). See 20260808_new_profile_webhook.sql.
create extension if not exists pg_net;

create table if not exists app_config (
  key   text primary key,
  value text not null
);
alter table app_config enable row level security;
revoke all on app_config from public, anon, authenticated;

insert into app_config (key, value)
values ('new_profile_webhook_url', 'https://vesselconnect.org/api/hooks/new-profile')
on conflict (key) do update set value = excluded.value;

create or replace function public.notify_new_profile_webhook()
returns trigger language plpgsql security definer set search_path = public as $$
  declare
    url    text;
    secret text;
  begin
    select value into url    from app_config where key = 'new_profile_webhook_url';
    select value into secret from app_config where key = 'webhook_secret';

    if coalesce(url, '') = '' or coalesce(secret, '') = '' then
      raise warning 'new-profile webhook unconfigured; skipped for user %', new.id;
      return new;
    end if;

    perform net.http_post(
      url     := url,
      body    := jsonb_build_object(
        'type', 'INSERT', 'table', 'profiles', 'schema', 'public',
        'record', to_jsonb(new)
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', secret
      )
    );
    return new;
  exception when others then
    -- Email is best-effort; never block the signup transaction.
    raise warning 'new-profile webhook failed for user %: %', new.id, sqlerrm;
    return new;
  end;
$$;

drop trigger if exists profiles_new_user_webhook on public.profiles;
create trigger profiles_new_user_webhook
  after insert on public.profiles
  for each row execute function public.notify_new_profile_webhook();

-- ── Ad-click attribution on profiles (20260812) ──────────────────────────────
-- Which Google Ads click (if any) brought the signup: landing page stores
-- ?gclid=/?wbraid=/?gbraid= (lib/ad-attribution.ts), signup metadata carries
-- it, handle_new_user copies it here. Source of truth for offline conversion
-- uploads to Google Ads and "signups via ads" stats. At most one id is set.
alter table public.profiles
  add column if not exists gclid          text,
  add column if not exists wbraid         text,
  add column if not exists gbraid         text,
  add column if not exists ad_landing_at  timestamptz;

-- Redefined to copy the ad-click fields (supersedes the definition above;
-- claim logic unchanged). See supabase/migrations/20260812_gclid_attribution.sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    claim      jsonb := new.raw_user_meta_data -> 'pending_claim';
    full_name  text;
    landing_at timestamptz;
  begin
    -- Signup metadata is client-controlled; a malformed timestamp must never
    -- block account creation.
    begin
      landing_at := (new.raw_user_meta_data->>'ad_landing_at')::timestamptz;
    exception when others then
      landing_at := null;
    end;

    insert into public.profiles
      (id, email, first_name, last_name, institution, title, profile_url,
       gclid, wbraid, gbraid, ad_landing_at)
    values (
      new.id,
      new.email,
      new.raw_user_meta_data->>'first_name',
      new.raw_user_meta_data->>'last_name',
      new.raw_user_meta_data->>'institution',
      new.raw_user_meta_data->>'title',
      new.raw_user_meta_data->>'profile_url',
      new.raw_user_meta_data->>'gclid',
      new.raw_user_meta_data->>'wbraid',
      new.raw_user_meta_data->>'gbraid',
      landing_at
    );

    -- Stashed by app/claim/ClaimSignupForm.tsx at signup. Same three-field
    -- guard the old TypeScript path used.
    if claim is not null
       and coalesce(claim->>'vessel_id', '')   <> ''
       and coalesce(claim->>'vessel_name', '') <> ''
       and coalesce(claim->>'message', '')     <> ''
    then
      begin
        full_name := nullif(trim(concat_ws(' ',
          new.raw_user_meta_data->>'first_name',
          new.raw_user_meta_data->>'last_name')), '');

        -- role/organization/claimant_name are NOT NULL; metadata may not have them.
        insert into public.vessel_claims
          (vessel_id, vessel_name, user_id, claimant_name, email, role, organization, message)
        values (
          (claim->>'vessel_id')::int,
          claim->>'vessel_name',
          new.id,
          coalesce(full_name, 'Unknown'),
          coalesce(new.email, ''),
          coalesce(new.raw_user_meta_data->>'title', ''),
          coalesce(new.raw_user_meta_data->>'institution', ''),
          claim->>'message'
        );
      exception when others then
        -- A malformed claim must never block account creation.
        raise warning 'handle_new_user: claim insert failed for user %: %', new.id, sqlerrm;
      end;
    end if;

    return new;
  end;
  $function$;

-- vessel_operators: many-to-many operator <-> vessel (VESSEL_OPERATORS_PLAN.md
-- Phase 0). Operator-ness becomes a per-vessel fact, not a profiles.role value.
-- Backfilled from profiles.vessel_id UNION approved vessel_claims (the old
-- single-vessel model overwrote profile links on each new approval).
create table if not exists vessel_operators (
  user_id    uuid        not null references profiles(id) on delete cascade,
  vessel_id  integer     not null references vessels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vessel_id)
);
create index if not exists idx_vessel_operators_vessel on vessel_operators (vessel_id);

alter table vessel_operators enable row level security;
create policy "own_memberships_select" on vessel_operators
  for select using (auth.uid() = user_id);

-- Membership-based read paths (vessel_operators redesign Phases 1-4).
-- Supersede the role/vessel_id-based versions above.
create or replace function public.message_unread_count(p_user_id uuid)
returns integer language sql stable as $$
  select
    coalesce((
      select count(*) from messages m
      where m.thread_id = m.id and m.status = 'new' and m.author_id <> p_user_id
        and m.vessel_id in (select vessel_id from vessel_operators where user_id = p_user_id)
    ), 0)::int
    +
    coalesce((
      select count(*) from messages root
      where root.author_id = p_user_id and root.thread_id = root.id
        and exists (
          select 1 from messages m2
          where m2.thread_id = root.id and m2.author_role = 'operator'
            and m2.created_at > coalesce(root.scientist_read_at, '-infinity'::timestamptz)
        )
    ), 0)::int
$$;

create or replace function get_signup_stats()
returns table (metric text, this_month bigint, last_month bigint)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select date_trunc('month', now())                     as cur_start,
           date_trunc('month', now()) - interval '1 month' as prev_start
  ),
  first_membership as (
    select user_id, min(created_at) as first_at from vessel_operators group by user_id
  )
  select 'researcher_signups'::text,
         count(*) filter (where p.created_at >= b.cur_start),
         count(*) filter (where p.created_at >= b.prev_start and p.created_at < b.cur_start)
    from profiles p, bounds b where p.role = 'scientist'
  union all
  select 'operator_signups',
         count(*) filter (where f.first_at >= b.cur_start),
         count(*) filter (where f.first_at >= b.prev_start and f.first_at < b.cur_start)
    from first_membership f, bounds b
  union all
  select 'vessels_listed',
         count(*) filter (where v.created_at >= b.cur_start),
         count(*) filter (where v.created_at >= b.prev_start and v.created_at < b.cur_start)
    from vessels v, bounds b;
$$;

-- Operator-reported vessel positions (insert-only; GFW's vessel_last_port is
-- never overwritten — readers pick the freshest source). See
-- 20260812_vessel_position_reports.sql.
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
alter table vessel_position_reports enable row level security;
revoke all on vessel_position_reports from public, anon, authenticated;

-- Storage policies: claim-documents uploads (was missing entirely — every
-- claim doc upload failed) + vessel doc/photo upload rights now follow
-- vessel_operators membership instead of profiles.role. See
-- 20260812_storage_policies.sql.
create policy "Authenticated users can upload claim documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'claim-documents'
  and (storage.foldername(name))[1] = 'claims'
);

drop policy if exists "Operators and admins can upload vessel docs" on storage.objects;
create policy "Operators and admins can upload vessel docs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-docs'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
);

drop policy if exists "Operators and admins can upload vessel photos" on storage.objects;
create policy "Operators and admins can upload vessel photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-photos'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
);

-- Role → is_admin (see 20260812_is_admin_column.sql for the additive half and
-- 20260812_drop_role_column.sql for the drop, which runs only after deploy).
-- profiles.role/vessel_id are superseded: admin = is_admin, operator =
-- vessel_operators membership. The role-based get_signup_stats and storage
-- policies above are superseded by the versions below.
alter table profiles
  add column if not exists is_admin boolean not null default false;

create or replace function get_signup_stats()
returns table (metric text, this_month bigint, last_month bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', now())                     as cur_start,
           date_trunc('month', now()) - interval '1 month' as prev_start
  ),
  first_membership as (
    select user_id, min(created_at) as first_at from vessel_operators group by user_id
  )
  select 'researcher_signups'::text,
         count(*) filter (where p.created_at >= b.cur_start),
         count(*) filter (where p.created_at >= b.prev_start and p.created_at < b.cur_start)
    from profiles p, bounds b where not p.is_admin
  union all
  select 'operator_signups',
         count(*) filter (where f.first_at >= b.cur_start),
         count(*) filter (where f.first_at >= b.prev_start and f.first_at < b.cur_start)
    from first_membership f, bounds b
  union all
  select 'vessels_listed',
         count(*) filter (where v.created_at >= b.cur_start),
         count(*) filter (where v.created_at >= b.prev_start and v.created_at < b.cur_start)
    from vessels v, bounds b;
$$;

-- Storage upload policies: the admin arm keyed on profiles.role.
drop policy if exists "Operators and admins can upload vessel docs" on storage.objects;
create policy "Operators and admins can upload vessel docs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-docs'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  )
);

drop policy if exists "Operators and admins can upload vessel photos" on storage.objects;
create policy "Operators and admins can upload vessel photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-photos'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  )
);

-- Audit trigger must write data_changes regardless of who caused the change
-- (browser profile self-edits run as authenticated, which RLS blocks).
-- See 20260812_audit_trigger_definer.sql.
alter function log_data_changes() security definer set search_path = public;

-- ── vessel_operators absorbs vessel_claims (claim-friction redesign) ─────────
-- Claiming IS becoming an operator: one membership row per user+vessel with a
-- status lever ('active' grants editing/uploads/badges; 'pending' awaits admin
-- activation — used when the vessel already has an operator; 'suspended' is a
-- reversible freeze). Claim context (relationship message, supporting doc)
-- lives on the row. Admin review is non-blocking: confirmed_at/confirmed_by
-- record it. vessel_claims stops receiving writes and remains as read-only
-- history until dropped by a later migration.
-- See supabase/migrations/20260828_operators_absorb_claims.sql.
alter table vessel_operators
  add column if not exists id                 uuid not null default gen_random_uuid(),
  add column if not exists status             text not null default 'active',
  add column if not exists claim_message      text,
  add column if not exists claim_document_url text,
  add column if not exists confirmed_at       timestamptz,
  add column if not exists confirmed_by       uuid references profiles(id),
  add column if not exists admin_notes        text;
alter table vessel_operators
  drop constraint if exists vessel_operators_status_check;
alter table vessel_operators
  add constraint vessel_operators_status_check
  check (status in ('active', 'pending', 'suspended'));
create unique index if not exists idx_vessel_operators_row_id on vessel_operators (id);

-- Moderation actions get the same audit trail as data edits.
drop trigger if exists vessel_operators_audit on vessel_operators;
create trigger vessel_operators_audit after update on vessel_operators
  for each row execute function log_data_changes();

-- Only ACTIVE memberships grant ability (supersedes the membership checks
-- above): unread-badge counting and storage upload rights.
create or replace function public.message_unread_count(p_user_id uuid)
returns integer language sql stable as $$
  select
    coalesce((
      select count(*) from messages m
      where m.thread_id = m.id and m.status = 'new' and m.author_id <> p_user_id
        and m.vessel_id in (select vessel_id from vessel_operators
                             where user_id = p_user_id and status = 'active')
    ), 0)::int
    +
    coalesce((
      select count(*) from messages root
      where root.author_id = p_user_id and root.thread_id = root.id
        and exists (
          select 1 from messages m2
          where m2.thread_id = root.id and m2.author_role = 'operator'
            and m2.created_at > coalesce(root.scientist_read_at, '-infinity'::timestamptz)
        )
    ), 0)::int
$$;

drop policy if exists "Operators and admins can upload vessel docs" on storage.objects;
create policy "Operators and admins can upload vessel docs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-docs'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid() and status = 'active')
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  )
);

drop policy if exists "Operators and admins can upload vessel photos" on storage.objects;
create policy "Operators and admins can upload vessel photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-photos'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid() and status = 'active')
    or exists (select 1 from profiles where id = auth.uid() and is_admin)
  )
);

-- Signup-path claims write vessel_operators directly (supersedes the
-- handle_new_user above; profile insert unchanged — the pending_claim branch
-- creates the membership itself instead of a vessel_claims row).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    claim      jsonb := new.raw_user_meta_data -> 'pending_claim';
    landing_at timestamptz;
    v_id       int;
  begin
    -- Signup metadata is client-controlled; a malformed timestamp must never
    -- block account creation.
    begin
      landing_at := (new.raw_user_meta_data->>'ad_landing_at')::timestamptz;
    exception when others then
      landing_at := null;
    end;

    insert into public.profiles
      (id, email, first_name, last_name, institution, title, profile_url,
       gclid, wbraid, gbraid, ad_landing_at)
    values (
      new.id,
      new.email,
      new.raw_user_meta_data->>'first_name',
      new.raw_user_meta_data->>'last_name',
      new.raw_user_meta_data->>'institution',
      new.raw_user_meta_data->>'title',
      new.raw_user_meta_data->>'profile_url',
      new.raw_user_meta_data->>'gclid',
      new.raw_user_meta_data->>'wbraid',
      new.raw_user_meta_data->>'gbraid',
      landing_at
    );

    -- Stashed by app/claim/ClaimSignupForm.tsx at signup. First claimant of an
    -- unclaimed vessel becomes an active operator immediately; a vessel that
    -- already has any membership row gets a pending one instead.
    if claim is not null
       and coalesce(claim->>'vessel_id', '')   <> ''
       and coalesce(claim->>'message', '')     <> ''
    then
      begin
        v_id := (claim->>'vessel_id')::int;
        insert into public.vessel_operators (user_id, vessel_id, status, claim_message)
        values (
          new.id,
          v_id,
          case when exists (select 1 from public.vessel_operators where vessel_id = v_id)
               then 'pending' else 'active' end,
          claim->>'message'
        )
        on conflict (user_id, vessel_id) do nothing;
      exception when others then
        -- A malformed claim must never block account creation.
        raise warning 'handle_new_user: membership insert failed for user %: %', new.id, sqlerrm;
      end;
    end if;

    return new;
  end;
  $function$;

-- ── Cruise scheduling v0 (2026-09-23): organizations, cruises, cruise_legs ──
-- Mirror of supabase/migrations/20260923_cruises.sql

-- ── organizations ────────────────────────────────────────────────────────────
-- Operators / institutions. Minimal for now: today an org only exists as text
-- on vessels (operator_name / owner / affiliation). Cleanup + full backfill of
-- vessels.organization_id is a separate pass; here only the 16 MFP operators.
create table if not exists organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  short_name          text,                       -- 'SIO', 'WHOI'
  kind                text not null default 'operator', -- operator | institution | agency | company | other
  website             text,
  country             text,
  mfp_organisation_id integer unique,             -- MFP Organisation_id, for sync joins
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists organizations_name_key on organizations (lower(name));

alter table vessels add column if not exists organization_id uuid references organizations(id);
create index if not exists vessels_organization_id_idx on vessels (organization_id);

-- The 16 UNOLS operator organisations as MFP lists them (id = MFP Organisation_id).
insert into organizations (name, short_name, kind, mfp_organisation_id) values
  ('University-National Oceanographic Laboratory System', 'UNOLS',   'operator', 1),
  ('Scripps Institution of Oceanography',                 'SIO',     'operator', 4),
  ('University of Washington',                            'UW',      'operator', 5),
  ('Woods Hole Oceanographic Institution',                'WHOI',    'operator', 6),
  ('Skidaway Institute of Oceanography',                  'SkIO',    'operator', 7),
  ('University of Alaska Fairbanks',                      'UAF',     'operator', 8),
  ('Lamont-Doherty Earth Observatory',                    'LDEO',    'operator', 9),
  ('University of Hawaii',                                'UH',      'operator', 10),
  ('Oregon State University',                             'OSU',     'operator', 11),
  ('University of Rhode Island',                          'URI',     'operator', 12),
  ('Bermuda Institute of Ocean Sciences',                 'BIOS',    'operator', 13),
  ('University of Delaware',                              'UDel',    'operator', 14),
  ('Louisiana Universities Marine Consortium',            'LUMCON',  'operator', 15),
  ('University of Miami',                                 'UMIAMI',  'operator', 16),
  ('University of Minnesota Duluth',                      'UMN',     'operator', 17),
  ('United States Coast Guard',                           'USCG',    'operator', 772)
on conflict (mfp_organisation_id) do nothing;

alter table organizations enable row level security;
create policy "organizations_public_read" on organizations for select using (true);

-- ── cruises ──────────────────────────────────────────────────────────────────
create table if not exists cruises (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id),
  vessel_id             integer not null references vessels(id),
  created_by            uuid references profiles(id),      -- null for imports
  project_id            uuid,                              -- hook; no table yet
  proposal_id           uuid,                              -- hook; no table yet

  title                 text not null,
  cruise_code           text,                              -- operator's code: 'SKQ2610S', 'AR84-03'
  summary               text,

  -- where: same pair as vessels.operating_area / operating_area_geojson so the
  -- existing map rendering applies unchanged. geojson is a FeatureCollection.
  operating_area        text,
  operating_area_geojson jsonb,

  -- when: the calendar block. mob/demob are part of the cruise (operator's view).
  mobilization_at       timestamptz,
  departure_at          timestamptz not null,
  arrival_at            timestamptz not null,
  demobilization_at     timestamptz,
  actual_departure_at   timestamptz,
  actual_arrival_at     timestamptz,

  -- who / how many
  science_party_size    integer,
  berths_total          integer,                           -- snapshot of vessels.scientists at creation; editable
  berths_open           integer,                           -- null = unknown (never 0 by default)

  -- lifecycle as flags, not a status column
  confirmed_at          timestamptz,
  confirmed_by          uuid references profiles(id),
  cancelled_at          timestamptz,
  cancelled_by          uuid references profiles(id),
  published_at          timestamptz,                       -- null = not on the public calendar

  -- provenance
  source                text not null default 'vesselconnect', -- vesselconnect | unols_mfp
  external_id           text,                              -- MFP CruiseApplication_id
  external_refs         jsonb,                             -- {workflow_id, voyage_event_id, cruise_id, reference_number, organisation_id}
  raw                   jsonb,                             -- source record (PI, funding, equipment ids…) until those tables exist
  synced_at             timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint cruises_dates_check check (arrival_at >= departure_at),
  constraint cruises_berths_check check (berths_open is null or berths_total is null or berths_open <= berths_total),
  constraint cruises_source_check check (source in ('vesselconnect', 'unols_mfp'))
);
create unique index if not exists cruises_source_external_id_key on cruises (source, external_id) where external_id is not null;
create index if not exists cruises_vessel_departure_idx on cruises (vessel_id, departure_at);
create index if not exists cruises_organization_idx on cruises (organization_id);
create index if not exists cruises_published_departure_idx on cruises (departure_at) where published_at is not null and cancelled_at is null;

alter table cruises enable row level security;
create policy "cruises_public_read" on cruises for select using (published_at is not null);

-- ── cruise_legs ──────────────────────────────────────────────────────────────
-- A leg is a port-to-port segment of the vessel's track (MFP "Destination").
-- What happens at sea (stations, dives, moorings) is NOT a leg; that is a later
-- cruise_activities table. Ports are text + optional UN/LOCODE + coords for now;
-- a ports table can be joined on unlocode later.
create table if not exists cruise_legs (
  id                uuid primary key default gen_random_uuid(),
  cruise_id         uuid not null references cruises(id) on delete cascade,
  seq               integer not null,

  depart_port       text not null,
  depart_unlocode   text,                                  -- 'USLWP'
  depart_lat        double precision,
  depart_lon        double precision,
  depart_at         timestamptz not null,

  arrive_port       text not null,
  arrive_unlocode   text,
  arrive_lat        double precision,
  arrive_lon        double precision,
  arrive_at         timestamptz not null,

  notes             text,
  external_id       text,                                  -- MFP Destination_id
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint cruise_legs_seq_key unique (cruise_id, seq),
  constraint cruise_legs_dates_check check (arrive_at >= depart_at)
);
create index if not exists cruise_legs_cruise_idx on cruise_legs (cruise_id);

alter table cruise_legs enable row level security;
create policy "cruise_legs_public_read" on cruise_legs for select
  using (exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null));

-- ── updated_at ───────────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger organizations_set_updated_at before update on organizations for each row execute function set_updated_at();
create trigger cruises_set_updated_at       before update on cruises       for each row execute function set_updated_at();
create trigger cruise_legs_set_updated_at   before update on cruise_legs   for each row execute function set_updated_at();

-- ── Cruise slugs (2026-09-23) — mirror of supabase/migrations/20260923_cruise_slugs.sql ──
create or replace function slugify(input text) returns text
  immutable language sql as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'))
$$;

alter table cruises add column if not exists slug text;

-- Base slug for a cruise row (no collision suffix).
create or replace function cruise_base_slug(p_vessel_id integer, p_code text, p_title text, p_departure timestamptz)
  returns text stable language sql as $$
  select left(slugify((select name from vessels where id = p_vessel_id)), 40)
      || '-' || left(slugify(coalesce(nullif(trim(p_code), ''), p_title)), 60)
      || '-' || to_char(p_departure at time zone 'utc', 'YYYY-MM')
$$;

-- Backfill: number collisions in departure order so recurring cruises read
-- 'walton-smith-flotsum-2026-10', '…-2026-10-2'.
with base as (
  select c.id,
         cruise_base_slug(c.vessel_id, c.cruise_code, c.title, c.departure_at) as s,
         row_number() over (
           partition by cruise_base_slug(c.vessel_id, c.cruise_code, c.title, c.departure_at)
           order by c.departure_at, c.created_at, c.id
         ) as rn
  from cruises c
  where c.slug is null
)
update cruises set slug = case when base.rn = 1 then base.s else base.s || '-' || base.rn end
from base where cruises.id = base.id;

alter table cruises alter column slug set not null;
create unique index if not exists cruises_slug_key on cruises (slug);

-- Fill slug on insert when omitted; bump a numeric suffix until unique.
create or replace function cruises_fill_slug() returns trigger language plpgsql as $$
declare
  base text; candidate text; n integer := 1;
begin
  if new.slug is not null and new.slug <> '' then
    new.slug := slugify(new.slug);
    return new;
  end if;
  base := cruise_base_slug(new.vessel_id, new.cruise_code, new.title, new.departure_at);
  candidate := base;
  while exists (select 1 from cruises where slug = candidate and id <> new.id) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.slug := candidate;
  return new;
end $$;
create trigger cruises_fill_slug before insert on cruises for each row execute function cruises_fill_slug();

-- ── Cruise stops + hops (2026-09-24) — mirror of supabase/migrations/20260924_cruise_stops_hops.sql ──
create table if not exists cruise_stops (
  id            uuid primary key default gen_random_uuid(),
  cruise_id     uuid not null references cruises(id) on delete cascade,
  leg_id        uuid references cruise_legs(id) on delete set null,   -- null = couldn't be placed in a leg
  seq           integer not null,                                      -- sailing order within the cruise
  kind          text not null,                                         -- port | station | mooring | lander | vehicle | glider | waypoint | other
  name          text,                                                  -- 'VLF-E', 'Station 12', 'Nome'
  lat           double precision not null,
  lon           double precision not null,
  station_hours numeric,                                               -- planned time on station
  depth_m       numeric,
  activity      text,                                                  -- free text for now ('recover mooring')
  asset_id      uuid,                                                  -- hook: persistent sea asset (moorings table, later)
  external_id   text,                                                  -- MFP Link_id
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cruise_stops_kind_check check (kind in ('port','station','mooring','lander','vehicle','glider','waypoint','other')),
  constraint cruise_stops_seq_key unique (cruise_id, seq)
);
create index if not exists cruise_stops_cruise_idx on cruise_stops (cruise_id, seq);
create index if not exists cruise_stops_leg_idx on cruise_stops (leg_id);

create table if not exists cruise_hops (
  id            uuid primary key default gen_random_uuid(),
  cruise_id     uuid not null references cruises(id) on delete cascade,
  from_stop_id  uuid not null references cruise_stops(id) on delete cascade,
  to_stop_id    uuid not null references cruise_stops(id) on delete cascade,
  seq           integer not null,                                      -- sailing order within the cruise
  hours         numeric,                                               -- planned steaming time
  speed_kn      numeric,
  distance_nm   numeric,                                               -- null until computed from the track
  track         jsonb,                                                 -- GeoJSON LineString geometry (routed path); null = straight line
  external_id   text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cruise_hops_seq_key unique (cruise_id, seq),
  constraint cruise_hops_ends_check check (from_stop_id <> to_stop_id)
);
create index if not exists cruise_hops_cruise_idx on cruise_hops (cruise_id, seq);

alter table cruise_stops enable row level security;
alter table cruise_hops  enable row level security;
create policy "cruise_stops_public_read" on cruise_stops for select
  using (exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null));
create policy "cruise_hops_public_read" on cruise_hops for select
  using (exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null));

create trigger cruise_stops_set_updated_at before update on cruise_stops for each row execute function set_updated_at();
create trigger cruise_hops_set_updated_at  before update on cruise_hops  for each row execute function set_updated_at();

-- ── Cruise scheduling v0.1 (2026-09-30): cruise_projects ──
-- Mirror of supabase/migrations/20260930_cruise_projects.sql (table/policy only; backfill + merge live in the migration).
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
  science_party_size integer,              -- this project's headcount; cruises.science_party_size = sum
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
-- That migration also drops cruises.external_id, raw, project_id, proposal_id and cruises_source_external_id_key.

-- ── Equipment (2026-10-01): equipment_types, equipment, equipment_locations, cruise_equipment ──
-- Mirror of supabase/migrations/20261001_equipment.sql
-- ── taxonomy ────────────────────────────────────────────────────────────────
create table if not exists equipment_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- 'Rosette', 'Multicorer', 'Echo sounder system'
  category    text,                          -- sampling | sensor | acoustic | deck | lab | nav_comms | vehicle | other
  parent_id   uuid references equipment_types(id),   -- sub-type: 'Gravity corer' under 'Corer'. Taxonomy, not physical nesting.
  synonyms    text[],                        -- for matching free text (SME forms, vessels.* capability columns)
  created_by  uuid references profiles(id),  -- null = seed
  created_at  timestamptz not null default now()
);

-- (type seed: see the migration)

-- ── units (the inventory) ───────────────────────────────────────────────────
create table if not exists equipment (
  id                uuid primary key default gen_random_uuid(),
  equipment_type_id uuid references equipment_types(id),
  organization_id   uuid references organizations(id),   -- who owns / operates it
  name              text not null,
  model             text,
  manufacturer      text,
  serial_number     text,
  group_name        text,                                -- MFP Group: 'BIOS/ MTG'
  notes             text,
  source            text not null default 'vesselconnect',  -- vesselconnect | unols_mfp_inventory
  external_id       text,                                -- MFP Equipment_id
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists equipment_external_key on equipment (source, external_id) where external_id is not null;
create index if not exists equipment_org_idx on equipment (organization_id);
create index if not exists equipment_type_idx on equipment (equipment_type_id);

-- ── where a unit is (log of stays) ──────────────────────────────────────────
-- One row per stay; to_at null = current. Exactly one open row per unit. A stay is aboard a
-- vessel, or ashore at an organization's place. Seeded from the inventory's BaseLocation.
create table if not exists equipment_locations (
  id              uuid primary key default gen_random_uuid(),
  equipment_id    uuid not null references equipment(id) on delete cascade,
  vessel_id       integer references vessels(id),
  organization_id uuid references organizations(id),
  place           text,                                  -- 'OSU Marine Operations Facility in Newport, Oregon'
  from_at         timestamptz not null default now(),
  to_at           timestamptz,
  cruise_id       uuid references cruises(id) on delete set null,  -- the cruise that moved it, if any
  notes           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  constraint equipment_locations_somewhere check (vessel_id is not null or organization_id is not null or place is not null),
  constraint equipment_locations_dates check (to_at is null or to_at > from_at)
);
create index if not exists equipment_locations_unit_idx on equipment_locations (equipment_id, from_at desc);
create index if not exists equipment_locations_vessel_idx on equipment_locations (vessel_id) where to_at is null;
create unique index if not exists equipment_locations_current_key on equipment_locations (equipment_id) where to_at is null;

-- Current location of every unit, for the vessel page and the timeline row label.
create or replace view equipment_current_location as
  select l.equipment_id, l.vessel_id, l.organization_id, l.place, l.from_at
  from equipment_locations l where l.to_at is null;

-- ── what a cruise carries ───────────────────────────────────────────────────
-- "Keep the free text, add the link": label is what the PI wrote; type/item fill in when matched.
create table if not exists cruise_equipment (
  id                uuid primary key default gen_random_uuid(),
  cruise_id         uuid not null references cruises(id) on delete cascade,
  label             text not null,
  equipment_type_id uuid references equipment_types(id),
  equipment_id      uuid references equipment(id),
  provided_by       text,                                -- ship | pool | science_party
  quantity          integer,
  notes             text,
  source            text not null default 'vesselconnect',  -- vesselconnect | unols_mfp_sme
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint cruise_equipment_provided_check check (provided_by is null or provided_by in ('ship', 'pool', 'science_party'))
);
create index if not exists cruise_equipment_cruise_idx on cruise_equipment (cruise_id);
create index if not exists cruise_equipment_item_idx on cruise_equipment (equipment_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table equipment_types     enable row level security;
alter table equipment           enable row level security;
alter table equipment_locations enable row level security;
alter table cruise_equipment    enable row level security;
create policy "equipment_types_public_read"     on equipment_types     for select using (true);
create policy "equipment_public_read"           on equipment           for select using (true);
create policy "equipment_locations_public_read" on equipment_locations for select using (true);
create policy "cruise_equipment_public_read" on cruise_equipment for select
  using (exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null));

create trigger equipment_set_updated_at        before update on equipment        for each row execute function set_updated_at();
create trigger cruise_equipment_set_updated_at before update on cruise_equipment for each row execute function set_updated_at();

-- ── Profile preferences (2026-10-03) — mirror of supabase/migrations/20261003_profile_preferences.sql ──
alter table profiles add column if not exists preferences jsonb not null default '{}';

-- ── Timeline entries, people, seats, roles, credentials (2026-10-02) ──
-- Mirror of supabase/migrations/20261002_timeline.sql (tables, seeds, RLS; backfill lives in the migration).
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


-- ── Timeline: same-cruise overlaps allowed (2026-10-13) — mirror of supabase/migrations/20261013_timeline_same_cruise.sql ──
-- Double-booking means two DIFFERENT cruises on one resource at once. One person can hold
-- two seats on the same cruise (PI and chief scientist — MFP does this constantly), so the
-- exclusion constraints ignore overlaps within a cruise. A block has no cruise and stands
-- in for itself (coalesce to its own id), so it still conflicts with everything.
alter table timeline_entries
  drop constraint if exists no_vessel_overlap,
  drop constraint if exists no_person_overlap,
  drop constraint if exists no_equipment_overlap;

alter table timeline_entries
  add constraint no_vessel_overlap exclude using gist
    (vessel_id with =, coalesce(cruise_id, id) with <>, tstzrange(start_at, end_at) with &&)
    where (vessel_id is not null and source = 'vesselconnect' and deleted_at is null),
  add constraint no_person_overlap exclude using gist
    (person_id with =, coalesce(cruise_id, id) with <>, tstzrange(start_at, end_at) with &&)
    where (person_id is not null and source = 'vesselconnect' and deleted_at is null),
  add constraint no_equipment_overlap exclude using gist
    (equipment_id with =, coalesce(cruise_id, id) with <>, tstzrange(start_at, end_at) with &&)
    where (equipment_id is not null and source = 'vesselconnect' and deleted_at is null);

-- ── Projects stand alone + bids (2026-10-14) — mirror of supabase/migrations/20261014_projects_and_bids.sql ──
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

-- mirror of supabase/migrations/20261015_project_area_label.sql
alter table projects add column if not exists area_label text;

-- mirror of supabase/migrations/20261015_project_soft_delete.sql
alter table projects add column if not exists deleted_at timestamptz;
drop policy if exists projects_public_read on projects;
drop policy if exists projects_own_read on projects;
create policy projects_public_read on projects for select
  using (deleted_at is null and (published_at is not null
         or exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null)));
create policy projects_own_read on projects for select to authenticated
  using (deleted_at is null and (created_by = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)));

-- mirror of supabase/migrations/20261015_project_people.sql
create table if not exists project_people (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  role_id     uuid not null references cruise_roles(id),
  person_id   uuid references people(id) on delete set null,   -- linked later, when the directory UI exists
  name        text not null,                                   -- as entered
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists project_people_project_idx on project_people (project_id);
alter table project_people enable row level security;
create policy project_people_read on project_people for select
  using (exists (select 1 from projects p where p.id = project_id and p.deleted_at is null
                 and (p.published_at is not null or p.created_by = auth.uid()
                      or exists (select 1 from cruises c where c.id = p.cruise_id and c.published_at is not null))));
create trigger project_people_set_updated_at before update on project_people for each row execute function set_updated_at();
alter table projects drop column if exists pi_name, drop column if exists discipline;

-- mirror of supabase/migrations/20261015_project_slugs.sql (backfill in the migration)
alter table projects add column if not exists slug text not null;
create unique index if not exists projects_slug_key on projects (slug);

-- mirror of supabase/migrations/20261016_cruise_org_nullable.sql
alter table cruises alter column organization_id drop not null;

-- mirror of supabase/migrations/20261016_projects_own_people_gear.sql (data moves live in the migration)
alter table timeline_entries add column if not exists project_person_id uuid references project_people(id) on delete cascade;
create unique index if not exists timeline_entries_project_person_key on timeline_entries (project_person_id) where project_person_id is not null and deleted_at is null;
alter table cruises drop column if exists summary;

-- mirror of supabase/migrations/20261016_project_gear_rls.sql
drop policy if exists project_gear_read on project_gear;
create policy project_gear_read on project_gear for select
  using (exists (select 1 from projects p where p.id = project_id and p.deleted_at is null
                 and (p.published_at is not null or p.created_by = auth.uid()
                      or exists (select 1 from cruises c where c.id = p.cruise_id and c.published_at is not null))));

-- ── fleet_vessels (20261017) ─────────────────────────────────────────────────
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
