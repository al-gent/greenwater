import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Never import in client components.
// cache: 'no-store' keeps Next's Data Cache from serving stale DB reads
// (see lib/supabase.ts for the full story).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  }
)

// Service-role client that identifies the human behind the request to the
// audit triggers (log_data_changes reads the x-audit-actor header; without
// it every app edit is logged as service_role and shown as "script").
// Use for writes to audited tables (vessels, profiles, vessel_claims,
// vessel_submissions) whenever a user session is present.
export function supabaseAdminAs(actor: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        headers: { 'x-audit-actor': actor.replace(/[^\x20-\x7e]/g, '?') },
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  )
}
