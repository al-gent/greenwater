-- People on a project: role + name (+ person link when known). Replaces projects.pi_name
-- and discipline. The creator is NOT automatically a row — they may be coordinating without
-- sailing (Adam, 2026-10-15). Mirrors cruise_people; on bid confirm these become seats.
create table if not exists project_people (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  role_id     uuid not null references cruise_roles(id),
  person_id   uuid references people(id) on delete set null,   -- linked later, when the directory UI exists
  name        text not null,                                   -- as entered
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists project_people_project_idx on project_people (project_id);
alter table project_people enable row level security;
create policy project_people_read on project_people for select
  using (exists (select 1 from projects p where p.id = project_id and p.deleted_at is null
                 and (p.published_at is not null or p.created_by = auth.uid()
                      or exists (select 1 from cruises c where c.id = p.cruise_id and c.published_at is not null))));
create trigger project_people_set_updated_at before update on project_people for each row execute function set_updated_at();

-- carry any PI names over, then drop the columns
insert into project_people (project_id, role_id, name)
select p.id, (select id from cruise_roles where slug = 'pi'), p.pi_name from projects p where nullif(trim(p.pi_name), '') is not null;
alter table projects drop column if exists pi_name, drop column if exists discipline;
