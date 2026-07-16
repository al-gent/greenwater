/**
 * Backfill vessels.photo_details ({url, credit}[]) from the original
 * data/vessel_details/[id].json files[] arrays, whose per-photo `credit`
 * field was dropped in the doc_details migration.
 *
 * Matches source filenames to photo_urls entries using the same
 * safeFilename/storageKey sanitization the upload scripts used.
 *
 * Usage:
 *   node scripts/backfill_photo_credits.mjs          # dry run — prints what it would write
 *   node scripts/backfill_photo_credits.mjs --apply  # write to DB
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Run supabase/migrations/20260716_photo_details.sql first.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const DETAILS_DIR = join(ROOT, 'data', 'vessel_details')
const APPLY = process.argv.includes('--apply')

// ── Load .env.local ────────────────────────────────────────────────────────
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

// Same sanitization chain as migrate_to_supabase.mjs / backfill_vessel_details.mjs,
// so computed keys match the uploaded storage paths exactly.
function safeFilename(name) {
  return name
    .split('')
    .map((c) => (/[\p{L}\p{N}._-]/u.test(c) ? c : '_'))
    .join('')
}
function storageKey(filename) {
  return filename
    .split('')
    .map((c) => (/[a-zA-Z0-9._\-/]/.test(c) ? c : '_'))
    .join('')
}

async function main() {
  const { data: vessels, error } = await supabase
    .from('vessels')
    .select('id, name, photo_urls')
    .not('photo_urls', 'is', null)
  if (error) throw error
  const byId = new Map(vessels.map((v) => [v.id, v]))

  let matched = 0, unmatched = 0, updated = 0
  const updates = []

  for (const file of readdirSync(DETAILS_DIR)) {
    if (!file.endsWith('.json')) continue
    const detail = JSON.parse(readFileSync(join(DETAILS_DIR, file), 'utf-8'))
    const vessel = byId.get(detail.id ?? Number(file.replace('.json', '')))
    if (!vessel?.photo_urls?.length) continue

    const credited = (detail.files ?? []).filter(
      (f) => f.contentType === 'shipPhoto' && f.fileType === 'image' && f.credit?.trim()
    )
    if (credited.length === 0) continue

    const details = []
    for (const f of credited) {
      const key = storageKey(safeFilename(f.name))
      const url = vessel.photo_urls.find((u) => u.endsWith(`/${key}`))
      if (url) {
        details.push({ url, credit: f.credit.trim() })
        matched++
      } else {
        unmatched++
        console.log(`  no URL match: vessel ${vessel.id} (${vessel.name}) file "${f.name}"`)
      }
    }
    if (details.length > 0) updates.push({ id: vessel.id, name: vessel.name, details })
  }

  console.log(`\n${updates.length} vessels to update · ${matched} credits matched · ${unmatched} unmatched`)
  for (const u of updates) {
    console.log(`  ${u.id} ${u.name}: ${u.details.map((d) => JSON.stringify(d.credit)).join(', ')}`)
  }

  if (!APPLY) {
    console.log('\nDry run — re-run with --apply to write.')
    return
  }
  for (const u of updates) {
    const { error } = await supabase.from('vessels').update({ photo_details: u.details }).eq('id', u.id)
    if (error) console.warn(`  FAILED vessel ${u.id}: ${error.message}`)
    else updated++
  }
  console.log(`\nDone: ${updated}/${updates.length} vessels updated.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
