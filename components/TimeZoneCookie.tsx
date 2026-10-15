'use client'

// Tells the server which zone this browser is in, so pages can render times in it
// (lib/preferences.ts). Set once per year; on the very first visit the page was
// rendered in UTC, so refresh it now that the cookie exists.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function TimeZoneCookie() {
  const router = useRouter()
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (!tz) return
      const raw = document.cookie.split('; ').find((c) => c.startsWith('tz='))?.slice(3)
      const had = raw ? decodeURIComponent(raw) : undefined
      if (had === tz) return
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`
      if (!had) router.refresh()
    } catch { /* leave the server's default */ }
  }, [router])
  return null
}
