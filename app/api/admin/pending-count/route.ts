import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function checkAdmin() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin === true ? user : null
}

// Total items awaiting admin review — drives the badge on the navbar Admin link.
export async function GET() {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [subs, claims, scientists] = await Promise.all([
    supabaseAdmin.from('vessel_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('vessel_claims').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_admin', false).eq('verified', false),
  ])

  const submissions = subs.count ?? 0
  const pendingClaims = claims.count ?? 0
  const unverified = scientists.count ?? 0

  return NextResponse.json({
    count: submissions + pendingClaims + unverified,
    submissions,
    claims: pendingClaims,
    scientists: unverified,
  })
}
