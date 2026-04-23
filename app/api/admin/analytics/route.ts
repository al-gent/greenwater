import { NextResponse } from 'next/server'
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

function parseOS(ua: string | null): string {
  if (!ua) return 'Unknown'
  if (/iPhone|iPad/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Other'
}

function aggregateTop(values: (string | null)[], limit = 10) {
  const counts: Record<string, number> = {}
  values.forEach(v => {
    const key = v || 'Unknown'
    counts[key] = (counts[key] ?? 0) + 1
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, views]) => ({ label, views }))
}

function referrerHost(ref: string | null): string | null {
  if (!ref) return null
  try { return new URL(ref).hostname || null } catch { return ref }
}

export async function GET() {
  const admin = await checkAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const { data: rows, error } = await supabaseAdmin
    .from('page_views')
    .select('site, path, referrer, user_agent, country, visitor_hash, created_at')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const views = rows ?? []

  const todayRows = views.filter(r => new Date(r.created_at) >= todayStart)
  const last7dRows = views.filter(r => new Date(r.created_at) >= sevenDaysAgo)

  function uniq(rows: typeof views) {
    return new Set(rows.map(r => r.visitor_hash).filter(Boolean)).size
  }

  const totals = {
    today: todayRows.length,
    last7d: last7dRows.length,
    last30d: views.length,
    todayBySite: {
      app: todayRows.filter(r => r.site === 'app').length,
      cms: todayRows.filter(r => r.site === 'cms').length,
    },
    last7dBySite: {
      app: last7dRows.filter(r => r.site === 'app').length,
      cms: last7dRows.filter(r => r.site === 'cms').length,
    },
    last30dBySite: {
      app: views.filter(r => r.site === 'app').length,
      cms: views.filter(r => r.site === 'cms').length,
    },
    uniqueToday: uniq(todayRows),
    uniqueLast7d: uniq(last7dRows),
    uniqueLast30d: uniq(views),
  }

  function topPages(site: string, limit = 10) {
    const counts: Record<string, number> = {}
    views.filter(r => r.site === site).forEach(r => {
      counts[r.path] = (counts[r.path] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([path, views]) => ({ path, views }))
  }

  const topPagesResult = {
    app: topPages('app'),
    cms: topPages('cms'),
  }

  const dailyMap: Record<string, { app: number; cms: number; hashes: Set<string> }> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    dailyMap[key] = { app: 0, cms: 0, hashes: new Set() }
  }
  views.forEach(r => {
    const key = r.created_at.slice(0, 10)
    if (dailyMap[key]) {
      dailyMap[key][r.site as 'app' | 'cms']++
      if (r.visitor_hash) dailyMap[key].hashes.add(r.visitor_hash)
    }
  })
  const daily = Object.entries(dailyMap).map(([date, counts]) => ({
    date,
    app: counts.app,
    cms: counts.cms,
    unique: counts.hashes.size,
  }))

  const countries = aggregateTop(views.map(r => r.country))
  const os = aggregateTop(views.map(r => parseOS(r.user_agent)))
  const referrers = aggregateTop(views.map(r => referrerHost(r.referrer)))

  return NextResponse.json({ totals, topPages: topPagesResult, daily, countries, os, referrers })
}
