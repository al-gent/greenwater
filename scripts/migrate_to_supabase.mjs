/**
 * One-shot migration script: vessels.json + public/images/vessels/ → Supabase
 *
 * Usage:
 *   node scripts/migrate_to_supabase.mjs
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')

// Load .env.local manually (no dotenv dependency needed in Node 20+)
const envPath = join(ROOT, '.env.local')
const envLines = readFileSync(envPath, 'utf-8').split('\n')
const env = {}
for (const line of envLines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY === 'your_service_role_key_here') {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const BUCKET = 'vessel-photos'
const IMAGES_DIR = join(ROOT, 'public', 'images', 'vessels')
const VESSELS_JSON = join(ROOT, 'data', 'vessels.json')
const BATCH_SIZE = 50

/** Match Python: non-alphanumeric non-ASCII/._- chars → underscore */
function safeFilename(name) {
  return name
    .split('')
    .map((c) => (/[\p{L}\p{N}._-]/u.test(c) ? c : '_'))
    .join('')
}

/** Sanitize filename for Supabase Storage (ASCII only) */
function storageKey(filename) {
  return filename
    .split('')
    .map((c) => (/[a-zA-Z0-9._\-/]/.test(c) ? c : '_'))
    .join('')
}

/** Coerce empty string / non-finite to null for numeric columns */
function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

/** Get shipPhoto file for a vessel */
function getShipPhoto(vessel) {
  return vessel.files?.find(
    (f) => f.contentType === 'shipPhoto' && f.fileType === 'image'
  ) ?? null
}

/** Derive content type from filename */
function contentTypeFromFilename(filename) {
  const ext = extname(filename).toLowerCase()
  const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }
  return map[ext] ?? 'image/jpeg'
}

async function uploadImage(filename) {
  const localPath = join(IMAGES_DIR, filename)
  if (!existsSync(localPath)) return null

  const storagePath = storageKey(filename)

  // Check if already uploaded (resume-safe)
  const { data: existing } = await supabase.storage.from(BUCKET).list('', {
    search: storagePath,
    limit: 1,
  })
  if (existing?.some((f) => f.name === storagePath)) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
    return data.publicUrl
  }

  const fileBuffer = readFileSync(localPath)
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, fileBuffer, {
    contentType: contentTypeFromFilename(filename),
    upsert: false,
  })

  if (error) {
    console.warn(`  Upload failed for ${filename} (key: ${storagePath}): ${error.message}`)
    return null
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

async function main() {
  console.log('Reading vessels.json…')
  const vessels = JSON.parse(readFileSync(VESSELS_JSON, 'utf-8'))
  console.log(`  ${vessels.length} vessels found`)

  // Step 1: Upload images
  console.log('\nUploading images to Supabase Storage…')
  const photoUrlMap = new Map() // vessel id → public URL

  let uploadCount = 0
  let skipCount = 0

  for (const vessel of vessels) {
    const photo = getShipPhoto(vessel)
    if (!photo?.name) continue

    const filename = safeFilename(photo.name)
    const url = await uploadImage(filename)
    if (url) {
      photoUrlMap.set(vessel.id, url)
      uploadCount++
      if (uploadCount % 20 === 0) console.log(`  ${uploadCount} images uploaded…`)
    } else {
      skipCount++
    }
  }

  console.log(`  Done: ${uploadCount} uploaded, ${skipCount} skipped/missing`)

  // Step 2: Upsert vessels in batches
  console.log('\nUpserting vessels to Supabase…')

  const rows = vessels.map((v) => ({
    id: v.id,
    name: v.name,
    country: v.country ?? null,
    homeport: v.homeport ?? null,
    Affiliation: v.Affiliation ?? null,
    Operator_Name: v.Operator_Name ?? null,
    length: num(v.length),
    Speed_Cruise: num(v.Speed_Cruise),
    scientists: num(v.scientists),
    Main_Activity: v.Main_Activity || null,
    Year_Built: num(v.Year_Built),
    Year_Refit: num(v.Year_Refit),
    Call_sign: v.Call_sign || null,
    url_ship: v.url_ship || null,
    url_operator: v.url_operator || null,
    primaryLatitude: num(v.primaryLatitude),
    primaryLongitude: num(v.primaryLongitude),
    beam: num(v.beam),
    draft: num(v.draft),
    crew: num(v.crew),
    Speed_Max: num(v.Speed_Max),
    Ice_breaking: v.Ice_breaking ?? null,
    Operating_area: v.Operating_area ?? null,
    Endurance: v.Endurance ?? null,
    DPos: v.DPos ?? null,
    files: v.files ?? [],
    photo_url: photoUrlMap.get(v.id) ?? null,
  }))

  let upserted = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('vessels').upsert(batch, { onConflict: 'id' })
    if (error) {
      console.error(`  Batch ${i}–${i + batch.length} failed: ${error.message}`)
      process.exit(1)
    }
    upserted += batch.length
    console.log(`  ${upserted}/${rows.length} rows upserted…`)
  }

  console.log(`\nMigration complete!`)
  console.log(`  ${upserted} vessels upserted`)
  console.log(`  ${photoUrlMap.size} photos linked`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
