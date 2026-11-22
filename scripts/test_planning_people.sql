-- Run against the isolated booking database with its fixture profiles and vessels.
begin;
do $$
declare
  author_id uuid := '00000000-0000-0000-0000-000000000001';
  operator_id uuid := '00000000-0000-0000-0000-000000000002';
  pending_id uuid := '00000000-0000-0000-0000-000000000003';
  role_id uuid := (select id from cruise_roles where slug='pi');
  assignment uuid; captain uuid; project uuid; member uuid; hidden uuid; other uuid; offer uuid; cruise uuid;
  choice jsonb; row_choice jsonb;
begin
  assignment := save_vessel_person(operator_id,1,null,'{"name":"QA captain","create_person":true}', 'Captain','2050-01-01','2050-03-01');
  select person_id into strict captain from vessel_people where id=assignment;
  perform booking_test.check_result((select profile_id is null from people where id=captain), 'captain without login');
  choice := jsonb_build_object('person_id',captain);
  perform save_vessel_person(operator_id,2,null,choice,'Captain','2050-01-01',null);
  perform save_vessel_person(operator_id,1,assignment,choice,'Captain','2050-01-01','2050-02-28');
  perform save_vessel_person(operator_id,1,null,choice,'Captain','2050-03-01',null);
  perform booking_test.check_result((select count(*)=3 from vessel_people where person_id=captain), 'separate roles across vessels and dates');
  begin
    perform save_vessel_person(operator_id,1,null,choice,'captain','2050-02-28',null);
    raise exception 'Expected overlapping role to be rejected';
  exception when exclusion_violation then null; end;
  begin
    perform save_vessel_person(pending_id,1,null,choice,'Mate',null,null);
    raise exception 'Expected pending operator to be rejected';
  exception when sqlstate 'PT403' then null; end;
  -- A person with an existing profile also gains zero access from a vessel role.
  update people set profile_id=author_id where id=captain;
  begin
    perform save_vessel_person(author_id,1,null,choice,'Mate',null,null);
    raise exception 'Captain gained platform access';
  exception when sqlstate 'PT403' then null; end;
  perform booking_test.check_result(not exists (select from vessel_operators where user_id=author_id), 'no operator claim or membership created');
  row_choice := choice || jsonb_build_object('role_id',role_id,'name','Client spelling');
  project := (create_planning_project(author_id,'people-project','{"title":"People project"}',null,jsonb_build_array(row_choice))->>'id')::uuid;
  select id into strict member from project_people where project_id=project and person_id=captain and name='QA captain';
  row_choice := row_choice || jsonb_build_object('id',member);
  perform save_project_changes(project,author_id,'{}',null,null,jsonb_build_array(row_choice - 'person_id'));
  perform booking_test.check_result((select person_id=captain from project_people where id=member), 'legacy save preserves link');
  perform save_project_changes(project,author_id,'{}',null,null,jsonb_build_array(row_choice || '{"person_id":null}'));
  perform booking_test.check_result((select person_id is null from project_people where id=member), 'explicit unlink');
  perform save_project_changes(project,author_id,'{}',null,null,jsonb_build_array(row_choice || '{"person_id":null,"name":"QA scientist","create_person":true}'));
  select person_id into strict other from project_people where id=member;
  perform booking_test.check_result(other <> captain,'explicit new person');
  insert into people(name,source) values ('Held name','unols_mfp') returning id into hidden;
  begin
    perform create_planning_project(author_id,'held-person-test','{"title":"Held test"}',null,jsonb_build_array(row_choice - 'id' || jsonb_build_object('person_id',hidden)));
    raise exception 'Expected hidden person to be rejected';
  exception when sqlstate 'PT400' then null; end;
  perform booking_test.check_result(not exists(select from projects where slug='held-person-test'),'project creation rolled back');
  perform save_project_changes(project,author_id,jsonb_build_object('published_at',now()),null,null,jsonb_build_array(row_choice));
  offer := booking_test.bid(project,1,'2050-01-02','2050-01-03');
  perform booking_test.transition(project,offer,'accept');
  cruise := (booking_test.transition(project,offer,'confirm')->>'cruise_id')::uuid;
  perform booking_test.check_result(exists(select from timeline_entries where cruise_id=cruise and person_id=captain and project_person_id=member),'confirmed person reservation');
  begin
    perform save_project_changes(project,author_id,'{}',null,null,jsonb_build_array(row_choice || jsonb_build_object('person_id',other)));
    raise exception 'Expected already-booked person change to be rejected';
  exception when sqlstate 'PT409' then null; end;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
-- This account may read the three assignments on its own confirmed directory record.
select 1/((count(*)=3)::int) from public.vessel_people;
select 1/((not has_function_privilege(current_user,'public.save_vessel_person(uuid,integer,uuid,jsonb,text,date,date)','execute'))::int);
set local request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
select 1/((count(*)=3)::int) from public.vessel_people;
rollback;
