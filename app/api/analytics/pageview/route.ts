import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

function dailyVisitorHash(ip: string | null, ua: string | null): string {
  const date = new Date().toISOString().slice(0, 10)
  return createHash('sha256')
    .update(`gw-pv:${date}:${ip ?? ''}:${ua ?? ''}`)
    .digest('hex')
    .slice(0, 16)
}

const BOT_PATTERN = /bot|crawl|spider|slurp|scraper|curl|wget|python|java|ruby|perl|php|go-http|headlesschrome|phantomjs|selenium|puppeteer|playwright/i

export async function POST(request: NextRequest) {
  let body: { path?: string; referrer?: string | null; user_agent?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { path, referrer, user_agent } = body
  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: 'path required' }, { status: 400 })
  }

  if (!user_agent || BOT_PATTERN.test(user_agent)) {
    return NextResponse.json({ ok: true })
  }

  const country = request.headers.get('x-vercel-ip-country') || null
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null

  const { error } = await supabaseAdmin.from('page_views').insert({
    site: 'app',
    path,
    referrer: referrer || null,
    user_agent: user_agent || null,
    country,
    visitor_hash: dailyVisitorHash(ip, user_agent || null),
  })

  if (error) console.error('[analytics/pageview]', error.message)

  return NextResponse.json({ ok: true })
}
