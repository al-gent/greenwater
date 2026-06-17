import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Dedicated client with a no-store fetch: Next patches global fetch and caches
// supabase-js's GET requests by default, which froze this endpoint at a stale
// 3-vessel snapshot. force-dynamic on the route alone doesn't reach the internal
// fetch, so opt it out explicitly here.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
  { global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) } },
)

// Operating-area geometry for the map's "operating areas" view. Loaded on demand
// (not part of getAllVessels / LISTING_COLUMNS) so polygons only ship to the
// client when the user actually opts into that view.
export async function GET() {
  const { data, error } = await supabase
    .from('vessels')
    .select('id, name, operating_area_geojson')
    .eq('status', 'active')
    .not('operating_area_geojson', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ vessels: data ?? [] })
}
