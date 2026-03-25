import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { syncGfw } from '@/lib/gfw-sync'

// Called weekly by Vercel Cron (vercel.json) or manually by admin.
// Vercel Cron sends no auth — protected via CRON_SECRET header.
// Admins hitting this from the browser are authenticated via session.
export async function GET(request: Request) {
  // Allow Vercel Cron with secret header
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    // Authorized via cron secret
  } else {
    // Fall back to session-based admin check
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
  }

  try {
    const result = await syncGfw()
    return NextResponse.json(result)
  } catch (e) {
    console.error('GFW sync error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
