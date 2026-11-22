import 'server-only'
import { createClient } from '@supabase/supabase-js'

interface NetworkStats {
  vessels: number
  countries: number
  members: number
  institutions: number
  vessels_added: number
  members_joined: number
}

// The shared supabaseAdmin client forces cache: 'no-store', which makes Next
// bail out of static rendering. These counts only need a daily refresh, so this
// client lets Next's Data Cache hold the response and keeps landing pages static (ISR).
const statsClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 86400, tags: ['network-stats'] } }),
    },
  }
)

// Counting happens in public.network_stats(); see the 20261122230000 migration.
export async function getNetworkStats(): Promise<NetworkStats> {
  const { data, error } = await statsClient.rpc('network_stats', {}, { get: true }).single<NetworkStats>()
  if (error || !data) throw new Error(`Could not load network stats: ${error?.message ?? 'no data'}`)
  return data
}
