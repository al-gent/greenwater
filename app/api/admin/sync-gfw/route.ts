import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { syncGfw } from '@/lib/gfw-sync-core.mjs'

// Manual admin trigger for the GFW port visit sync. The weekly run lives in
// GitHub Actions (.github/workflows/gfw-sync.yml → scripts/sync_gfw.mjs),
// which has no execution time limit — this route is for ad-hoc capped runs.
export const maxDuration = 300

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cap the run so it fits inside the function timeout (each vessel costs a
  // GFW call + 300ms, plus ~1.4s per new port call geocoded).
  const limitParam = parseInt(new URL(request.url).searchParams.get('limit') ?? '', 10)
  const limit = Number.isNaN(limitParam) ? 25 : Math.min(limitParam, 100)

  try {
    const result = await syncGfw(supabaseAdmin, process.env.GLOBAL_FISHING_WATCH_API_KEY ?? '', { limit })
    return NextResponse.json(result)
  } catch (e) {
    console.error('GFW sync error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
