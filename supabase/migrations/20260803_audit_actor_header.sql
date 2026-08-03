-- Audit attribution fix (2026-08-03). All app edits go through API routes
-- that write as service_role, so every human edit was logged as
-- 'service_role' (rendered "script" in the admin feed). The routes now send
-- the signed-in user's email in an x-audit-actor header (lib/supabase-admin.ts
-- supabaseAdminAs); read it here, ahead of the JWT fallbacks.
-- Spoofing note: the header only matters on connections that can UPDATE the
-- audited tables, i.e. service_role — which our API alone holds.

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
