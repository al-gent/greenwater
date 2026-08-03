-- Audit actor granularity (2026-08-03). Both psql scripts and Supabase
-- dashboard edits run as session_user 'postgres' and were indistinguishable.
-- Append application_name to the session_user fallback: psql via the pooler
-- shows 'postgres via Supavisor'; the dashboard's pg-meta service carries its
-- own name. App-user attribution (header/JWT) is unchanged.

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
