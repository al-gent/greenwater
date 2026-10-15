-- project_gear is readable like project_people: published project, the author, or a project
-- attached to a published cruise (the MFP ones are only ever visible through their cruise).
drop policy if exists project_gear_read on project_gear;
create policy project_gear_read on project_gear for select
  using (exists (select 1 from projects p where p.id = project_id and p.deleted_at is null
                 and (p.published_at is not null or p.created_by = auth.uid()
                      or exists (select 1 from cruises c where c.id = p.cruise_id and c.published_at is not null))));
