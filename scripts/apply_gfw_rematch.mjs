/**
 * Apply reviewed GFW identity corrections from rematch_gfw_identity.mjs output.
 *
 * For each selected row:
 *   • updates vessels.mmsi + vessels.vessel_id_gfw
 *   • for CHANGED/LOST vessels, deletes their port_calls (they belong to the
 *     wrong ship) so the next sync/backfill rebuilds clean history
 *
 * Dry-run by default — pass --apply to write.
 *
 * Usage:
 *   node scripts/apply_gfw_rematch.mjs --csv=gfw_rematch_proposals.csv
 *   node scripts/apply_gfw_rematch.mjs --csv=... --tiers=CALLSIGN+NAME,CALLSIGN+FLAG --apply
 *   node scripts/apply_gfw_rematch.mjs --csv=... --clear-lost --apply
 *
 * Options:
 *   --tiers=A,B    match_basis tiers to apply (default: CALLSIGN+NAME)
 *   --clear-lost   also null vessel_id_gfw + delete port_calls for LOST rows
 *   --apply        actually write (otherwise prints what would happen)
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const csvPath = arg('csv')
const tiers = (arg('tiers') ?? 'CALLSIGN+NAME').split(',').map((t) => t.trim())
const clearLost = process.argv.includes('--clear-lost')
const apply = process.argv.includes('--apply')

if (!csvPath) { console.error('--csv=path required'); process.exit(1) }

function parseCsv(text) {
  const lines = text.trim().split('\n')
  const parseLine = (line) => {
    const cells = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ',') { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    return cells
  }
  const header = parseLine(lines[0])
  return lines.slice(1).map((l) => {
    const cells = parseLine(l)
    return Object.fromEntries(header.map((h, i) => [h, cells[i] === '' ? null : cells[i]]))
  })
}

async function main() {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'))

  const updates = rows.filter(
    (r) => ['CHANGED', 'NEW'].includes(r.status) && tiers.includes(r.match_basis)
  )
  const lost = clearLost ? rows.filter((r) => r.status === 'LOST') : []

  console.log(`${apply ? 'Applying' : 'DRY RUN —'} ${updates.length} identity updates (tiers: ${tiers.join(', ')})${clearLost ? ` + clearing ${lost.length} LOST mappings` : ''}\n`)

  let updated = 0
  let portCallsCleared = 0
  let errors = 0

  for (const r of updates) {
    const clearHistory = r.status === 'CHANGED'
    console.log(`  [${r.vessel_id}] ${r.name}: ${r.current_mmsi ?? '—'} → ${r.proposed_mmsi} (${r.match_basis}${clearHistory ? ', clearing old port calls' : ''})`)
    if (!apply) continue

    const { error: upError } = await supabase
      .from('vessels')
      .update({ mmsi: r.proposed_mmsi, vessel_id_gfw: r.proposed_gfw_id })
      .eq('id', parseInt(r.vessel_id, 10))
    if (upError) { console.error(`    update failed: ${upError.message}`); errors++; continue }
    updated++

    if (clearHistory) {
      const { error: delError, count } = await supabase
        .from('port_calls')
        .delete({ count: 'exact' })
        .eq('vessel_id', parseInt(r.vessel_id, 10))
      if (delError) { console.error(`    port_calls delete failed: ${delError.message}`); errors++ }
      else portCallsCleared += count ?? 0
    }
  }

  for (const r of lost) {
    console.log(`  [${r.vessel_id}] ${r.name}: clearing mapping (LOST — no GFW match found)`)
    if (!apply) continue
    const { error: upError } = await supabase
      .from('vessels')
      .update({ vessel_id_gfw: null })
      .eq('id', parseInt(r.vessel_id, 10))
    if (upError) { console.error(`    update failed: ${upError.message}`); errors++; continue }
    updated++
    const { error: delError, count } = await supabase
      .from('port_calls')
      .delete({ count: 'exact' })
      .eq('vessel_id', parseInt(r.vessel_id, 10))
    if (delError) { console.error(`    port_calls delete failed: ${delError.message}`); errors++ }
    else portCallsCleared += count ?? 0
  }

  if (apply) {
    console.log(`\nDone. ${updated} vessels updated, ${portCallsCleared} stale port calls removed, ${errors} errors.`)
    console.log('Next: node scripts/sync_gfw.mjs --backfill to rebuild history.')
  } else {
    console.log('\nDry run only — pass --apply to write.')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
