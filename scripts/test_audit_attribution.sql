-- Tests for the log_data_changes() audit trigger, focused on actor
-- attribution (supabase/migrations/20260803_audit_actor_header.sql).
--
-- Run:  psql "$SUPABASE_DB_URL" -f scripts/test_audit_attribution.sql
--
-- Everything runs inside one transaction that is ROLLED BACK — no data is
-- persisted, including the audit rows the tests generate. A failing
-- assertion raises an exception (non-zero psql exit); success prints PASS
-- lines and "ALL TESTS PASSED".
--
-- Note: audit rows are selected by unique content markers (' t1'..' t8'),
-- never by ordering — data_changes.id is a random UUID and changed_at is
-- the transaction timestamp, so neither orders rows within this test.

begin;

do $$
declare
  vid integer;
  pid uuid;
  src text;
  n integer;
begin
  select id into vid from vessels order by id limit 1;
  if vid is null then raise exception 'no vessels to test against'; end if;

  ---------------------------------------------------------------------------
  -- 1. x-audit-actor header wins over JWT claims
  ---------------------------------------------------------------------------
  perform set_config('request.headers', '{"x-audit-actor":"lisa@example.com"}', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"service_role"}', true);
  update vessels set notes = coalesce(notes, '') || ' t1' where id = vid;
  select source into src from data_changes
    where vessel_id = vid and field = 'notes' and new_value like '% t1';
  if src is distinct from 'lisa@example.com' then
    raise exception 'T1 FAIL: expected header actor, got %', src;
  end if;
  raise notice 'T1 PASS: header actor wins (%)', src;

  ---------------------------------------------------------------------------
  -- 2. No header → falls back to JWT sub
  ---------------------------------------------------------------------------
  perform set_config('request.headers', '', true);
  update vessels set notes = coalesce(notes, '') || ' t2' where id = vid;
  select source into src from data_changes
    where vessel_id = vid and field = 'notes' and new_value like '% t2';
  if src is distinct from '00000000-0000-0000-0000-000000000001' then
    raise exception 'T2 FAIL: expected jwt sub, got %', src;
  end if;
  raise notice 'T2 PASS: jwt sub fallback (%)', src;

  ---------------------------------------------------------------------------
  -- 3. No header, no sub → falls back to JWT role
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update vessels set notes = coalesce(notes, '') || ' t3' where id = vid;
  select source into src from data_changes
    where vessel_id = vid and field = 'notes' and new_value like '% t3';
  if src is distinct from 'service_role' then
    raise exception 'T3 FAIL: expected jwt role, got %', src;
  end if;
  raise notice 'T3 PASS: jwt role fallback (%)', src;

  ---------------------------------------------------------------------------
  -- 4. Nothing set at all (psql/scripts) → session_user
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '', true);
  update vessels set notes = coalesce(notes, '') || ' t4' where id = vid;
  select source into src from data_changes
    where vessel_id = vid and field = 'notes' and new_value like '% t4';
  if src is distinct from session_user::text then
    raise exception 'T4 FAIL: expected session_user %, got %', session_user, src;
  end if;
  raise notice 'T4 PASS: session_user fallback (%)', src;

  ---------------------------------------------------------------------------
  -- 5. Empty header value falls through (never record actor = '')
  ---------------------------------------------------------------------------
  perform set_config('request.headers', '{"x-audit-actor":""}', true);
  update vessels set notes = coalesce(notes, '') || ' t5' where id = vid;
  select source into src from data_changes
    where vessel_id = vid and field = 'notes' and new_value like '% t5';
  if src is distinct from session_user::text then
    raise exception 'T5 FAIL: empty header should fall through to session_user, got %', src;
  end if;
  raise notice 'T5 PASS: empty header falls through (%)', src;
  perform set_config('request.headers', '', true);

  ---------------------------------------------------------------------------
  -- 6. Bookkeeping columns are not audited (vessels skip list)
  ---------------------------------------------------------------------------
  select count(*) into n from data_changes where vessel_id = vid;
  update vessels set last_updated = now() where id = vid;
  if (select count(*) from data_changes where vessel_id = vid) <> n then
    raise exception 'T6 FAIL: last_updated change was audited';
  end if;
  raise notice 'T6 PASS: last_updated excluded from audit';

  ---------------------------------------------------------------------------
  -- 7. Unchanged fields produce no audit rows
  ---------------------------------------------------------------------------
  select count(*) into n from data_changes where vessel_id = vid;
  update vessels set notes = notes where id = vid;
  if (select count(*) from data_changes where vessel_id = vid) <> n then
    raise exception 'T7 FAIL: no-op update was audited';
  end if;
  raise notice 'T7 PASS: no-op update not audited';

  ---------------------------------------------------------------------------
  -- 8. profiles trigger carries the actor too (same function, other table)
  ---------------------------------------------------------------------------
  perform set_config('request.headers', '{"x-audit-actor":"admin@example.com"}', true);
  select id into pid from profiles limit 1;
  if pid is null then
    raise notice 'T8 SKIP: no profiles to test against';
  else
    update profiles set verified = not coalesce(verified, false) where id = pid;
    select source into src from data_changes
      where table_name = 'profiles' and record_id = pid::text and field = 'verified';
    if src is distinct from 'admin@example.com' then
      raise exception 'T8 FAIL: profiles audit actor, got %', src;
    end if;
    raise notice 'T8 PASS: profiles trigger attributes actor (%)', src;
  end if;

  raise notice 'ALL TESTS PASSED';
end
$$;

rollback;
