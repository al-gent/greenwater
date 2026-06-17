/**
 * Remove country-centroid home-port coordinates.
 *
 * Many vessels have a home port that is *just a country* (blank port_city and
 * port_state). scripts/geocode_homeports.mjs geocoded those from the country name
 * alone, so primary_latitude/longitude landed on the country's geographic centroid
 * (e.g. dead center of Canada). That's a false marker on the map.
 *
 * This nulls primary_latitude/primary_longitude for those vessels. The source
 * port_city/port_state/country text is left untouched, so they can be re-geocoded
 * later if better data arrives. Small island states (where the centroid is roughly
 * the real place) are kept.
 *
 * Usage:
 *   node scripts/clean_country_centroid_homeports.mjs --dry-run   # report only
 *   node scripts/clean_country_centroid_homeports.mjs             # write
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const dryRun = process.argv.includes('--dry-run')

// Small island states/territories where the country centroid is ~the real place.
const KEEP = new Set(['cayman islands', 'faroe islands'])

const blank = (v) => !v || !String(v).trim()

const { data, error } = await supabase
  .from('vessels')
  .select('id, name, country, port_city, port_state, primary_latitude, primary_longitude')
  .eq('status', 'active')
if (error) throw error

const targets = data.filter(
  (v) =>
    !blank(v.primary_latitude) &&
    !blank(v.primary_longitude) &&
    blank(v.port_city) &&
    blank(v.port_state) &&
    !KEEP.has(String(v.country ?? '').trim().toLowerCase()),
)

const kept = data.filter(
  (v) => blank(v.port_city) && blank(v.port_state) && KEEP.has(String(v.country ?? '').trim().toLowerCase()),
)

console.log(`country-only home ports to clear: ${targets.length} | kept (small islands): ${kept.length}`)

let cleared = 0
for (const v of targets) {
  if (dryRun) { cleared++; continue }
  const { error: upErr } = await supabase
    .from('vessels')
    .update({ primary_latitude: null, primary_longitude: null })
    .eq('id', v.id)
  if (upErr) { console.error(`  ! #${v.id} ${v.name}: ${upErr.message}`); continue }
  cleared++
}

console.log(`${dryRun ? '[dry-run] would clear' : 'cleared'}: ${cleared}`)
