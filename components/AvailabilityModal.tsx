'use client'

/**
 * "Update availability" for one vessel: the operator's own calendar items (unavailable, in
 * transit, in the yard, booked privately…), listed and added here. Blocks are public on the
 * timeline so researchers see when the boat can't be had; the reason is whatever is typed.
 * Opened from the vessel page and from each listing on the dashboard.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtDateRange } from '@/lib/cruise-utils'

const KINDS = ['Unavailable', 'In transit', 'In the yard', 'Booked privately', 'Maintenance']
const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-transparent transition'

interface Block { id: string; label: string; notes: string | null; start_at: string; end_at: string }

export default function AvailabilityModal({ vesselId, vesselName, onClose }: { vesselId: number; vesselName: string; onClose: () => void }) {
  const router = useRouter()
  const tz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' } }, [])
  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [kind, setKind] = useState(KINDS[0])
  const [label, setLabel] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<{ text: string; conflicts?: { label: string; slug: string | null; start_at: string; end_at: string }[] } | null>(null)

  const load = async () => {
    const r = await fetch(`/api/timeline/blocks?vessel=${vesselId}`)
    setBlocks(r.ok ? (await r.json()).blocks : [])
  }
  useEffect(() => { load() }, [vesselId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(null)
    const text = label.trim() ? `${kind} · ${label.trim()}` : kind
    const r = await fetch('/api/timeline/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vessel_id: vesselId, label: text, notes: notes.trim() || null, start, end, tz }) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setError({ text: d.error ?? 'Could not save.', conflicts: d.conflicts }); return }
    setLabel(''); setNotes(''); setStart(''); setEnd('')
    await load(); router.refresh()
  }
  const remove = async (id: string) => {
    setRemoving(id); setError(null)
    const r = await fetch(`/api/timeline/blocks/${id}`, { method: 'DELETE' })
    setRemoving(null)
    if (!r.ok) { setError({ text: 'Could not remove.' }); return }
    await load(); router.refresh()
  }
  // stored end is exclusive; show the inclusive last day
  const shown = (b: Block) => fmtDateRange(b.start_at, new Date(new Date(b.end_at).getTime() - 86_400_000).toISOString())

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 pb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-navy">Update availability</h2>
            <p className="text-sm text-gray-500 mt-0.5">When is <span className="font-medium text-navy">{vesselName}</span> not available? Cruises are added through projects; this is everything else.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-navy transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 pb-5 overflow-y-auto space-y-5">
          <form onSubmit={add} className="space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">
                <p>{error.text}</p>
                {error.conflicts?.length ? <ul className="mt-1 text-xs space-y-0.5">{error.conflicts.map((c, i) => <li key={i}>{c.slug ? <a href={`/cruises/${c.slug}`} target="_blank" className="underline">{c.label}</a> : c.label}, {fmtDateRange(c.start_at, c.end_at)}</li>)}</ul> : null}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">What</label>
                <select className={input} value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Detail (optional)</label>
                <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Haul-out at Moss Landing" maxLength={100} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                <input type="date" className={input} value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value) }} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Through</label>
                <input type="date" className={input} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} required />
              </div>
            </div>
            <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for yourself or your co-operators (optional)" maxLength={500} />
            <button type="submit" disabled={saving || !start || !end} className="bg-navy text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-navy-600 disabled:opacity-60">{saving ? 'Adding…' : 'Add to schedule'}</button>
          </form>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 mb-2">On the schedule</h3>
            {blocks === null ? <p className="text-sm text-gray-400">Loading…</p> : blocks.length === 0 ? <p className="text-sm text-gray-400">Nothing yet. Anything you add shows on the timeline as unavailable.</p> : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {blocks.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy truncate">{b.label}</p>
                      <p className="text-xs text-gray-500">{shown(b)}{b.notes ? ` · ${b.notes}` : ''}</p>
                    </div>
                    <button onClick={() => remove(b.id)} disabled={removing === b.id} className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-60">{removing === b.id ? 'Removing…' : 'Remove'}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
