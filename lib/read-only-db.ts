import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

async function createReadOnlyDb() {
  const url = process.env.SUPABASE_DB_URL
  if (!url) throw new Error('Missing SUPABASE_DB_URL')
  const host = new URL(url).hostname
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host)
  // Hosted Supabase uses its own CA. Keep certificate and hostname verification enabled.
  const ssl = local ? false : { ca: await readFile(path.join(process.cwd(), 'lib/certs/supabase-root-2021.crt'), 'utf8') }
  return postgres(url, {
    ssl, max: 2, idle_timeout: 30, max_lifetime: 600, prepare: false, connect_timeout: 5,
    connection: { statement_timeout: 5000, default_transaction_read_only: true },
  })
}

// Reuse the pool across requests and development reloads. Idle connections close automatically.
const server = globalThis as typeof globalThis & {
  vesselConnectReadPool?: ReturnType<typeof createReadOnlyDb>
}

export function getReadOnlyDb() {
  return server.vesselConnectReadPool ??= createReadOnlyDb().catch(error => {
    delete server.vesselConnectReadPool
    throw error
  })
}
