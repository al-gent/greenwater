/**
 * First-party capture of Google Ads click IDs.
 *
 * When someone clicks a search ad, Google appends ?gclid=... to the landing
 * URL (?wbraid= / ?gbraid= on some iOS traffic). Persisting it lets the
 * signup row record which ad click it came from — the basis for offline
 * conversion upload and "signups via ads" stats. Unlike gtag.js, this is our
 * own code on our own domain, so ad blockers don't interfere.
 *
 * Storage: localStorage, last click wins (matches Google's last-click
 * attribution), 90 days (Google's click-conversion upload window).
 */

const KEY = 'gwf_ad_click'
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export type AdClick = {
  gclid?: string
  wbraid?: string
  gbraid?: string
  ad_landing_at: string
}

export function captureAdClick() {
  if (typeof window === 'undefined') return
  try {
    const params = new URLSearchParams(window.location.search)
    const click: Record<string, string> = {}
    for (const k of ['gclid', 'wbraid', 'gbraid'] as const) {
      const v = params.get(k)
      if (v) click[k] = v
    }
    if (Object.keys(click).length === 0) return
    click.ad_landing_at = new Date().toISOString()
    window.localStorage.setItem(KEY, JSON.stringify(click))
  } catch {
    // Storage unavailable (private mode, blocked cookies) — best-effort only.
  }
}

/** The stored ad click, if any, while it's still inside the 90-day window. */
export function getAdClick(): AdClick | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const click = JSON.parse(raw) as AdClick
    if (!click.ad_landing_at || Date.now() - Date.parse(click.ad_landing_at) > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY)
      return null
    }
    return click
  } catch {
    return null
  }
}
