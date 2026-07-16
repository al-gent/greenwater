import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function checkAdmin() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function countryCodeToName(code: string): string {
  try { return regionNames.of(code) ?? code } catch { return code }
}

export async function GET(request: NextRequest) {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)

  const daysRaw = parseInt(searchParams.get('days') ?? '30')
  const days = isNaN(daysRaw) ? 30 : Math.min(365, Math.max(1, daysRaw))

  const siteRaw = searchParams.get('site') ?? 'app'
  const site = ['app', 'cms', 'both'].includes(siteRaw) ? siteRaw : 'app'

  // Query param 'bots=true' means include bots → p_exclude_bots = false
  const excludeBots  = searchParams.get('bots')  !== 'true'
  const excludeStaff = searchParams.get('staff') !== 'true'

  const segmentRaw = searchParams.get('segment') ?? 'all'
  const segment = ['all', 'registered', 'anon'].includes(segmentRaw) ? segmentRaw : 'all'

  const cutoffDate = new Date(Date.now() - days * 86_400_000)

  const [analyticsResult, vesselsResult] = await Promise.all([
    supabaseAdmin.rpc('get_analytics_v2', {
      p_days_back:     days,
      p_site_filter:   site,
      p_exclude_bots:  excludeBots,
      p_exclude_staff: excludeStaff,
      p_segment:       segment,
    }),
    // vessels.created_at may not exist on all deployments — fall back to 0 on error
    supabaseAdmin
      .from('vessels')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', cutoffDate.toISOString())
      .neq('status', 'deleted'),
  ])

  if (analyticsResult.error) {
    return NextResponse.json({ error: analyticsResult.error.message }, { status: 500 })
  }

  const data = analyticsResult.data as Record<string, unknown>

  // Resolve country codes to display names; keep the code — the UI sends it
  // back for the per-country pages drill-down.
  if (Array.isArray(data?.countries)) {
    data.countries = (data.countries as Array<{ label: string; unique_visitors: number }>).map(c => ({
      label: c.label === 'Unknown' ? 'Unknown' : countryCodeToName(c.label),
      code: c.label,
      unique_visitors: c.unique_visitors,
    }))
  }

  return NextResponse.json({
    ...data,
    vesselsCreated: vesselsResult.error ? 0 : (vesselsResult.count ?? 0),
  })
}
