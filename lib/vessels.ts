/**
 * Server-only data loading via Supabase. Do NOT import this from client components.
 * Import types and utilities from @/lib/vessel-utils instead.
 */
import { unstable_cache } from 'next/cache'
import { supabase } from './supabase'
import type { Vessel } from './vessel-utils'
import { stripHtml } from './vessel-utils'

// Re-export everything from vessel-utils for convenience in server components
export * from './vessel-utils'

// Only the columns needed for listing, filtering, and the map.
// Excludes files[], doc_urls, contact info, and all rarely-used spec columns
// to keep the payload well under Next.js's 2MB unstable_cache limit.
const LISTING_COLUMNS = [
  'id', 'name', 'country', 'port_city', 'port_state',
  'photo_urls',
  'scientists', 'main_activity', 'length', 'speed_cruise', 'year_built',
  'primary_latitude', 'primary_longitude',
  // Advanced search feature filters
  'ice_breaking', 'area_wetlab', 'area_drylab',
  'ctd_cap', 'aquis_multibeam',
  'underwater_vehicles_rov', 'underwater_vehicles_auv',
  'diving_cap', 'dpos', 'core_capable',
].join(', ')

export const getAllVessels = unstable_cache(
  async (): Promise<Vessel[]> => {
    const [{ data, error }, { data: ports }] = await Promise.all([
      supabase.from('vessels').select(LISTING_COLUMNS).order('id'),
      supabase.from('vessel_last_port').select('vessel_id, port_name, port_flag, lat, lon, arrived_at'),
    ])
    if (error) throw error
    const portMap = new Map<number, { port_name: string | null; port_flag: string | null; lat: number | null; lon: number | null; arrived_at: string | null }>()
    for (const p of ports ?? []) {
      portMap.set(p.vessel_id, { port_name: p.port_name, port_flag: p.port_flag, lat: p.lat, lon: p.lon, arrived_at: p.arrived_at })
    }
    return (data as unknown as Vessel[]).map((v) => ({
      ...v,
      last_port_name: portMap.get(v.id)?.port_name ?? null,
      last_port_flag: portMap.get(v.id)?.port_flag ?? null,
      last_port_lat: portMap.get(v.id)?.lat ?? null,
      last_port_lon: portMap.get(v.id)?.lon ?? null,
      last_port_date: portMap.get(v.id)?.arrived_at ?? null,
    }))
  },
  ['all-vessels-v4'],
  { revalidate: 3600 }
)

export async function getVesselById(id: number): Promise<Vessel | null> {
  const { data } = await supabase.from('vessels').select('*').eq('id', id).single()
  return data as Vessel | null
}

/** Get unique, clean country list for filter dropdown */
export async function getUniqueCountries(): Promise<string[]> {
  const vessels = await getAllVessels()
  const set = new Set<string>()
  for (const v of vessels) {
    if (v.country) set.add(v.country.trim())
  }
  return Array.from(set).sort()
}

/** Get unique, cleaned activity list for filter dropdown (short values only) */
export async function getUniqueActivities(): Promise<string[]> {
  const vessels = await getAllVessels()
  const set = new Set<string>()
  for (const v of vessels) {
    if (!v.main_activity) continue
    const cleaned = stripHtml(v.main_activity)
    if (cleaned.length > 0 && cleaned.length <= 80) {
      set.add(cleaned)
    }
  }
  return Array.from(set).sort()
}
