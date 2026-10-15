'use client'

// Display preferences on the dashboard profile tab: time zone (defaults to the
// browser's) and timeline scale. Saved to profiles.preferences via /api/preferences.
import { useEffect, useMemo, useState } from 'react'

const SCALES: { key: string; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
]

export default function PreferencesBox() {
  const browserTz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' } }, [])
  const zones = useMemo<string[]>(() => {
    try { return (Intl as any).supportedValuesOf('timeZone') } catch { return ['UTC', browserTz] }
  }, [browserTz])
  const [prefs, setPrefs] = useState<{ time_zone?: string; timeline_scale?: string }>({})
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    fetch('/api/preferences').then((r) => r.json()).then((d) => { setPrefs(d.preferences ?? {}); setLoaded(true) }).catch(() => setLoaded(true))
  }, [])

  const save = async (patch: Record<string, unknown>) => {
    setStatus('saving')
    const r = await fetch('/api/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    if (!r.ok) { setStatus('error'); return }
    const d = await r.json()
    setPrefs(d.preferences ?? {})
    setStatus('saved')
    setTimeout(() => setStatus('idle'), 1500)
  }

  const tz = prefs.time_zone ?? ''
  return (
    <div className="border-t border-gray-100 mt-6 pt-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-600">Time zone</p>
          <p className="text-xs text-gray-400">Times on schedules and the timeline show in this zone.</p>
        </div>
        <select
          value={tz}
          disabled={!loaded}
          onChange={(e) => save({ time_zone: e.target.value || null })}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-navy bg-white max-w-[220px]"
        >
          <option value="">Browser default ({browserTz.split('/').pop()?.replace(/_/g, ' ')})</option>
          {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-600">Default timeline view</p>
          <p className="text-xs text-gray-400">Which scale the timeline opens at.</p>
        </div>
        <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50">
          {SCALES.map((s) => {
            const active = (prefs.timeline_scale ?? 'year') === s.key
            return (
              <button key={s.key} type="button" disabled={!loaded} onClick={() => save({ timeline_scale: s.key })}
                className={`px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors ${active ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'}`}>
                {s.label}
              </button>
            )
          })}
        </div>
      </div>
      <p className="text-xs text-gray-400 h-4">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Could not save. Try again.' : ''}</p>
    </div>
  )
}
