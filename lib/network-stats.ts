import 'server-only'
import { unstable_cache } from 'next/cache'
import { getReadOnlyDb } from './read-only-db'

interface NetworkStats {
  vessels: number
  countries: number
  members: number
  institutions: number
  vessels_added: number
  members_joined: number
}

// A vessel contributes one institution name: its affiliation, or its operator
// when no affiliation is recorded. Members can represent additional institutions.
export const getNetworkStats = unstable_cache(async () => {
  const sql = await getReadOnlyDb()
  const [stats] = await sql<NetworkStats[]>`
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
    select (count(*) filter (where vessel))::int as vessels,
           count(distinct nullif(lower(trim(country)), ''))::int as countries,
           (count(*) filter (where not vessel))::int as members,
           (count(distinct institution) filter (where institution not in
             ('', '-', 'n/a', 'na', 'none', 'unknown', 'independent', 'private')))::int as institutions,
           (count(*) filter (where vessel and this_month))::int as vessels_added,
           (count(*) filter (where not vessel and this_month))::int as members_joined
    from names
  `
  return stats
}, ['operator-community-stats-v2'], { revalidate: 86400 })
