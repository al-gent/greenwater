/**
 * Geographic sanity check on GFW mappings. Read-only.
 *
 * A research vessel should occasionally call somewhere near its home port.
 * For every mapped vessel with home coordinates, compute the minimum distance
 * from home to ANY of its port calls; if the closest call in its entire
 * history is > threshold nm away, the mapping is probably a different ship
 * (name+flag collisions — see Kaho/Kiyi).
 *
 * Usage: node scripts/audit_track_geography.mjs [--threshold=250]
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const thresholdArg = process.argv.find((a) => a.startsWith('--threshold='))
const THRESHOLD_NM = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : 250

function haversineNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065 // earth radius in nm
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function main() {
  const { data: vessels, error } = await supabase
    .from('vessels')
    .select('id, name, port_city, port_state, operating_area, primary_latitude, primary_longitude, call_sign')
    .not('vessel_id_gfw', 'is', null)
    .order('id')
  if (error) throw error

  // all port calls, paged
  const calls = new Map() // vessel_id -> [{lat, lon, name}]
  for (let page = 0; ; page++) {
    const { data, error: pageError } = await supabase
      .from('port_calls')
      .select('vessel_id, lat, lon, port_name')
      .not('lat', 'is', null)
      .order('id')
      .range(page * 1000, page * 1000 + 999)
    if (pageError) throw pageError
    for (const r of data ?? []) {
      if (!calls.has(r.vessel_id)) calls.set(r.vessel_id, [])
      calls.get(r.vessel_id).push(r)
    }
    if (!data || data.length < 1000) break
  }

  const flagged = []
  let checked = 0
  for (const v of vessels) {
    const home = { lat: parseFloat(v.primary_latitude), lon: parseFloat(v.primary_longitude) }
    const pc = calls.get(v.id) ?? []
    if (isNaN(home.lat) || isNaN(home.lon) || pc.length === 0) continue
    checked++
    let minD = Infinity
    let nearest = null
    for (const c of pc) {
      const d = haversineNm(home.lat, home.lon, Number(c.lat), Number(c.lon))
      if (d < minD) { minD = d; nearest = c.port_name }
    }
    if (minD > THRESHOLD_NM) {
      flagged.push({
        id: v.id, name: v.name,
        home: [v.port_city, v.port_state].filter(Boolean).join(', '),
        area: v.operating_area,
        hasCallsign: !!v.call_sign,
        calls: pc.length,
        minNm: Math.round(minD),
        nearest,
      })
    }
  }

  flagged.sort((a, b) => b.minNm - a.minNm)
  console.log(`Checked ${checked} mapped vessels with home coords + port calls (threshold ${THRESHOLD_NM} nm)`)
  console.log(`Flagged ${flagged.length} whose ENTIRE history never comes within ${THRESHOLD_NM} nm of home:\n`)
  for (const f of flagged) {
    console.log(`  [${f.id}] ${f.name} — home ${f.home || '?'} (${f.area || 'no area'})${f.hasCallsign ? '' : ' [NO CALLSIGN]'}: ${f.calls} calls, closest ever ${f.minNm} nm (${f.nearest ?? '?'})`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
