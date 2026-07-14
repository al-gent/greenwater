/**
 * GFW port visit sync — CLI wrapper around lib/gfw-sync-core.mjs.
 * Run weekly by GitHub Actions (.github/workflows/gfw-sync.yml) or manually.
 *
 * Usage:
 *   node scripts/sync_gfw.mjs                    # weekly sync, all vessels
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
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const datasets = onlyArg ? [onlyArg.split('=')[1]] : undefined

syncGfw(supabase, process.env.GLOBAL_FISHING_WATCH_API_KEY, { limit, backfill, datasets })
  .then((result) => {
    console.log('\nDone:')
    console.log(`  Vessels processed: ${result.vessels}`)
    console.log(`  Port calls written: ${result.newPortCalls}`)
    console.log(`  Loitering events written: ${result.newLoiteringEvents}`)
    console.log(`  Latest calls geocoded: ${result.geocoded}`)
    console.log(`  Name mismatches: ${result.nameMismatches.length}`)
    console.log(`  Errors: ${result.errors}`)
    if (result.errors > 0) process.exitCode = 1
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
