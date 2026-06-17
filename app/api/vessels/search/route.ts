import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { haversineNm, withinDistanceOfFeatureCollection } from '@/lib/geo'

// Location search. Returns matching vessel IDs; geometry/coords never ship to the
// client. Three modes:
//   operating_area — point-in-polygon containment (cruise planning)
//   home_port      — within `radius` nm of the vessel's home port
//   last_port      — within `radius` nm of the vessel's last known port call (GFW)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lon = parseFloat(searchParams.get('lon') ?? '')
  const mode = searchParams.get('mode') ?? 'operating_area'
  const radius = parseFloat(searchParams.get('radius') ?? '250') // nautical miles

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 })
  }

  // When the searched place is an area (state/country/city), Photon gives a bbox.
  // For proximity modes we match coords inside that box instead of a radius from
  // the centroid (so "US" matches all US-based vessels, not a circle around Kansas).
  const bboxRaw = (searchParams.get('bbox') ?? '').split(',').map(Number)
  const bbox = bboxRaw.length === 4 && bboxRaw.every((n) => !isNaN(n))
    ? (bboxRaw as [number, number, number, number]) // [minLon, minLat, maxLon, maxLat]
    : null
  // For an area pick, the radius buffers the box *outward* (one expanded box) so
  // "Kodiak" also pulls in vessels nearby. For a point pick it's a plain circle.
  // ~1 nm = 1/60° latitude; longitude degrees shrink with cos(latitude).
  const dLat = radius / 60
  const dLon = radius / (60 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))
  const inArea = (plat: number, plon: number) =>
    bbox
      ? plon >= bbox[0] - dLon && plon <= bbox[2] + dLon && plat >= bbox[1] - dLat && plat <= bbox[3] + dLat
      : haversineNm(lat, lon, plat, plon) <= radius

  // Country-level picks match by country name (a country bbox is uselessly huge —
  // e.g. the US spans Alaska→Florida). Normalize the few names that differ between
  // Photon ("United States") and our DB ("USA").
  const COUNTRY_ALIASES: Record<string, string> = {
    usa: 'united states', us: 'united states', 'u.s.a.': 'united states', 'u.s.': 'united states',
    uk: 'united kingdom', 'u.k.': 'united kingdom',
    'russian federation': 'russia',
    'south korea': 'korea', 'republic of korea': 'korea', 'north korea': 'korea',
  }
  const normCountry = (s: string | null | undefined) => {
    const k = (s ?? '').trim().toLowerCase()
    return COUNTRY_ALIASES[k] ?? k
  }
  const wantCountry = searchParams.get('country')?.trim() ? normCountry(searchParams.get('country')) : null

  const ids: number[] = []

  if (mode === 'operating_area') {
    const { data, error } = await supabase
      .from('vessels')
      .select('id, operating_area_geojson')
      .eq('status', 'active')
      .not('operating_area_geojson', 'is', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // vessel matches if its operating area comes within `radius` nm of the point
    for (const v of data ?? []) {
      if (withinDistanceOfFeatureCollection(lon, lat, v.operating_area_geojson, radius)) ids.push(v.id)
    }
  } else if (mode === 'home_port') {
    const { data, error } = await supabase
      .from('vessels')
      .select('id, country, primary_latitude, primary_longitude')
      .eq('status', 'active')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const v of data ?? []) {
      if (wantCountry) {
        if (normCountry(v.country) === wantCountry) ids.push(v.id)
      } else {
        const vlat = parseFloat(v.primary_latitude)
        const vlon = parseFloat(v.primary_longitude)
        if (!isNaN(vlat) && !isNaN(vlon) && inArea(vlat, vlon)) ids.push(v.id)
      }
    }
  } else if (mode === 'last_port') {
    const { data, error } = await supabase
      .from('vessel_last_port')
      .select('vessel_id, port_country, lat, lon')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const v of data ?? []) {
      if (wantCountry) {
        if (normCountry(v.port_country) === wantCountry) ids.push(v.vessel_id)
      } else if (v.lat != null && v.lon != null && inArea(Number(v.lat), Number(v.lon))) {
        ids.push(v.vessel_id)
      }
    }
  } else {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
  }

  return NextResponse.json({ ids })
}
