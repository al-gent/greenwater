import 'server-only'
import { unstable_cache } from 'next/cache'
import { supabaseAdmin } from './supabase-admin'

interface NetworkStats {
  vessels: number
  countries: number
  members: number
  institutions: number
  vessels_added: number
  members_joined: number
}

// Counting happens in public.network_stats(); see the 20261122230000 migration.
export const getNetworkStats = unstable_cache(async (): Promise<NetworkStats> => {
  const { data, error } = await supabaseAdmin.rpc('network_stats').single<NetworkStats>()
  if (error || !data) throw new Error(`Could not load network stats: ${error?.message ?? 'no data'}`)
  return data
}, ['operator-community-stats-v3'], { revalidate: 86400 })
