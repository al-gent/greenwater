/**
 * Apply built operating-area GeoJSON to the vessels table.
 * Reads data/operating_areas_apply.json (from scripts/build_operating_areas.py).
 *
 * Only writes operating_area_geojson where it is currently NULL — never overwrites
 * an operator's hand-drawn area. Active vessels only.
 *
 * Usage:
 *   node scripts/apply_operating_areas.mjs --dry-run   # report, no writes (default-safe)
 *   node scripts/apply_operating_areas.mjs             # write to DB
 *   node scripts/apply_operating_areas.mjs --force     # also overwrite existing areas
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')

const data = JSON.parse(readFileSync('data/operating_areas_apply.json', 'utf8'))
const ids = Object.keys(data).map(Number)
console.log(`built geometry for ${ids.length} vessels`)

// current state: which are active, which already have an area
const { data: rows, error } = await supabase
  .from('vessels')
  .select('id, status, operating_area_geojson')
  .in('id', ids)
if (error) throw error

const byId = new Map(rows.map((r) => [r.id, r]))
let written = 0
let skippedInactive = 0
let skippedExisting = 0

for (const id of ids) {
  const row = byId.get(id)
  if (!row) continue
  if (row.status !== 'active') { skippedInactive++; continue }
  if (row.operating_area_geojson && !force) { skippedExisting++; continue }

  const fc = data[id].geojson
  if (dryRun) { written++; continue }

  const { error: upErr } = await supabase
    .from('vessels')
    .update({ operating_area_geojson: fc })
    .eq('id', id)
  if (upErr) { console.error(`  ! ${id} (${data[id].name}): ${upErr.message}`); continue }
  written++
}

console.log(
  `${dryRun ? '[dry-run] would write' : 'wrote'}: ${written} | ` +
  `skipped inactive: ${skippedInactive} | skipped existing: ${skippedExisting}${force ? ' (force on)' : ''}`,
)
