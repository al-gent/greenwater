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

  const cutoffDate = new Date(Date.now() - days * 86_400_000)

  const [analyticsResult, vesselsResult] = await Promise.all([
    supabaseAdmin.rpc('get_analytics_v2', {
      p_days_back:     days,
      p_site_filter:   site,
      p_exclude_bots:  excludeBots,
      p_exclude_staff: excludeStaff,
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

  // Strip same-property self-referrals. The SQL handles this correctly after the v2 SQL
  // is deployed; this mirrors the logic here as a safety net for the transition period.
  // Canonicalize app domains and strip same-property self-referrals.
  // vessels.greenwaterfoundation.org and vesselconnect.org are the same property;
  // the SQL normalizes both to 'vesselconnect.org' — this mirrors that for the
  // transition period before the updated SQL is deployed.
  if (Array.isArray(data?.referrers)) {
    type Row = { label: string; views: number; unique_visitors: number }
    const rows = data.referrers as Row[]

    // Merge vessels.greenwaterfoundation.org into vesselconnect.org
    const merged: Row[] = []
    for (const r of rows) {
      const label = r.label === 'vessels.greenwaterfoundation.org' ? 'vesselconnect.org' : r.label
      const existing = merged.find(e => e.label === label)
      if (existing) {
        existing.views += r.views
        existing.unique_visitors += r.unique_visitors
      } else {
        merged.push({ ...r, label })
      }
    }
    merged.sort((a, b) => b.views - a.views)

    // Strip self-referrals
    const appSelf = new Set(['vesselconnect.org'])
    const cmsSelf = new Set(['greenwaterfoundation.org'])
    data.referrers = merged.filter(r => {
      const h = r.label.toLowerCase()
      if ((site === 'app'  || site === 'both') && appSelf.has(h)) return false
      if ((site === 'cms'  || site === 'both') && cmsSelf.has(h)) return false
      return true
    })
  }

  // Resolve country codes to display names
  if (Array.isArray(data?.countries)) {
    data.countries = (data.countries as Array<{ label: string; unique_visitors: number }>).map(c => ({
      label: c.label === 'Unknown' ? 'Unknown' : countryCodeToName(c.label),
      unique_visitors: c.unique_visitors,
    }))
  }

  return NextResponse.json({
    ...data,
    vesselsCreated: vesselsResult.error ? 0 : (vesselsResult.count ?? 0),
  })
}
