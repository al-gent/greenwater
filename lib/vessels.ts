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

export const getAllVessels = unstable_cache(
  async (): Promise<Vessel[]> => {
    const { data, error } = await supabase.from('vessels').select('*').order('id')
    if (error) throw error
    return data as Vessel[]
  },
  ['all-vessels-v2'],
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
    if (!v.Main_Activity) continue
    const cleaned = stripHtml(v.Main_Activity)
    if (cleaned.length > 0 && cleaned.length <= 80) {
      set.add(cleaned)
    }
  }
  return Array.from(set).sort()
}
