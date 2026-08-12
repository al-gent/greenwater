/**
 * Backfill provenance lineage into vessels.photo_details.
 *
 * Every photo (credited or not) gets a photo_details entry with:
 *   origin: 'operator' | 'institution' | 'public-domain' | 'wikimedia' | 'import' | 'unknown'
 *   uploaded_by / uploaded_at: from the storage.objects auth trail (app uploads),
 *     'script' for service-role uploads, absent for pre-auth migration files.
 *
 * Origin rules, in priority order:
 *   1. hand-tagged overrides (OVERRIDES below)
 *   2. source URL on commons.wikimedia.org            → wikimedia
 *   3. credit mentions NOAA / USGS / public domain    → public-domain
 *   4. storage uploader had role 'operator'           → operator
 *   5. credit matched from data/vessel_details import → import
 *   6. any other credit (institution/operator sites)  → institution
 *   7. otherwise                                      → unknown
 *
 * Usage:
 *   node scripts/backfill_photo_lineage.mjs <storage_objects.json>          # dry run
 *   node scripts/backfill_photo_lineage.mjs <storage_objects.json> --apply
 *
 * <storage_objects.json> = psql dump of storage.objects (name, created_at, email, role)
 * for bucket vessel-photos.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const DETAILS_DIR = join(ROOT, 'data', 'vessel_details')
const APPLY = process.argv.includes('--apply')
const objectsPath = process.argv[2]
if (!objectsPath || !existsSync(objectsPath)) {
  console.error('Usage: node scripts/backfill_photo_lineage.mjs <storage_objects.json> [--apply]')
  process.exit(1)
}

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

// vessel id → origin, for cases the rules can't infer (resolved by human review Aug 2026)
const OVERRIDES = {
  22: 'operator', // Shana Rae — operator's own website (shanarae.com)
}

const storageByKey = new Map(
  JSON.parse(readFileSync(objectsPath, 'utf-8')).map((o) => [o.name, o])
)

// Same sanitization as migrate/backfill scripts, to rebuild the import-credit set
function safeFilename(name) {
  return name.split('').map((c) => (/[\p{L}\p{N}._-]/u.test(c) ? c : '_')).join('')
}
function storageKey(filename) {
  return filename.split('').map((c) => (/[a-zA-Z0-9._\-/]/.test(c) ? c : '_')).join('')
}

// Keys of photos whose credit came from the original data/vessel_details import
const importKeys = new Set()
if (existsSync(DETAILS_DIR)) {
  for (const file of readdirSync(DETAILS_DIR)) {
    if (!file.endsWith('.json')) continue
    const detail = JSON.parse(readFileSync(join(DETAILS_DIR, file), 'utf-8'))
    for (const f of detail.files ?? []) {
      if (f.contentType === 'shipPhoto' && f.fileType === 'image' && f.credit?.trim()) {
        importKeys.add(storageKey(safeFilename(f.name)))
      }
    }
  }
}

function inferOrigin(vesselId, key, entry, storageObj) {
  if (OVERRIDES[vesselId]) return OVERRIDES[vesselId]
  if (entry?.source?.includes('commons.wikimedia.org')) return 'wikimedia'
  if (entry?.credit && /noaa|usgs|public domain/i.test(entry.credit)) return 'public-domain'
  if (storageObj?.role === 'operator') return 'operator'
  if (entry?.credit && importKeys.has(key)) return 'import'
  if (entry?.credit) return 'institution'
  return 'unknown'
}

async function main() {
  const { data: vessels, error } = await supabase
    .from('vessels')
    .select('id, name, photo_urls, photo_details')
    .not('photo_urls', 'is', null)
  if (error) throw error

  const counts = {}
  const updates = []
  for (const v of vessels) {
    if (!v.photo_urls?.length) continue
    const existing = v.photo_details ?? []
    const details = []
    let changed = false
    for (const url of v.photo_urls) {
      const key = decodeURIComponent(url.split('/vessel-photos/')[1] ?? '')
      const prior = existing.find((d) => d.url === url) ?? { url }
      const so = storageByKey.get(key)
      const origin = prior.origin ?? inferOrigin(v.id, key, prior, so)
      const entry = { ...prior, origin }
      if (so && !entry.uploaded_at) {
        entry.uploaded_by = so.email ?? 'script'
        entry.uploaded_at = so.created_at
      }
      if (JSON.stringify(entry) !== JSON.stringify(prior) || !existing.length) changed = true
      details.push(entry)
      counts[origin] = (counts[origin] ?? 0) + 1
    }
    // keep any photo_details entries whose url is no longer in photo_urls (shouldn't exist, but don't drop data)
    for (const d of existing) if (!v.photo_urls.includes(d.url)) details.push(d)
    if (changed) updates.push({ id: v.id, name: v.name, details })
  }

  console.log('Origin counts:', counts)
  console.log(`${updates.length} vessels to update.`)
  const unknowns = updates.flatMap((u) =>
    u.details.filter((d) => d.origin === 'unknown').map((d) => `  ${u.id} ${u.name}: ${d.url.split('/vessel-photos/')[1]}`)
  )
  if (unknowns.length) console.log(`\norigin=unknown (${unknowns.length}):\n` + unknowns.join('\n'))

  if (!APPLY) {
    console.log('\nDry run — re-run with --apply to write.')
    return
  }
  let ok = 0
  for (const u of updates) {
    const { error } = await supabase.from('vessels').update({ photo_details: u.details }).eq('id', u.id)
    if (error) console.warn(`  FAILED vessel ${u.id}: ${error.message}`)
    else ok++
  }
  console.log(`\nDone: ${ok}/${updates.length} vessels updated.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
