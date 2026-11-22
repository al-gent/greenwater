begin;
insert into public.profiles (id,is_admin) values ('aaaaaaaa-0000-0000-0000-000000000001',true);
insert into public.people (id,name) values ('bbbbbbbb-0000-0000-0000-000000000001','Directory captain');
insert into public.vessel_people(person_id,vessel_id,role) values ('bbbbbbbb-0000-0000-0000-000000000001',1,'Captain');
do $$
declare
  member uuid := '00000000-0000-0000-0000-000000000001';
  rival uuid := '00000000-0000-0000-0000-000000000003';
  admin_id uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  person uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  req uuid; other_req uuid; other uuid;
begin
  req := public.request_person_link(member, person, 'I was the captain.','member@example.test');
  perform booking_test.check_result(req = public.request_person_link(member,person,'retry',null),'idempotent submission');
  perform booking_test.check_result((select profile_id is null from people where id=person),'request alone does not link');
  insert into people(name,source) values ('Held record','unols_mfp') returning id into other;
  begin perform public.request_person_link(rival,other,'',null); raise exception 'Hidden record offered'; exception when sqlstate 'PT404' then null; end;
  update people set source='vesselconnect' where id=other;
  begin perform public.request_person_link(member,other,'',null); raise exception 'Two pending claims'; exception when sqlstate 'PT409' then null; end;
  other_req := public.request_person_link(rival,person,'',null);
  begin perform public.review_person_link(member,req,'confirmed'); raise exception 'Nonadmin confirmation'; exception when sqlstate 'PT403' then null; end;
  perform public.review_person_link(admin_id,req,'confirmed');
  perform public.review_person_link(admin_id,req,'confirmed');
  perform booking_test.check_result((select profile_id=member from people where id=person),'confirmed link');
  perform booking_test.check_result((select status='declined' and reviewed_by=admin_id from person_link_requests where id=other_req),'competing claim closed');
  perform booking_test.check_result(not exists (select from vessel_operators where user_id=member),'identity confirmation grants no vessel access');
  begin perform public.review_person_link(admin_id,other_req,'confirmed'); raise exception 'Reassigned claimed person'; exception when sqlstate 'PT409' then null; end;
  other_req := public.request_person_link(rival,other,'',null);
  perform public.review_person_link(admin_id,other_req,'declined');
  perform booking_test.check_result((select profile_id is null from people where id=other),'decline leaves directory unlinked');
end $$;
insert into public.projects (title,slug,pi_person_id,created_by,published_at)
values ('Published PI credit','test-linked-pi','bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',now()),
       ('Private PI credit','test-hidden-pi','bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',null);
insert into public.cruises (title,vessel_id,departure_at,arrival_at,published_at)
values ('Public crew credit',1,'2055-05-01','2055-05-03',now());
insert into public.cruise_people (cruise_id,role_id,person_id)
select c.id,r.id,'bbbbbbbb-0000-0000-0000-000000000001' from public.cruises c cross join public.cruise_roles r
where c.title='Public crew credit' and r.slug='captain';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select 1/((count(*)=1)::int) from public.person_link_requests;
select 1/((count(*)=1)::int) from public.my_person_work_credits() where kind='Vessel' and role='Captain';
select 1/((count(*)=1)::int) from public.my_person_work_credits() where kind='Project' and title='Published PI credit';
select 1/((count(*)=0)::int) from public.my_person_work_credits() where title='Private PI credit';
select 1/((count(*)=1)::int) from public.my_person_work_credits() where kind='Cruise' and starts_on='2055-05-01';
select 1/((not has_function_privilege(current_user,'public.review_person_link(uuid,uuid,text)','execute'))::int);
select 1/((not has_function_privilege(current_user,'public.request_person_link(uuid,uuid,text,text)','execute'))::int);
select 1/((not has_table_privilege(current_user,'public.person_link_requests','update'))::int);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select 1/((count(*)=0)::int) from public.my_person_work_credits();
rollback;
