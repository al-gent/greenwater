import { getAllVessels } from '@/lib/vessels'
import { supabase } from '@/lib/supabase'

// Header search data: vessel names plus organizations with their spellings and
// active-vessel counts (counted in public.organization_search_index()).
// getAllVessels() is already cached; the CDN holds this small payload.
export const dynamic = 'force-dynamic'

export async function GET() {
  const [vessels, { data: organizations, error }] = await Promise.all([
    getAllVessels(),
    supabase.rpc('organization_search_index'),
  ])
  if (error) console.error('organization_search_index failed', error.message)
  return Response.json({
    vessels: vessels.map(({ id, name }) => ({ id, name })),
    organizations: organizations ?? [],
  }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
