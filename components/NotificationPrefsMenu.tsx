'use client'

import { useEffect, useRef, useState } from 'react'

const PREF_OPTIONS: { key: string; label: string }[] = [
  { key: 'new_claim', label: 'New vessel claims' },
  { key: 'new_submission', label: 'New listing requests' },
]

/** Bell dropdown for per-admin email notification toggles.
 *  Opt-out model: a missing key means subscribed. */
export default function NotificationPrefsMenu() {
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/notification-prefs')
      .then((r) => r.json())
      .then((data) => {
        setPrefs(data.prefs ?? {})
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const toggle = async (key: string) => {
    const next = prefs[key] === false // currently muted → resubscribe
    setSaving(key)
    setPrefs((p) => ({ ...p, [key]: next }))
    try {
      const res = await fetch('/api/notification-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch {
      setPrefs((p) => ({ ...p, [key]: !next })) // revert on failure
      alert('Failed to save notification preference')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Email notifications"
        className={`p-2 rounded-xl border transition-colors ${
          open ? 'border-navy text-navy bg-white' : 'border-gray-200 text-gray-500 hover:text-navy hover:border-gray-300 bg-white'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-lg border border-gray-100 p-4 z-20">
          <p className="text-sm font-semibold text-navy mb-3">Email me about</p>
          {!loaded ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <div className="space-y-2.5">
              {PREF_OPTIONS.map(({ key, label }) => {
                const enabled = prefs[key] !== false
                return (
                  <label key={key} className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="text-sm text-gray-700">{label}</span>
                    <button
                      role="switch"
                      aria-checked={enabled}
                      disabled={saving === key}
                      onClick={(e) => { e.preventDefault(); toggle(key) }}
                      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                        enabled ? 'bg-teal' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute left-0 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
