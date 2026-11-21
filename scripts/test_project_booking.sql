create schema booking_test;
create function booking_test.check_result(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is distinct from true then raise exception 'FAIL: %', p_message; end if;
end;
$$;

insert into profiles (id) values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'), ('00000000-0000-0000-0000-000000000003');
insert into vessels (name) values ('Test ship A'), ('Test ship B');
insert into vessel_operators values (1, '00000000-0000-0000-0000-000000000002', 'active'), (2, '00000000-0000-0000-0000-000000000002', 'active'), (1, '00000000-0000-0000-0000-000000000003', 'pending');

create function booking_test.project(p_title text) returns uuid language plpgsql as $$
declare project_id uuid;
begin
  insert into projects (title, slug, source, created_by, published_at)
    values (p_title, slugify(p_title), 'vesselconnect', '00000000-0000-0000-0000-000000000001', now()) returning id into project_id;
  return project_id;
end;
$$;
create function booking_test.bid(p_project uuid, p_vessel integer default 1, p_start timestamptz default '2030-01-01', p_end timestamptz default '2030-01-02') returns uuid language plpgsql as $$
declare bid_id uuid;
begin
  insert into project_bids (project_id, vessel_id, proposed_departure_at, proposed_arrival_at, offered_by)
    values (p_project, p_vessel, p_start, p_end, '00000000-0000-0000-0000-000000000002') returning id into bid_id;
  return bid_id;
end;
$$;
create function booking_test.transition(p_project uuid, p_bid uuid, p_action text, p_updates jsonb default '{}', p_gear jsonb default null) returns jsonb language sql as $$
  select public.transition_project_bid(p_project, p_bid,
    case when p_action in ('accept', 'decline') then '00000000-0000-0000-0000-000000000001'::uuid else '00000000-0000-0000-0000-000000000002'::uuid end,
    p_action, p_updates, p_gear);
$$;

do $$
#variable_conflict use_variable
declare
  project_id uuid := booking_test.project('Gear preservation');
  other_project uuid := booking_test.project('Other project');
  bid_id uuid := booking_test.bid(project_id);
  gear_id uuid;
  second_gear uuid;
  foreign_gear uuid;
  answer_id uuid;
  gear_payload jsonb;
  people_payload jsonb;
  member_id uuid;
  linked_person uuid;
begin
  insert into project_gear (project_id, label) values (project_id, 'CTD') returning id into gear_id;
  insert into project_gear (project_id, label) values (other_project, 'Foreign gear') returning id into foreign_gear;
  insert into bid_gear (project_id, bid_id, project_gear_id, answer) values (project_id, bid_id, gear_id, 'provide') returning id into answer_id;
  insert into people (name) values ('Synthetic researcher') returning id into linked_person;
  insert into project_people (project_id, role_id, person_id, name) values (project_id, (select id from cruise_roles where slug = 'pi'), linked_person, 'Synthetic researcher') returning id into member_id;
  select jsonb_agg(to_jsonb(gear)) into gear_payload from project_gear gear where gear.id = gear_id;
  select jsonb_agg(to_jsonb(member)) into people_payload from project_people member where member.id = member_id;
  perform save_project_changes(project_id, '00000000-0000-0000-0000-000000000001', '{"title":"Renamed"}', gear_payload, jsonb_build_array(gear_id), people_payload);
  perform booking_test.check_result(exists (select 1 from bid_gear where id = answer_id and project_gear_id = gear_id), 'title-only form save must preserve gear answers and IDs');
  perform booking_test.check_result(exists (select 1 from project_people where id = member_id and person_id = linked_person), 'full form save preserves linked researchers');
  perform booking_test.transition(project_id, bid_id, 'accept');
  perform save_project_changes(project_id, '00000000-0000-0000-0000-000000000001', '{"summary":"Updated"}');
  perform booking_test.check_result(exists (select 1 from bid_gear where id = answer_id), 'scalar-only save preserves accepted bid answers');
  perform save_project_changes(project_id, '00000000-0000-0000-0000-000000000001', '{}',
    jsonb_build_array(jsonb_build_object('id', gear_id, 'label', 'CTD updated', 'quantity', 2), jsonb_build_object('label', 'New gear')), jsonb_build_array(gear_id));
  select id into second_gear from project_gear where project_gear.project_id = project_id and label = 'New gear';
  perform booking_test.check_result(second_gear is not null and exists (select 1 from bid_gear where id = answer_id), 'add/update retains existing answers');
  gear_payload := jsonb_build_array(jsonb_build_object('id', gear_id, 'label', 'CTD updated', 'quantity', 2));
  perform save_project_changes(project_id, '00000000-0000-0000-0000-000000000001', '{}', gear_payload, jsonb_build_array(gear_id, second_gear));
  perform booking_test.check_result(not exists (select 1 from project_gear where id = second_gear) and exists (select 1 from bid_gear where id = answer_id), 'only deliberately removed lines are deleted');
  begin
    perform save_project_changes(project_id, '00000000-0000-0000-0000-000000000001', '{"title":"Must roll back"}', gear_payload || '[{"label":"Bad type","equipment_type_id":"ffffffff-ffff-ffff-ffff-ffffffffffff"}]', jsonb_build_array(gear_id));
    raise exception 'FAIL: invalid insert succeeded';
  exception when foreign_key_violation then null;
  end;
  perform booking_test.check_result((select title = 'Renamed' from projects where id = project_id) and exists (select 1 from bid_gear where id = answer_id), 'failed gear insert rolls back project changes and answers');
  begin
    perform save_project_changes(project_id, '00000000-0000-0000-0000-000000000001', '{}', jsonb_build_array(jsonb_build_object('id', foreign_gear, 'label', 'Stolen')), jsonb_build_array(gear_id));
    raise exception 'FAIL: cross-project gear accepted';
  exception when sqlstate 'PT400' then null;
  end;
  begin
    perform save_project_changes(project_id, '00000000-0000-0000-0000-000000000001', '{}', gear_payload || gear_payload, jsonb_build_array(gear_id));
    raise exception 'FAIL: duplicate gear IDs accepted';
  exception when sqlstate 'PT400' then null;
  end;
  begin
    perform save_project_changes(project_id, '00000000-0000-0000-0000-000000000001', '{}', '[{"label":"CTD updated"}]');
    raise exception 'FAIL: legacy form erased gear identities';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform save_project_changes(project_id, '00000000-0000-0000-0000-000000000001', '{}', gear_payload, '[]');
    raise exception 'FAIL: stale form accepted';
  exception when sqlstate 'PT409' then null;
  end;
  raise notice 'PASS: stable gear/people identity, add/update/remove, invalid IDs, stale clients, rollback';
end;
$$;

create function booking_test.inject_failure() returns trigger language plpgsql as $$
begin
  if current_setting('booking_test.fail_table', true) = tg_table_name
    and (nullif(current_setting('booking_test.fail_id', true), '') is null or new.id = current_setting('booking_test.fail_id', true)::uuid) then
    raise exception 'Injected write failure' using errcode = 'XX999';
  end if;
  return new;
end;
$$;
create trigger booking_test_project_failure before update on projects for each row execute function booking_test.inject_failure();
create trigger booking_test_bid_failure before update on project_bids for each row execute function booking_test.inject_failure();
create trigger booking_test_timeline_failure before insert on timeline_entries for each row execute function booking_test.inject_failure();

do $$
#variable_conflict use_variable
declare
  project_id uuid := booking_test.project('Atomic booking');
  bid_id uuid := booking_test.bid(project_id, 1, '2031-01-01', '2031-01-01 06:00Z');
  other_bid uuid := booking_test.bid(project_id, 2);
  person_id uuid;
  result jsonb;
  retry jsonb;
  fail_table text;
  cruise_count integer;
begin
  insert into people (name) values ('Booked researcher') returning id into person_id;
  insert into project_people (project_id, role_id, person_id, name) values (project_id, (select id from cruise_roles where slug = 'pi'), person_id, 'Booked researcher');
  perform booking_test.transition(project_id, bid_id, 'accept');
  perform booking_test.check_result((select declined_at is not null from project_bids where id = other_bid), 'accept declines other offers');
  perform booking_test.check_result(booking_test.transition(project_id, bid_id, 'accept')->>'changed' = 'false', 'accept retry is a no-op');
  select count(*) into cruise_count from cruises;
  foreach fail_table in array array['projects', 'project_bids', 'timeline_entries'] loop
    perform set_config('booking_test.fail_table', fail_table, true);
    begin
      perform booking_test.transition(project_id, bid_id, 'confirm');
      raise exception 'FAIL: injected failure ignored';
    exception when sqlstate 'XX999' then null;
    end;
    perform booking_test.check_result((select count(*) = cruise_count from cruises), 'failed confirmation leaves no cruise');
    perform booking_test.check_result((select cruise_id is null from projects where id = project_id), 'failed confirmation leaves project unscheduled');
    perform booking_test.check_result((select confirmed_at is null and cruise_id is null from project_bids where id = bid_id), 'failed confirmation leaves bid accepted');
  end loop;
  perform set_config('booking_test.fail_table', '', true);
  begin
    perform transition_project_bid(project_id, bid_id, '00000000-0000-0000-0000-000000000003', 'confirm');
    raise exception 'FAIL: pending operator confirmed';
  exception when sqlstate 'PT403' then null;
  end;
  result := booking_test.transition(project_id, bid_id, 'confirm');
  retry := booking_test.transition(project_id, bid_id, 'confirm');
  perform booking_test.check_result(result->>'cruise_id' = retry->>'cruise_id' and retry->>'changed' = 'false', 'confirmation retry returns the same cruise');
  perform booking_test.check_result((select count(*) = 2 from timeline_entries where cruise_id = (result->>'cruise_id')::uuid), 'vessel and researcher reservations commit together');
  perform booking_test.check_result((select bool_and(end_at = '2031-01-02'::timestamptz) from timeline_entries where cruise_id = (result->>'cruise_id')::uuid), 'booking occupancy matches the one-day minimum');
  begin
    perform booking_test.transition(project_id, bid_id, 'withdraw');
    raise exception 'FAIL: confirmed bid withdrawn';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform booking_test.transition(project_id, bid_id, 'decline');
    raise exception 'FAIL: confirmed bid declined';
  exception when sqlstate 'PT409' then null;
  end;
  raise notice 'PASS: failure rollback, authorization, linked timeline, terminal states and idempotence';
end;
$$;

select booking_test.check_result(not has_function_privilege('anon', 'public.transition_project_bid(uuid,uuid,uuid,text,jsonb,jsonb)', 'execute'), 'anonymous cannot call booking RPC');
select booking_test.check_result(not has_function_privilege('authenticated', 'public.transition_project_bid(uuid,uuid,uuid,text,jsonb,jsonb)', 'execute'), 'authenticated cannot impersonate an RPC actor');
select booking_test.check_result(not has_function_privilege('authenticated', 'public.save_project_changes(uuid,uuid,jsonb,jsonb,jsonb,jsonb)', 'execute'), 'project RPC is server-only');
set role service_role;
select save_project_changes((select id from projects where title = 'Renamed'), '00000000-0000-0000-0000-000000000001', '{"summary":"Service role save"}');
reset role;

do $$
#variable_conflict use_variable
declare
  project_id uuid := booking_test.project('Acceptance rollback');
  bid_id uuid := booking_test.bid(project_id);
  other_bid uuid := booking_test.bid(project_id, 2);
  gear_id uuid;
  answer_id uuid;
begin
  perform set_config('booking_test.fail_table', 'project_bids', true);
  perform set_config('booking_test.fail_id', other_bid::text, true);
  begin
    perform booking_test.transition(project_id, bid_id, 'accept');
    raise exception 'FAIL: failed competitor decline ignored';
  exception when sqlstate 'XX999' then null;
  end;
  perform booking_test.check_result((select accepted_at is null from project_bids where id = bid_id), 'failed competitor decline rolls back acceptance');
  perform set_config('booking_test.fail_table', '', true);
  perform set_config('booking_test.fail_id', '', true);
  insert into project_gear (project_id, label) values (project_id, 'Answered gear') returning id into gear_id;
  insert into bid_gear (project_id, bid_id, project_gear_id, answer) values (project_id, bid_id, gear_id, 'provide') returning id into answer_id;
  begin
    perform booking_test.transition(project_id, bid_id, 'update', '{"notes":"Must roll back"}', jsonb_build_array(jsonb_build_object('project_gear_id', gear_id, 'answer', 'invalid')));
    raise exception 'FAIL: invalid bid answer saved';
  exception when check_violation then null;
  end;
  perform booking_test.check_result((select notes is null from project_bids where id = bid_id) and exists (select 1 from bid_gear where id = answer_id), 'bid update failure restores previous answers and fields');
  perform booking_test.transition(project_id, bid_id, 'accept');
  begin
    perform booking_test.transition(project_id, bid_id, 'update', '{"notes":"Must stay frozen"}');
    raise exception 'FAIL: accepted bid changed';
  exception when sqlstate 'PT409' then null;
  end;
  raise notice 'PASS: acceptance and bid update rollback; accepted terms stay frozen';
end;
$$;

do $$
#variable_conflict use_variable
declare
  project_id uuid := booking_test.project('Publication conflict rules');
  bid_id uuid := booking_test.bid(project_id, 2, '2032-01-01', '2032-01-03');
  held_entry uuid;
begin
  insert into timeline_entries (vessel_id, start_at, end_at, source, label)
    values (2, '2032-01-01', '2032-01-03', 'unols_mfp', 'Held imported reservation') returning id into held_entry;
  insert into timeline_entries (vessel_id, start_at, end_at, source, label)
    values (2, '2032-01-01', '2032-01-03', 'demo', 'Example reservation');
  perform booking_test.transition(project_id, bid_id, 'accept');
  update data_publication set enabled = true where source_group = 'mfp';
  begin
    perform booking_test.transition(project_id, bid_id, 'confirm');
    raise exception 'FAIL: published MFP conflict ignored';
  exception when sqlstate 'PT409' then null;
  end;
  update data_publication set enabled = false where source_group = 'mfp';
  perform booking_test.transition(project_id, bid_id, 'confirm');
  perform booking_test.check_result(exists (select 1 from timeline_entries where id = held_entry), 'held data remains untouched');
  raise notice 'PASS: held MFP and demo entries do not block; published MFP does';
end;
$$;

-- Check actual SELECT policies for two bidders' views of the same vessel.
begin;
select booking_test.project('Privacy test') as project \gset
select booking_test.bid(:'project') as bid \gset
insert into project_gear(project_id,label) values (:'project','CTD') returning id as gear \gset
insert into bid_gear(project_id,bid_id,project_gear_id,answer) values (:'project',:'bid',:'gear','provide');
insert into timeline_entries(vessel_id,start_at,end_at,source,visibility,label,created_by)
  values (1,'2050-01-01','2050-01-02','vesselconnect','operators','Operator schedule','00000000-0000-0000-0000-000000000001'),
         (1,'2050-01-02','2050-01-03','vesselconnect','private','Private schedule','00000000-0000-0000-0000-000000000001');
create function pg_temp.check_visibility(b uuid, see_bid boolean, see_operator boolean, see_private boolean) returns void language plpgsql as $$
begin
  if (exists(select from project_bids where id=b)) <> see_bid or (exists(select from bid_gear where bid_id=b)) <> see_bid
     or (exists(select from timeline_entries where label='Operator schedule')) <> see_operator
     or (exists(select from timeline_entries where label='Private schedule')) <> see_private then
    raise exception 'Incorrect bid or timeline visibility for %', auth.uid();
  end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.check_visibility(:'bid',false,false,false); -- pending
reset role;
update vessel_operators set status='active' where user_id='00000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.check_visibility(:'bid',true,true,false);
reset role;
update vessel_operators set status='suspended' where user_id='00000000-0000-0000-0000-000000000003';
insert into vessel_operators values (2,'00000000-0000-0000-0000-000000000003','active');
set local role authenticated;
select pg_temp.check_visibility(:'bid',false,false,false); -- suspended here, active elsewhere
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select pg_temp.check_visibility(:'bid',true,true,true); -- project and block author
reset role;
update profiles set is_admin=true where id='00000000-0000-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
select pg_temp.check_visibility(:'bid',true,true,true);
rollback;
