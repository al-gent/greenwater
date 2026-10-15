-- Reserved for a later 'archive' action (Adam, 2026-10-15: unpublish is enough for now; no
-- delete). deleted_at hides a project everywhere once something sets it; nothing does yet.
alter table projects add column if not exists deleted_at timestamptz;
drop policy if exists projects_public_read on projects;
drop policy if exists projects_own_read on projects;
create policy projects_public_read on projects for select
  using (deleted_at is null and (published_at is not null
         or exists (select 1 from cruises c where c.id = cruise_id and c.published_at is not null)));
create policy projects_own_read on projects for select to authenticated
  using (deleted_at is null and (created_by = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)));
