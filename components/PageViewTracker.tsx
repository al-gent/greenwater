'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

export default function PageViewTracker() {
  const pathname = usePathname()
  const lastTracked = useRef<string | null>(null)

  useEffect(() => {
    if (lastTracked.current === pathname) return
    lastTracked.current = pathname
    // Automated browsers (Puppeteer/Playwright/Selenium) self-identify here.
    // They execute JS, so the server-side UA regex alone never sees them.
    if (typeof navigator !== 'undefined' && navigator.webdriver) return
    // Local dev writes to the production DB — never record it.
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return
    // Internal admin surfaces are team activity, not site traffic.
    if (pathname.startsWith('/admin')) return
    fetch('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent || null,
      }),
    }).catch(() => {})
  }, [pathname])

  return null
}
