-- Readable project URLs: /projects/<slug>. Slug = slugified title, '-2', '-3'… on collision.
-- Set in code on create (lib/project-utils slugify + collision check in the API) and never
-- changed afterwards so links stay stable. This backfills existing rows.
alter table projects add column if not exists slug text;
with base as (
  select id, left(slugify(title), 80) as s,
         row_number() over (partition by left(slugify(title), 80) order by created_at, id) as rn
  from projects where slug is null
)
update projects p set slug = case when base.rn = 1 then base.s else base.s || '-' || base.rn end
from base where p.id = base.id and base.s <> '';
update projects set slug = 'project-' || left(id::text, 8) where slug is null or slug = '';
-- a title like "Gulf 4" can collide with the 4th "Gulf"; break any remaining ties with a short id
update projects p set slug = p.slug || '-' || left(p.id::text, 6)
where p.id in (select id from (select id, row_number() over (partition by slug order by created_at, id) rn from projects) d where d.rn > 1);
alter table projects alter column slug set not null;
create unique index if not exists projects_slug_key on projects (slug);
