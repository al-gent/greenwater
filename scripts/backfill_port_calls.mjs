/**
 * Backfill port_city, port_state, port_country on port_calls rows that have lat/lon.
 * Uses Nominatim reverse geocoding. Rate-limited to 1 req/sec.
 *
 * Usage:
 *   node scripts/backfill_port_calls.mjs           # backfill all
 *   node scripts/backfill_port_calls.mjs --limit=5 # test with first 5
 *   node scripts/backfill_port_calls.mjs --dry-run
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

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Greenwater Foundation vessel database (contact@greenwater.org)',
      'Accept-Language': 'en',
    },
  })
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`)
  const data = await res.json()
  if (!data.address) return null

  const a = data.address
  // Prefer specific city-level names; fall back to broader admin areas
  const city = a.city ?? a.town ?? a.village ?? a.suburb ?? a.municipality ?? a.district ?? a.county ?? null
  const state = a.state ?? a.region ?? a.province ?? null
  const country = a.country ?? null

  return { city, state, country }
}

async function main() {
  let query = supabase
    .from('port_calls')
    .select('id, lat, lon, port_name')
    .not('lat', 'is', null)
    .not('lon', 'is', null)
    .is('port_city', null)
    .order('id')

  if (limit) query = query.limit(limit)

  const { data: rows, error } = await query
  if (error) throw error

  console.log(`Found ${rows.length} port calls to geocode${dryRun ? ' (dry run)' : ''}`)

  let succeeded = 0
  let failed = 0

  for (const row of rows) {
    console.log(`  [${row.id}] ${row.port_name ?? '(no name)'} @ ${row.lat}, ${row.lon}`)
    if (dryRun) continue

    try {
      const result = await reverseGeocode(row.lat, row.lon)
      if (!result || !result.city) {
        console.log(`    ✗ no result`)
        failed++
      } else {
        const { error: updateError } = await supabase
          .from('port_calls')
          .update({ port_city: result.city, port_state: result.state, port_country: result.country })
          .eq('id', row.id)
        if (updateError) throw updateError
        console.log(`    ✓ ${[result.city, result.state, result.country].filter(Boolean).join(', ')}`)
        succeeded++
      }
    } catch (err) {
      console.error(`    ✗ error: ${err.message}`)
      failed++
    }

    await sleep(1100)
  }

  console.log(`\nDone. ${succeeded} updated, ${failed} failed/skipped.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
