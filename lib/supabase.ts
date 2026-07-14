import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!

// cache: 'no-store' — Next.js's Data Cache captures GET fetches by default in
// server components/routes, which made pages render stale DB data (e.g. photo
// saves not appearing) until a revalidate. Caching is opt-in via unstable_cache
// (see getAllVessels), never implicit at the fetch layer.
export const supabase = createClient(url, key, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
})
