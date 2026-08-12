/**
 * Backfill photo credits for photos whose credit is embedded in the filename
 * (NOAA / Scripps / UW / WHOI etc.). Hand-curated mapping — one-off cleanup,
 * August 2026 image-attribution pass.
 *
 * Merges into existing photo_details (appends entries for URLs not already credited).
 *
 * Usage:
 *   node scripts/backfill_filename_credits.mjs          # dry run
 *   node scripts/backfill_filename_credits.mjs --apply  # write to DB
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const APPLY = process.argv.includes('--apply')

const envLines = readFileSync(join(ROOT, '.env.local'), 'utf-8').split('\n')
const env = {}
for (const line of envLines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])

// vessel id → { filename suffix → credit }
const CREDITS = {
  5:    { 'Roger_Revelle_photo_Scripps_UCSD.jpg': 'photo: Scripps Institution of Oceanography, UC San Diego' },
  12:   { 'Sproul_photo_Scripps_UCSD.jpg': 'photo: Scripps Institution of Oceanography, UC San Diego' },
  80:   { 'Thomas_Thompson_photo_UW.jpg': 'photo: University of Washington' },
  90:   { 'NOAA_Ship_Rainier_Photo_courtesy_NOAA.jpg': 'photo: courtesy NOAA' },
  138:  { 'atlantis_photo_whoi.jpg': 'photo: Woods Hole Oceanographic Institution' },
  221:  { 'NOAA_Ship_Ronald_H_Brown_Photo_NOAA.jpg': 'photo: NOAA' },
  269:  { 'carson_Photo_courtesy_of_UW.jpg': 'photo: courtesy University of Washington' },
  675:  { 'NOAA_Ship_Thomas_Jefferson_NOAA_Photo.jpg': 'photo: NOAA' },
  676:  { 'NOAA_Ship_Oscar_Elton_Sette_off_Maui_in_2004_NOAA_Photo_by_Ray_Boland.jpg': 'photo: Ray Boland, NOAA' },
  697:  { 'NOAA_Ship_Oscar_Dyson_aerial_photo_Photo_courtesy_NOAA.jpg': 'photo: courtesy NOAA' },
  999:  { 'NOAA_Ship_Pisces_Credit_NOAA.jpg': 'photo: NOAA' },
  1004: { 'Armstrong_photo_Daniel_Cojanu_Woods_Hole_Oceanographic_Institution.jpg': 'photo: Daniel Cojanu, Woods Hole Oceanographic Institution' },
  1014: { 'NOAA_Ship_Reuben_Lasker_Photo_by_Paul_Hillman_NOAA.jpg': 'photo: Paul Hillman, NOAA' },
  1019: { 'rv_soliton_photo_mtu.jpg': 'photo: Michigan Technological University' },
  1020: { 'Kittiwake_photo_UW.jpg': 'photo: University of Washington' },
  1021: { 'RV_Gloria_Michelle_By_Shelley_Dawicki__NEFSCNOAA.jpg': 'photo: Shelley Dawicki, NEFSC/NOAA' },
  1024: { 'RV_Shearwater_photo_R_Schwemmer.jpg': 'photo: R. Schwemmer' },
  1026: { 'RV_Storm_Petrel_Photo_NOAA.jpg': 'photo: NOAA' },
}

async function main() {
  const ids = Object.keys(CREDITS).map(Number)
  const { data: vessels, error } = await supabase
    .from('vessels')
    .select('id, name, photo_urls, photo_details')
    .in('id', ids)
  if (error) throw error

  let planned = 0
  const updates = []
  for (const v of vessels) {
    const mapping = CREDITS[v.id]
    const existing = v.photo_details ?? []
    const additions = []
    for (const [suffix, credit] of Object.entries(mapping)) {
      const url = (v.photo_urls ?? []).find((u) => u.endsWith(`/${suffix}`))
      if (!url) {
        console.log(`  MISS: vessel ${v.id} (${v.name}) — no photo_urls entry ends with "${suffix}"`)
        continue
      }
      if (existing.some((d) => d.url === url)) {
        console.log(`  SKIP: vessel ${v.id} (${v.name}) — already credited`)
        continue
      }
      additions.push({ url, credit })
      planned++
      console.log(`  vessel ${v.id} (${v.name}): "${credit}"`)
    }
    if (additions.length > 0) updates.push({ id: v.id, details: [...existing, ...additions] })
  }

  console.log(`\n${planned} credits to add across ${updates.length} vessels.`)
  if (!APPLY) {
    console.log('Dry run — re-run with --apply to write.')
    return
  }
  let ok = 0
  for (const u of updates) {
    const { error } = await supabase.from('vessels').update({ photo_details: u.details }).eq('id', u.id)
    if (error) console.warn(`  FAILED vessel ${u.id}: ${error.message}`)
    else ok++
  }
  console.log(`Done: ${ok}/${updates.length} vessels updated.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
