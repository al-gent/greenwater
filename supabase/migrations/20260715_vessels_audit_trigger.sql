-- Automatic audit of ALL vessels updates (2026-07-15)
-- Column-level diff of every UPDATE into vessel_data_changes; scripts no
-- longer need to hand-log vessels changes. Bookkeeping columns excluded.

create or replace function log_vessel_changes() returns trigger as $$
declare
  k text;
  oldj jsonb := to_jsonb(OLD);
  newj jsonb := to_jsonb(NEW);
  actor text;
begin
  -- who: user uuid via PostgREST JWT when present, else the DB role (scripts/psql)
  actor := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    session_user::text
  );
  for k in select jsonb_object_keys(newj) loop
    if (oldj -> k) is distinct from (newj -> k)
       and k not in ('last_updated', 'identity_verified_at') then
      insert into vessel_data_changes (vessel_id, field, old_value, new_value, source, batch)
      values (OLD.id, k, nullif(oldj ->> k, ''), nullif(newj ->> k, ''), actor, 'trigger:update');
    end if;
  end loop;
  return NEW;
end
$$ language plpgsql;

drop trigger if exists vessels_audit on vessels;
create trigger vessels_audit
  after update on vessels
  for each row execute function log_vessel_changes();

-- the audit log is server-side only: no API reads/writes
alter table vessel_data_changes enable row level security;
