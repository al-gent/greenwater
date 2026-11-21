/**
 * GFW port visit sync — CLI wrapper around lib/gfw-sync-core.mjs.
 * Run daily by GitHub Actions (.github/workflows/gfw-sync.yml) or manually.
 *
 * Usage:
 *   node scripts/sync_gfw.mjs                    # incremental sync, all vessels
 *   node scripts/sync_gfw.mjs --limit=5          # test with first 5 vessels
 *   node scripts/sync_gfw.mjs --backfill         # full history, rewrites existing rows
 *   node scripts/sync_gfw.mjs --only=loitering   # one event stream: ports | loitering
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { syncGfw } from '../lib/gfw-sync-core.mjs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined
const backfill = process.argv.includes('--backfill')
const catchUp = process.argv.includes('--catch-up')
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const datasets = onlyArg ? [onlyArg.split('=')[1]] : undefined
const idsArg = process.argv.find((a) => a.startsWith('--ids='))
const ids = idsArg ? idsArg.split('=')[1].split(',').map((n) => parseInt(n, 10)).filter((n) => !isNaN(n)) : undefined

syncGfw(supabase, process.env.GLOBAL_FISHING_WATCH_API_KEY, { limit, backfill, catchUp, datasets, ids })
  .then((result) => {
    console.log('\nDone:')
    console.log(`  Vessels processed: ${result.vessels}`)
    console.log(`  Port calls written: ${result.newPortCalls}`)
    console.log(`  Loitering events written: ${result.newLoiteringEvents}`)
    console.log(`  Latest calls geocoded: ${result.geocoded}`)
    console.log(`  Name mismatches: ${result.nameMismatches.length}`)
    console.log(`  Errors: ${result.errors}`)
    if (result.missedStreams.length > 0) {
      const misses = result.missedStreams.map(({ vesselId, stream }) => `${vesselId}/${stream}`)
      const message = `Missed vessel feeds (vessel ID/stream): ${misses.join(', ')}`
      const annotation = result.status === 'warning' ? 'warning' : 'error'
      console.warn(process.env.GITHUB_ACTIONS === 'true' ? `::${annotation}::${message}` : `${annotation}: ${message}`)
    }
    if (result.status === 'failure') process.exitCode = 1
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
