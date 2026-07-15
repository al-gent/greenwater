-- Audit trail for programmatic vessel-data changes (2026-07-15)
-- Every scripted fill/fix logs old value, new value, and source here, so
-- suspect data can be traced back to the batch that wrote it.
create table if not exists vessel_data_changes (
  id uuid primary key default gen_random_uuid(),
  vessel_id integer references vessels(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  source text,
  batch text not null,
  changed_at timestamptz default now()
);
create index if not exists idx_vdc_vessel on vessel_data_changes (vessel_id);
create index if not exists idx_vdc_batch on vessel_data_changes (batch);
