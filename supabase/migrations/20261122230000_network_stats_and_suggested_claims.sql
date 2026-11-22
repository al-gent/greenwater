-- Landing-page network stats and dashboard claim suggestions, as server-only RPCs.
-- Replaces the app's direct read-only Postgres connection (lib/read-only-db.ts).

-- A vessel contributes one institution name: its affiliation, or its operator
-- when no affiliation is recorded. Members can represent additional institutions.
create function public.network_stats()
returns table(vessels int, countries int, members int, institutions int, vessels_added int, members_joined int)
language sql stable security invoker set search_path = '' as $$
  with network as (
    select true as vessel, created_at, country,
           coalesce(nullif(trim(affiliation), ''), operator_name) as institution
    from public.vessels where status = 'active'
    union all
    select false, created_at, null, institution
    from public.profiles where is_admin is not true
  ), names as (
    select vessel, country, lower(trim(institution)) as institution,
           created_at >= date_trunc('month', now(), 'UTC') as this_month
    from network
  )
  select (count(*) filter (where vessel))::int,
         count(distinct nullif(lower(trim(country)), ''))::int,
         (count(*) filter (where not vessel))::int,
         (count(distinct institution) filter (where institution not in
           ('', '-', 'n/a', 'na', 'none', 'unknown', 'independent', 'private')))::int,
         (count(*) filter (where vessel and this_month))::int,
         (count(*) filter (where not vessel and this_month))::int
  from names
$$;

-- Imported listing fields sometimes contain a contact list or Name <address>.
-- The caller passes the member's confirmed email; this function never trusts client input.
create function public.suggested_vessel_claims(p_user uuid, p_email text)
returns table(id bigint, name text)
language sql stable security invoker set search_path = '' as $$
  select v.id::bigint, v.name from public.vessels v
  where v.status = 'active' and exists (
    select from regexp_split_to_table(concat_ws(';', v.email, v.contact_email), '[,;]') as part(address)
    where lower(btrim(coalesce(substring(part.address from '<([^<>]+)>'), part.address))) = lower(btrim(p_email))
  ) and not exists (
    select from public.vessel_operators o where o.user_id = p_user and o.vessel_id = v.id
  )
  order by v.name, v.id
$$;

revoke all on function public.network_stats(), public.suggested_vessel_claims(uuid, text) from public, anon, authenticated;
grant execute on function public.network_stats(), public.suggested_vessel_claims(uuid, text) to service_role;
