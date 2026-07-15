-- Extend the change audit to profiles, vessel_claims, vessel_submissions
-- (2026-07-15). The table generalizes: table_name + record_id identify any
-- row; vessel_id stays populated where derivable so per-vessel history
-- still shows related profile/claim changes.

alter table vessel_data_changes rename to data_changes;
alter table data_changes
  add column if not exists table_name text not null default 'vessels',
  add column if not exists record_id text;
create index if not exists idx_dc_table on data_changes (table_name);

drop trigger if exists vessels_audit on vessels;
drop function if exists log_vessel_changes();

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
  actor := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    session_user::text
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

create trigger vessels_audit after update on vessels
  for each row execute function log_data_changes();
create trigger profiles_audit after update on profiles
  for each row execute function log_data_changes();
create trigger vessel_claims_audit after update on vessel_claims
  for each row execute function log_data_changes();
create trigger vessel_submissions_audit after update on vessel_submissions
  for each row execute function log_data_changes();
