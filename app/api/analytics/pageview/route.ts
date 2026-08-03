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

// The CMS site (greenwaterfoundation.org) posts here cross-origin; its rows
// get site='cms'. The site value is derived from the verified Origin — never
// from the request body — so a spoofed body can't cross-label rows.
const CMS_ORIGINS = new Set([
  'https://greenwaterfoundation.org',
  'https://www.greenwaterfoundation.org',
])

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

// Cross-origin JSON POSTs preflight; only the CMS origins get CORS approval.
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && CMS_ORIGINS.has(origin)) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
  }
  return new NextResponse(null, { status: 204 })
}

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

  // Browsers always attach Origin to POSTs. Same-origin → the app; a
  // CMS-allowlisted origin → the website; anything else is dropped. Resolved
  // first so every later rejection can still carry CORS headers (a CMS drop
  // should be silent, not a console CORS error).
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  let site: 'app' | 'cms'
  try {
    if (origin && host && new URL(origin).host === host) {
      site = 'app'
    } else if (origin && CMS_ORIGINS.has(origin)) {
      site = 'cms'
    } else {
      return NextResponse.json({ ok: true })
    }
  } catch {
    return NextResponse.json({ ok: true })
  }
  const ok = () =>
    NextResponse.json({ ok: true }, site === 'cms' ? { headers: corsHeaders(origin!) } : undefined)

  if (!user_agent || BOT_PATTERN.test(user_agent)) {
    return ok()
  }

  // Every real browser sends Accept-Language; scripted clients often don't.
  if (!request.headers.get('accept-language')) {
    return ok()
  }

  // UA strings are trivially spoofed (the SG bot fleet rotates real Chrome UAs),
  // so also verify the headers the browser sets itself and scripts rarely fake.

  // The body UA comes from navigator.userAgent; a browser's own fetch() sends the
  // identical string in the User-Agent header. Direct API posts often only fake one.
  if (user_agent !== request.headers.get('user-agent')) {
    return ok()
  }

  // Sec-Fetch-Site is browser-controlled; when present it must match how the
  // request actually travelled: same-origin from the app, cross-site from the CMS.
  const secFetchSite = request.headers.get('sec-fetch-site')
  if (secFetchSite && secFetchSite !== (site === 'cms' ? 'cross-site' : 'same-origin')) {
    return ok()
  }

  // A UA claiming desktop/Android Chrome must behave like Chrome:
  // Chrome ≥76 always sends Sec-Fetch-*, and ≥89 always sends Sec-CH-UA with the
  // REAL engine version — a headless Chrome 149 wearing a "Chrome/103" UA fails here.
  const chromeMajor = Number(user_agent.match(/Chrome\/(\d+)/)?.[1] ?? 0)
  if (chromeMajor >= 76 && !secFetchSite) {
    return ok()
  }
  if (chromeMajor >= 89) {
    const secChUa = request.headers.get('sec-ch-ua') || ''
    const brandVersions = [...secChUa.matchAll(/v="(\d+)/g)].map((m) => Number(m[1]))
    if (/headless/i.test(secChUa) || !brandVersions.includes(chromeMajor)) {
      return ok()
    }
  }

  const country = request.headers.get('x-vercel-ip-country') || null
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null

  // Segment by auth status: null = anonymous, else the profile role.
  // Analytics must never fail (or stall) a page view: errors and slow auth
  // both degrade to anonymous via the timeout race. CMS visitors are always
  // anonymous — auth cookies don't travel cross-origin, so skip the lookup.
  let userRole: string | null = null
  if (site === 'cms') {
    /* anonymous */
  } else try {
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

  // Team browsing is not traffic: admins polluted 40% of rows before this
  // (their whole sessions, incl. vessel pages, were purged 2026-08-03).
  if (userRole === 'admin') return ok()

  const { error } = await supabaseAdmin.from('page_views').insert({
    site,
    path,
    referrer: referrer || null,
    user_agent: user_agent || null,
    country,
    visitor_hash: dailyVisitorHash(ip, user_agent || null),
    user_role: userRole,
  })

  if (error) console.error('[analytics/pageview]', error.message)

  return ok()
}
