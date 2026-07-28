import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerUser } from '@/lib/supabase-server'

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

  // Every real browser sends Accept-Language; scripted clients often don't.
  if (!request.headers.get('accept-language')) {
    return NextResponse.json({ ok: true })
  }

  // UA strings are trivially spoofed (the SG bot fleet rotates real Chrome UAs),
  // so also verify the headers the browser sets itself and scripts rarely fake.

  // The body UA comes from navigator.userAgent; a browser's own fetch() sends the
  // identical string in the User-Agent header. Direct API posts often only fake one.
  if (user_agent !== request.headers.get('user-agent')) {
    return NextResponse.json({ ok: true })
  }

  // Browsers always attach Origin to POSTs; PageViewTracker is same-origin only.
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  try {
    if (!origin || !host || new URL(origin).host !== host) {
      return NextResponse.json({ ok: true })
    }
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Sec-Fetch-Site is browser-controlled; when present it must be same-origin.
  const secFetchSite = request.headers.get('sec-fetch-site')
  if (secFetchSite && secFetchSite !== 'same-origin') {
    return NextResponse.json({ ok: true })
  }

  // A UA claiming desktop/Android Chrome must behave like Chrome:
  // Chrome ≥76 always sends Sec-Fetch-*, and ≥89 always sends Sec-CH-UA with the
  // REAL engine version — a headless Chrome 149 wearing a "Chrome/103" UA fails here.
  const chromeMajor = Number(user_agent.match(/Chrome\/(\d+)/)?.[1] ?? 0)
  if (chromeMajor >= 76 && !secFetchSite) {
    return NextResponse.json({ ok: true })
  }
  if (chromeMajor >= 89) {
    const secChUa = request.headers.get('sec-ch-ua') || ''
    const brandVersions = [...secChUa.matchAll(/v="(\d+)/g)].map((m) => Number(m[1]))
    if (/headless/i.test(secChUa) || !brandVersions.includes(chromeMajor)) {
      return NextResponse.json({ ok: true })
    }
  }

  const country = request.headers.get('x-vercel-ip-country') || null
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null

  // Segment by auth status: null = anonymous, else the profile role.
  // Analytics must never fail (or stall) a page view: errors and slow auth
  // both degrade to anonymous via the timeout race.
  let userRole: string | null = null
  try {
    userRole = await Promise.race([
      (async () => {
        const user = await getServerUser()
        if (!user) return null
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        return profile?.role ?? 'scientist'
      })(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ])
  } catch {
    /* anonymous */
  }

  const { error } = await supabaseAdmin.from('page_views').insert({
    site: 'app',
    path,
    referrer: referrer || null,
    user_agent: user_agent || null,
    country,
    visitor_hash: dailyVisitorHash(ip, user_agent || null),
    user_role: userRole,
  })

  if (error) console.error('[analytics/pageview]', error.message)

  return NextResponse.json({ ok: true })
}
