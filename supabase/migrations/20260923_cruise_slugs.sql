-- Human-readable cruise URLs: cruises.slug, unique, e.g. 'sikuliaq-skq2610s-2026-10'.
--
-- cruise_code can't be the URL: 31% of MFP rows have none, 15% repeat (FLOTSUM ×8
-- is the same recurring cruise; 'INST', PI surnames…), half aren't URL-safe.
-- Slug = vessel name + (cruise code, else title) + departure YYYY-MM, slugified,
-- '-2', '-3'… on collision. Filled by trigger when an insert omits it, so
-- operator-authored cruises get one automatically; the form may override.

create or replace function slugify(input text) returns text
  immutable language sql as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'))
$$;

alter table cruises add column if not exists slug text;

-- Base slug for a cruise row (no collision suffix).
create or replace function cruise_base_slug(p_vessel_id integer, p_code text, p_title text, p_departure timestamptz)
  returns text stable language sql as $$
  select left(slugify((select name from vessels where id = p_vessel_id)), 40)
      || '-' || left(slugify(coalesce(nullif(trim(p_code), ''), p_title)), 60)
      || '-' || to_char(p_departure at time zone 'utc', 'YYYY-MM')
$$;

-- Backfill: number collisions in departure order so recurring cruises read
-- 'walton-smith-flotsum-2026-10', '…-2026-10-2'.
with base as (
  select c.id,
         cruise_base_slug(c.vessel_id, c.cruise_code, c.title, c.departure_at) as s,
         row_number() over (
           partition by cruise_base_slug(c.vessel_id, c.cruise_code, c.title, c.departure_at)
           order by c.departure_at, c.created_at, c.id
         ) as rn
  from cruises c
  where c.slug is null
)
update cruises set slug = case when base.rn = 1 then base.s else base.s || '-' || base.rn end
from base where cruises.id = base.id;

alter table cruises alter column slug set not null;
create unique index if not exists cruises_slug_key on cruises (slug);

-- Fill slug on insert when omitted; bump a numeric suffix until unique.
create or replace function cruises_fill_slug() returns trigger language plpgsql as $$
declare
  base text; candidate text; n integer := 1;
begin
  if new.slug is not null and new.slug <> '' then
    new.slug := slugify(new.slug);
    return new;
  end if;
  base := cruise_base_slug(new.vessel_id, new.cruise_code, new.title, new.departure_at);
  candidate := base;
  while exists (select 1 from cruises where slug = candidate and id <> new.id) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  new.slug := candidate;
  return new;
end $$;
create trigger cruises_fill_slug before insert on cruises for each row execute function cruises_fill_slug();
