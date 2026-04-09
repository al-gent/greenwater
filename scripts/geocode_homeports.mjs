/**
 * Backfill primary_latitude / primary_longitude for vessels missing coordinates.
 * Uses Nominatim (OpenStreetMap) geocoding from port_city, port_state, country.
 *
 * Usage:
 *   node scripts/geocode_homeports.mjs           # geocode all missing
 *   node scripts/geocode_homeports.mjs --limit=5 # test with first 5
 *   node scripts/geocode_homeports.mjs --dry-run # print queries, no DB writes
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null
const dryRun = process.argv.includes('--dry-run')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Greenwater Foundation vessel database (contact@greenwater.org)' },
  })
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`)
  const data = await res.json()
  return data[0] ?? null
}

async function main() {
  // Fetch vessels missing coordinates but with at least a city or country
  let query = supabase
    .from('vessels')
    .select('id, name, port_city, port_state, country')
    .or('primary_latitude.is.null,primary_longitude.is.null')
    .or('port_city.not.is.null,country.not.is.null')
    .order('id')

  if (limit) query = query.limit(limit)

  const { data: vessels, error } = await query
  if (error) throw error

  console.log(`Found ${vessels.length} vessels to geocode${dryRun ? ' (dry run)' : ''}`)

  let succeeded = 0
  let failed = 0

  for (const vessel of vessels) {
    // Build query from most specific to least specific
    const parts = [vessel.port_city, vessel.port_state, vessel.country].filter(Boolean)
    if (parts.length === 0) {
      console.log(`  [skip] ${vessel.name} — no location data`)
      failed++
      continue
    }

    const q = parts.join(', ')
    console.log(`  geocoding: ${vessel.name} → "${q}"`)

    if (dryRun) continue

    try {
      const result = await geocode(q)
      if (!result) {
        // Try fallback: just country
        const fallback = vessel.country
        const fallbackResult = fallback && parts.length > 1 ? await geocode(fallback) : null
        await sleep(1100) // respect Nominatim 1 req/sec
        if (!fallbackResult) {
          console.log(`    ✗ no result`)
          failed++
          continue
        }
        const { error: updateError } = await supabase
          .from('vessels')
          .update({ primary_latitude: fallbackResult.lat, primary_longitude: fallbackResult.lon })
          .eq('id', vessel.id)
        if (updateError) throw updateError
        console.log(`    ✓ fallback (${vessel.country}): ${fallbackResult.lat}, ${fallbackResult.lon}`)
      } else {
        const { error: updateError } = await supabase
          .from('vessels')
          .update({ primary_latitude: result.lat, primary_longitude: result.lon })
          .eq('id', vessel.id)
        if (updateError) throw updateError
        console.log(`    ✓ ${result.lat}, ${result.lon} (${result.display_name.slice(0, 60)})`)
      }
      succeeded++
    } catch (err) {
      console.error(`    ✗ error: ${err.message}`)
      failed++
    }

    // Nominatim rate limit: max 1 request per second
    await sleep(1100)
  }

  console.log(`\nDone. ${succeeded} updated, ${failed} failed/skipped.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
