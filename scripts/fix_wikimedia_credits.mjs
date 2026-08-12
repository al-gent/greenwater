/**
 * Fix Wikimedia-sourced photo credits: replace truncated "By X - Own work,"
 * captions with full author + license + source link, and add credits for
 * wiki-sourced photos that had none. Author/license verified against the
 * Commons API (extmetadata) August 2026.
 *
 * Upserts into photo_details by URL: replaces the entry if present, appends if not.
 *
 * Usage:
 *   node scripts/fix_wikimedia_credits.mjs          # dry run
 *   node scripts/fix_wikimedia_credits.mjs --apply  # write to DB
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

const COMMONS = 'https://commons.wikimedia.org/wiki/'

// vessel id → { filename suffix → { credit, source } }
const FIXES = {
  177: {
    'Q20ARAPuertoDeseado.jpg': {
      credit: 'Martin.Otero, CC BY 2.5, via Wikimedia Commons',
      source: COMMONS + 'File:Q20ARAPuertoDeseado.jpg',
    },
  },
  319: {
    'Celtic_Voyager__IMO_9154842__-144529__44006543874_.jpg': {
      credit: 'William Murphy, CC BY-SA 2.0, via Wikimedia Commons',
      source: COMMONS + 'File:Celtic_Voyager_(IMO_9154842)_-144529_(44006543874).jpg',
    },
  },
  777: {
    'CCGS_Amundsen.jpg': {
      credit: 'Tatiana Pichugina, CC BY 2.0, via Wikimedia Commons',
      source: COMMONS + 'File:CCGS_Amundsen.jpg',
    },
  },
  993: {
    '500px-LDEO_Langseth.jpg': {
      credit: 'Office of Marine Operations, LDEO — GFDL, via Wikimedia Commons',
      source: COMMONS + 'File:LDEO_Langseth.jpg',
    },
  },
  996: {
    'Sikuliaq_in_Seward_July_2020_by_Sarah_Spanos.jpeg': {
      credit: 'photo: Sarah Spanos, University of Alaska Fairbanks',
      source: null,
    },
  },
  1005: {
    'Simon_Stevin__Zeebrugge_.jpg': {
      credit: 'Hans Hillewaert, CC BY-SA 4.0, via Wikimedia Commons',
      source: COMMONS + 'File:Simon_Stevin_(Zeebrugge).jpg',
    },
  },
  1046: {
    'Alpha_Crucis.jpg': {
      credit: 'Evolt, CC BY-SA 4.0, via Wikimedia Commons',
      source: COMMONS + 'File:Alpha_Crucis.jpg',
    },
  },
  1132: {
    'Buque_Oceanogr_fico_Austral.jpg': {
      credit: 'Casa Rosada, CC BY 2.5 AR, via Wikimedia Commons',
      source: COMMONS + 'File:Buque_Oceanogr%C3%A1fico_Austral.jpg',
    },
  },
  1187: {
    'RV_Tom_Crean_-_Horgans_Quay_Cork_-_1_Dec_2022_-_3.jpg': {
      credit: 'Guliolopez, CC BY-SA 4.0, via Wikimedia Commons',
      source: COMMONS + 'File:RV_Tom_Crean_-_Horgans_Quay_Cork_-_1_Dec_2022_-_3.jpg',
    },
  },
}

async function main() {
  const ids = Object.keys(FIXES).map(Number)
  const { data: vessels, error } = await supabase
    .from('vessels')
    .select('id, name, photo_urls, photo_details')
    .in('id', ids)
  if (error) throw error

  const updates = []
  for (const v of vessels) {
    const details = [...(v.photo_details ?? [])]
    let changed = false
    for (const [suffix, fix] of Object.entries(FIXES[v.id])) {
      const url = (v.photo_urls ?? []).find((u) => u.endsWith(`/${suffix}`))
      if (!url) {
        console.log(`  MISS: vessel ${v.id} (${v.name}) — no photo_urls entry ends with "${suffix}"`)
        continue
      }
      const entry = { url, credit: fix.credit, ...(fix.source ? { source: fix.source } : {}) }
      const i = details.findIndex((d) => d.url === url)
      const old = i >= 0 ? details[i].credit : '(none)'
      if (i >= 0) details[i] = entry
      else details.push(entry)
      changed = true
      console.log(`  vessel ${v.id} (${v.name}):\n    old: ${old}\n    new: ${fix.credit}${fix.source ? `\n    src: ${fix.source}` : ''}`)
    }
    if (changed) updates.push({ id: v.id, details })
  }

  console.log(`\n${updates.length} vessels to update.`)
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
