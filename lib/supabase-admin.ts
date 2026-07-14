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
