-- Equipment: taxonomy, units, where each unit is, and what a cruise carries.
-- See CRUISE_SCHEDULING_PLAN.md § equipment. Units are seeded from the 1,013-row ARF
-- public inventory by scripts/import_mfp_equipment.mjs (one-time, from the local snapshot).
--
-- A unit's location is a log of stays (equipment_locations), never a column on the unit:
-- shared gear (lab vans, shared rosettes, the NDSF vehicles) moves between vessels every
-- cruise. There is no "pooled" flag: a unit is shared if its history shows more than one
-- vessel, and it is a timeline resource if a cruise assigns it (MFP's PooledEquipment flag
-- was per-operator noise, see mfp-api/QUIRKS.md #15). Availability (maintenance, out of service) is NOT here: it is a block
-- on timeline_entries, same as a vessel in the yard, once that table gains an equipment_id
-- (RESOURCE_TIMELINE_PLAN.md). Model/manufacturer stay columns on the unit; a model layer
-- can be added later as one column.

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

-- Seed: MFP's inventory Type vocabulary (59 values) plus the types the vessels table's
-- capability columns describe that MFP lacks (CTD, ADCP, multibeam, cranes, A-frames,
-- vehicles, diving). Parents first, then children. Operators can add.
insert into equipment_types (name, category, synonyms) values
  -- sampling
  ('Corer', 'sampling', '{coring,core}'),
  ('Rosette', 'sampling', '{"CTD rosette","water sampler",niskin}'),
  ('Water bottle', 'sampling', '{niskin,"go-flo"}'),
  ('In-Situ Pump', 'sampling', '{"McLane pump"}'),
  ('Sediment Grab', 'sampling', '{"van veen",grab,"benthic grab"}'),
  ('Dredge', 'sampling', '{"rock dredge"}'),
  ('Plankton Net', 'sampling', '{bongo,mocness,"neuston net"}'),
  ('Benthic trawl', 'sampling', '{"otter trawl","beam trawl"}'),
  ('Pelagic trawl', 'sampling', '{"midwater trawl"}'),
  -- sensors
  ('Sensor', 'sensor', null),
  ('CTD', 'sensor', '{"conductivity temperature depth","sea-bird","SBE 9","SBE 911","SBE 19","SBE 25"}'),
  ('Towed CTD', 'sensor', '{"undulating CTD",scanfish,"undulating platform","towed body"}'),
  ('Meteorological station', 'sensor', '{"met station","weather station","met sensors"}'),
  ('Gravity', 'sensor', '{gravimeter}'),
  ('Magnetics', 'sensor', '{magnetometer}'),
  ('Mooring Instrumentation', 'sensor', null),
  ('Sensor Calibration', 'sensor', null),
  ('Source', 'sensor', '{"seismic source","air gun"}'),
  -- acoustic
  ('Echo sounder system', 'acoustic', '{echosounder,fathometer,knudsen}'),
  ('Multibeam echo sounder', 'acoustic', '{multibeam,"swath bathymetry","EM 302","EM 122","EM 710","Reson"}'),
  ('Sub bottom profiler', 'acoustic', '{"sub-bottom",chirp,"3.5 kHz"}'),
  ('Side scan', 'acoustic', '{"side-scan sonar",klein}'),
  ('Sonar', 'acoustic', '{"forward-looking sonar","scanning sonar"}'),
  ('ADCP', 'acoustic', '{"acoustic doppler current profiler","RDI","workhorse","ocean surveyor"}'),
  ('Acoustic positioning', 'acoustic', '{USBL,LBL,"HiPAP","Posidonia"}'),
  ('Acoustic Calibration', 'acoustic', null),
  ('Acoustic synchronisation', 'acoustic', null),
  ('Beacon locators', 'acoustic', '{"acoustic release",transponder}'),
  -- deck
  ('Winches', 'deck', '{winch,"CTD winch","trawl winch","hydrographic winch"}'),
  ('A-frame', 'deck', '{gantry,"stern A-frame","side A-frame","stern gantry"}'),
  ('Crane', 'deck', '{"deck crane","knuckle crane","articulating crane"}'),
  ('Sheaves and blocks', 'deck', '{sheave,block}'),
  ('Slip-ring', 'deck', null),
  ('Cable', 'deck', '{"conducting cable","trawl wire","steel wire","fiber optic cable","0.322"}'),
  ('Frame', 'deck', null),
  ('Mooring handling equipment', 'deck', '{"mooring winch",capstan}'),
  ('Load tests', 'deck', null),
  ('Machine tool', 'deck', '{lathe,"machine shop"}'),
  -- lab
  ('Lab Instrumentation', 'lab', null),
  ('Laboratory container', 'lab', '{"lab van","portable lab","isotope van","radioisotope van","rad van","clean van","clean lab container"}'),
  ('Analysis Equipment', 'lab', null),
  ('Fume Hood', 'lab', null),
  ('Refrigerator', 'lab', '{"walk-in cooler","cold room"}'),
  ('Freezer', 'lab', '{"-80","ultra-low freezer","walk-in freezer"}'),
  ('Water Purification System', 'lab', '{"milli-q","DI water","reverse osmosis"}'),
  ('Liquid Scintillation Counter', 'lab', null),
  ('Storage container', 'lab', null),
  ('Transport container', 'lab', null),
  -- navigation & communications
  ('GPS navigation', 'nav_comms', '{GPS,DGPS,GNSS,"P-code"}'),
  ('Radar', 'nav_comms', '{"S-band","X-band",ARPA}'),
  ('Compasses', 'nav_comms', '{gyrocompass,gyro}'),
  ('Speed log', 'nav_comms', '{"doppler log","EM log"}'),
  ('Communications', 'nav_comms', '{VHF,SSB,"cell phone",radio}'),
  ('Satellite communications', 'nav_comms', '{inmarsat,iridium,VSAT,HiSeasNet,starlink,"fleet broadband"}'),
  ('Data management', 'nav_comms', '{UHDAS,"data logger"}'),
  ('Data acquisition', 'nav_comms', '{"underway system","SCS","MIDAS","data acquisition system"}'),
  ('Computers and peripherals', 'nav_comms', '{"computer network",LAN,plotter}'),
  ('Electrical', 'nav_comms', null),
  -- vehicles
  ('ROV', 'vehicle', '{"remotely operated vehicle",jason,"seabotix"}'),
  ('AUV', 'vehicle', '{"autonomous underwater vehicle",sentry,remus}'),
  ('HOV', 'vehicle', '{"human occupied vehicle","manned submersible",submersible,alvin}'),
  ('USV vehicle', 'vehicle', '{"unmanned surface vehicle",saildrone,"wave glider"}'),
  ('Glider', 'vehicle', '{slocum,"seaglider","spray glider"}'),
  ('Moored profiler', 'vehicle', null),
  ('Profiling Body', 'vehicle', null),
  ('Underwater Camera', 'vehicle', '{"drop camera","towed camera"}'),
  -- added 2026-09-30 for labels on the SME forms that the inventory vocabulary lacked
  ('Underway seawater system', 'sensor', '{"flow-through","underway system",TSG,thermosalinograph}'),
  ('pCO2 system', 'sensor', '{pCO2,"underway pCO2"}'),
  ('XBT', 'sensor', '{"expendable bathythermograph"}'),
  ('Ocean bottom seismometer', 'sensor', '{OBS,OBSIC}'),
  ('Dynamic positioning', 'nav_comms', '{DP,"dynamic positioning"}'),
  ('UAS', 'vehicle', '{drone,"uncrewed aerial system","unmanned aerial"}'),
  ('Seismic system', 'acoustic', '{"portable seismic",streamer,"air gun"}'),
  -- other
  ('Diving equipment', 'other', '{"dive compressor","scuba compressor","dive support","scuba tanks"}'),
  ('Equipment', 'other', null),
  ('Personal Protective Equipment', 'other', '{PPE}')
on conflict (name) do nothing;

-- children: sub-types of a parent above
insert into equipment_types (name, category, parent_id, synonyms)
select v.name, v.category, p.id, v.synonyms::text[]
from (values
  ('Gravity corer', 'sampling', 'Corer', '{"gravity core"}'),
  ('Piston corer', 'sampling', 'Corer', '{"piston core","giant piston corer","jumbo piston corer"}'),
  ('Box corer', 'sampling', 'Corer', '{"box core"}'),
  ('Multicorer', 'sampling', 'Corer', '{"multi-corer","multi corer","megacorer"}'),
  ('Kasten corer', 'sampling', 'Corer', '{"kasten core"}'),
  ('Vibro corer', 'sampling', 'Corer', '{vibracorer,"vibra corer"}')
) as v(name, category, parent, synonyms)
join equipment_types p on p.name = v.parent
on conflict (name) do nothing;

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
