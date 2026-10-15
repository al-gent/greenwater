/**
 * Per-viewer display preferences, server side.
 * Resolution order: saved preference (signed in) → browser zone cookie (set by
 * components/TimeZoneCookie.tsx) → UTC.
 */
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from './supabase-server'
import { supabaseAdmin } from './supabase-admin'
import { isScale, type TimelineScale } from './timeline/scale'

export const TZ_COOKIE = 'tz'

export interface ViewerPreferences {
  timeZone: string
  timelineScale: TimelineScale | null
  source: 'saved' | 'browser' | 'default'
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

/** "America/Los_Angeles" → "Los Angeles (PDT)" for labels. */
export function timeZoneLabel(tz: string, at = new Date()): string {
  const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz
  try {
    const abbr = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value
    return abbr && abbr !== city ? `${city} (${abbr})` : city
  } catch { return city }
}

export async function getViewerPreferences(): Promise<ViewerPreferences> {
  const cookieTz = cookies().get(TZ_COOKIE)?.value
  const browser = isValidTimeZone(cookieTz) ? cookieTz : null
  try {
    const { data: { user } } = await createServerSupabaseClient().auth.getUser()
    if (user) {
      const { data } = await supabaseAdmin.from('profiles').select('preferences').eq('id', user.id).maybeSingle()
      const p = (data?.preferences ?? {}) as Record<string, unknown>
      const scale = isScale(p.timeline_scale) ? p.timeline_scale : null
      if (isValidTimeZone(p.time_zone)) return { timeZone: p.time_zone, timelineScale: scale, source: 'saved' }
      if (browser) return { timeZone: browser, timelineScale: scale, source: 'browser' }
      return { timeZone: 'UTC', timelineScale: scale, source: 'default' }
    }
  } catch { /* not signed in or auth unavailable: fall through */ }
  return browser ? { timeZone: browser, timelineScale: null, source: 'browser' } : { timeZone: 'UTC', timelineScale: null, source: 'default' }
}
