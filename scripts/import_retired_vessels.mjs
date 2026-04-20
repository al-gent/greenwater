/**
 * One-shot import: retired vessels from data_dump.sql → Supabase
 *
 * Usage:
 *   node scripts/import_retired_vessels.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')

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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Parse the column list from an INSERT statement header
function parseColumns(insertHeader) {
  const match = insertHeader.match(/INSERT INTO `ships` \((.+?)\) VALUES/)
  if (!match) throw new Error('Could not parse INSERT column list')
  return match[1].split(',').map(c => c.trim().replace(/`/g, ''))
}

// State-machine SQL value parser — handles NULL, numbers, and MySQL-escaped strings
function parseValues(valuesStr) {
  const values = []
  let i = 0
  const len = valuesStr.length

  // Skip opening paren
  if (valuesStr[i] === '(') i++

  while (i < len) {
    // Skip whitespace
    while (i < len && valuesStr[i] === ' ') i++

    if (valuesStr[i] === ')') break

    if (valuesStr.slice(i, i + 4) === 'NULL') {
      values.push(null)
      i += 4
    } else if (valuesStr[i] === "'") {
      // String value
      i++ // skip opening quote
      let str = ''
      while (i < len) {
        if (valuesStr[i] === '\\') {
          i++
          const esc = valuesStr[i]
          if (esc === "'") str += "'"
          else if (esc === '\\') str += '\\'
          else if (esc === 'n') str += '\n'
          else if (esc === 'r') str += '\r'
          else if (esc === 't') str += '\t'
          else str += esc
          i++
        } else if (valuesStr[i] === "'") {
          // Could be '' (escaped quote) or end of string
          if (valuesStr[i + 1] === "'") {
            str += "'"
            i += 2
          } else {
            i++ // closing quote
            break
          }
        } else {
          str += valuesStr[i]
          i++
        }
      }
      values.push(str)
    } else {
      // Number
      let num = ''
      while (i < len && valuesStr[i] !== ',' && valuesStr[i] !== ')') {
        num += valuesStr[i]
        i++
      }
      const trimmed = num.trim()
      if (trimmed === '') {
        values.push(null)
      } else if (trimmed.includes('.')) {
        values.push(parseFloat(trimmed))
      } else {
        values.push(parseInt(trimmed, 10))
      }
    }

    // Skip comma
    while (i < len && (valuesStr[i] === ',' || valuesStr[i] === ' ')) {
      if (valuesStr[i] === ',') { i++; break }
      i++
    }
  }

  return values
}

function g(row, colMap, col) {
  const idx = colMap[col]
  if (idx === undefined) return null
  const v = row[idx]
  return (v === null || v === undefined || v === '') ? null : v
}

function gNum(row, colMap, col) {
  const v = g(row, colMap, col)
  if (v === null) return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return isNaN(n) ? null : n
}

function gInt(row, colMap, col) {
  const v = g(row, colMap, col)
  if (v === null) return null
  const n = typeof v === 'number' ? Math.round(v) : parseInt(v, 10)
  return isNaN(n) ? null : n
}

function gStr(row, colMap, col) {
  const v = g(row, colMap, col)
  return v === null ? null : String(v)
}

async function main() {
  console.log('Reading data_dump.sql…')
  const dump = readFileSync(join(ROOT, 'data_dump.sql'), 'utf-8')
  const lines = dump.split('\n')

  let colMap = null
  const retiredVessels = []

  for (const line of lines) {
    if (!line.startsWith('INSERT INTO `ships`')) continue

    // Parse column map once
    if (!colMap) {
      const cols = parseColumns(line)
      colMap = {}
      cols.forEach((c, i) => { colMap[c] = i })
      console.log(`Parsed ${cols.length} columns. status at index ${colMap['status']}`)
    }

    // Extract VALUES portion
    const valStart = line.indexOf(' VALUES (')
    if (valStart === -1) continue
    const valStr = line.slice(valStart + 8) // starts with '('

    let row
    try {
      row = parseValues(valStr)
    } catch (e) {
      console.warn('Parse error on line, skipping:', e.message)
      continue
    }

    const status = gStr(row, colMap, 'status')
    if (status !== 'retired') continue

    const id = gInt(row, colMap, 'id')
    const vessel = {
      id,
      name: gStr(row, colMap, 'ship_name'),
      country: gStr(row, colMap, 'country'),
      port_city: gStr(row, colMap, 'homeport'),
      url_ship: gStr(row, colMap, 'url_ship'),
      call_sign: gStr(row, colMap, 'call_sign'),
      operating_area: gStr(row, colMap, 'operating_area'),
      operator_name: gStr(row, colMap, 'operator_name'),
      length: gNum(row, colMap, 'length'),
      beam: gNum(row, colMap, 'beam'),
      draft: gNum(row, colMap, 'draft'),
      endurance: gStr(row, colMap, 'endurance') !== null ? String(gStr(row, colMap, 'endurance')) : null,
      ice_breaking: gStr(row, colMap, 'ice_breaking'),
      crew: gInt(row, colMap, 'crew'),
      scientists: gInt(row, colMap, 'scientists'),
      main_activity: gStr(row, colMap, 'main_activity'),
      area_wetlab: gNum(row, colMap, 'area_wetlab'),
      area_drylab: gNum(row, colMap, 'area_drylab'),
      dpos: gStr(row, colMap, 'dpos'),
      core_capable: gStr(row, colMap, 'core_capable'),
      ctd_cap: gStr(row, colMap, 'c_t_d_cap'),
      aquis_multibeam: gStr(row, colMap, 'aquis__multibeam'),
      underwater_vehicles_rov: gStr(row, colMap, 'underwater_vehicles_rov'),
      underwater_vehicles_auv: gStr(row, colMap, 'underwater_vehicles_auv'),
      diving_cap: gStr(row, colMap, 'diving_cap'),
      notes: gStr(row, colMap, 'notes'),
      primary_longitude: gStr(row, colMap, 'primary_longitude'),
      primary_latitude: gStr(row, colMap, 'primary_latitude'),
      gross_tons: gNum(row, colMap, 'gross_tons'),
      speed_cruise: gNum(row, colMap, 'speed_cruise'),
      speed_max: gNum(row, colMap, 'speed_max'),
      year_built: gInt(row, colMap, 'year_built'),
      year_refit: gInt(row, colMap, 'year_refit'),
      status: 'retired',
    }

    retiredVessels.push(vessel)
  }

  console.log(`Found ${retiredVessels.length} retired vessels`)

  // Upsert in batches of 50
  const BATCH = 50
  let inserted = 0
  let errors = 0

  for (let i = 0; i < retiredVessels.length; i += BATCH) {
    const batch = retiredVessels.slice(i, i + BATCH)
    const { error } = await supabase
      .from('vessels')
      .upsert(batch, { onConflict: 'id' })

    if (error) {
      console.error(`Batch ${i / BATCH + 1} error:`, error.message)
      errors++
    } else {
      inserted += batch.length
      process.stdout.write(`\rInserted ${inserted}/${retiredVessels.length}…`)
    }
  }

  console.log(`\nDone. ${inserted} inserted/updated, ${errors} batch errors.`)
}

main().catch(console.error)
