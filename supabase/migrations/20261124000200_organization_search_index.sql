-- Organizations for the header search: every spelling plus how many active
-- vessels each currently links to (any role). Counted here, not in the app.
create function public.organization_search_index()
returns table(id uuid, name text, short_name text, aliases text[], vessel_count int)
language sql stable security invoker set search_path = '' as $$
  select o.id, o.name, o.short_name,
         coalesce((select array_agg(a.alias order by a.alias) from public.organization_aliases a where a.organization_id = o.id), '{}'),
         count(distinct vo.vessel_id)::int
  from public.organizations o
  join public.vessel_organizations vo on vo.organization_id = o.id
    and (vo.starts_on is null or vo.starts_on <= current_date)
    and (vo.ends_on is null or vo.ends_on >= current_date)
  join public.vessels v on v.id = vo.vessel_id and v.status = 'active'
  group by o.id
  order by count(distinct vo.vessel_id) desc, o.name
$$;
grant execute on function public.organization_search_index() to anon, authenticated, service_role;
