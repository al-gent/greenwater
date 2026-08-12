import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(request: NextRequest) {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)

  const country = searchParams.get('country')
  if (!country || country.length > 20) {
    return NextResponse.json({ error: 'country required' }, { status: 400 })
  }

  const daysRaw = parseInt(searchParams.get('days') ?? '30')
  const days = isNaN(daysRaw) ? 30 : Math.min(365, Math.max(1, daysRaw))

  const siteRaw = searchParams.get('site') ?? 'app'
  const site = ['app', 'cms', 'both'].includes(siteRaw) ? siteRaw : 'app'

  const segmentRaw = searchParams.get('segment') ?? 'all'
  const segment = ['all', 'registered', 'anon'].includes(segmentRaw) ? segmentRaw : 'all'

  const { data, error } = await supabaseAdmin.rpc('get_country_pages', {
    p_country:       country,
    p_days_back:     days,
    p_site_filter:   site,
    p_exclude_bots:  searchParams.get('bots')  !== 'true',
    p_exclude_staff: searchParams.get('staff') !== 'true',
    p_segment:       segment,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
