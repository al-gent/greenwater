'use client'

/**
 * An operator's bid on a project: which vessel, when, how many berths, what it costs, and
 * which of the requested gear lines they can provide or support. Dates are entered in the
 * browser's zone and sent as instants with that zone recorded. A live check against the
 * vessel's timeline says what is already in the way.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Project, ProjectGearLine, ProjectBid } from '@/lib/project-utils'

const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition'
const label = 'block text-xs font-medium text-gray-500 mb-1'

export interface BidVessel { id: number; name: string; scientists: number | null; daily_rate: number | null; daily_rate_currency: string | null }
type Answer = 'none' | 'provide' | 'support'

// Dates only. A date is midnight in the browser's zone, sent as an instant with the zone recorded.
const toLocal = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const toIso = (date: string) => (date ? new Date(`${date}T00:00:00`).toISOString() : '')
const addDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + n); const p = (x: number) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }

export default function BidForm({ project, gear, vessels, bid }: { project: Project; gear: ProjectGearLine[]; vessels: BidVessel[]; bid: ProjectBid | null }) {
  const router = useRouter()
  const tz = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' } }, [])
  const [vesselId, setVesselId] = useState<number>(bid?.vessel_id ?? vessels[0]?.id ?? 0)
  const vessel = vessels.find((v) => v.id === vesselId) ?? null
  const askedDays = project.requested_science_days != null ? Math.ceil(project.requested_science_days) : null
  const [departure, setDeparture] = useState(bid ? toLocal(bid.proposed_departure_at) : project.requested_start_earliest ?? '')
  const [arrival, setArrival] = useState(bid ? toLocal(bid.proposed_arrival_at) : project.requested_start_earliest && askedDays ? addDays(project.requested_start_earliest, askedDays) : '')
  const [endTouched, setEndTouched] = useState(!!bid)
  // Moving the start keeps the length the researcher asked for until the end is set by hand.
  const setStart = (d: string) => { setDeparture(d); if (!endTouched && d && askedDays) setArrival(addDays(d, askedDays)) }
  const [berths, setBerths] = useState(bid?.berths != null ? String(bid.berths) : vessel?.scientists != null ? String(vessel.scientists) : '')
  const [cost, setCost] = useState(bid?.cost_amount != null ? String(bid.cost_amount) : '')
  const [currency, setCurrency] = useState(bid?.cost_currency ?? vessel?.daily_rate_currency ?? 'USD')
  const [notes, setNotes] = useState(bid?.notes ?? '')
  const [answers, setAnswers] = useState<Record<string, { answer: Answer; notes: string }>>(() => {
    const m: Record<string, { answer: Answer; notes: string }> = {}
    for (const g of gear) { const a = bid?.gear.find((x) => x.project_gear_id === g.id); m[g.id!] = { answer: a?.answer ?? 'none', notes: a?.notes ?? '' } }
    return m
  })
  const [conflicts, setConflicts] = useState<{ id: string; label: string; start_at: string; end_at: string; slug: string | null; kind: string }[] | null>(null)
  const [saving, setSaving] = useState<'save' | 'withdraw' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const days = departure && arrival ? Math.max(0, (new Date(arrival).getTime() - new Date(departure).getTime()) / 86_400_000) : 0
  const suggested = vessel?.daily_rate != null && days > 0 ? Math.round(vessel.daily_rate * Math.ceil(days)) : null

  // Live availability: what is on this vessel's timeline in the proposed window.
  useEffect(() => {
    if (!vesselId || !departure || !arrival || new Date(arrival) <= new Date(departure)) { setConflicts(null); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/timeline/conflicts?vessel=${vesselId}&start=${encodeURIComponent(toIso(departure))}&end=${encodeURIComponent(toIso(arrival))}`, { signal: ctrl.signal })
        if (r.ok) setConflicts((await r.json()).conflicts ?? [])
      } catch { /* typing */ }
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [vesselId, departure, arrival])

  const save = async () => {
    if (!vesselId) { setError('Pick a vessel.'); return }
    if (!departure || !arrival) { setError('Give a start and an end date.'); return }
    if (new Date(arrival) <= new Date(departure)) { setError('The end must be after the start.'); return }
    setSaving('save'); setError(null)
    const body = {
      action: bid ? 'update' : undefined,
      vessel_id: vesselId,
      proposed_departure_at: toIso(departure), proposed_arrival_at: toIso(arrival), tz,
      berths: berths.trim() === '' ? null : Number(berths),
      cost_amount: cost.trim() === '' ? null : Number(cost),
      cost_currency: currency || null,
      notes: notes.trim() || null,
      gear: Object.entries(answers).filter(([, a]) => a.answer !== 'none').map(([id, a]) => ({ project_gear_id: id, answer: a.answer, notes: a.notes.trim() || null })),
    }
    const res = await fetch(bid ? `/api/projects/${project.id}/bids/${bid.id}` : `/api/projects/${project.id}/bids`, { method: bid ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    setSaving(null)
    if (!res.ok) { setError(data.error ?? 'Could not save the bid.'); return }
    router.push(`/projects/${project.slug}`); router.refresh()
  }
  const withdraw = async () => {
    if (!bid) return
    setSaving('withdraw'); setError(null)
    const res = await fetch(`/api/projects/${project.id}/bids/${bid.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'withdraw' }) })
    const data = await res.json().catch(() => ({}))
    setSaving(null)
    if (!res.ok) { setError(data.error ?? 'Could not withdraw.'); return }
    router.push(`/projects/${project.slug}`); router.refresh()
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="space-y-8">
      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}

      <section className="space-y-4">
        <div>
          <label className={label}>Vessel</label>
          <select className={input} value={vesselId} disabled={!!bid} onChange={(e) => { const v = vessels.find((x) => x.id === Number(e.target.value)); setVesselId(Number(e.target.value)); if (v?.scientists != null && !berths) setBerths(String(v.scientists)); if (v?.daily_rate_currency) setCurrency(v.daily_rate_currency) }}>
            {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          {bid && <p className="text-xs text-gray-400 mt-1">The vessel is fixed once a bid is offered. Withdraw and bid again to offer a different one.</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Start</label>
            <input type="date" className={input} value={departure} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div>
            <label className={label}>End</label>
            <input type="date" className={input} value={arrival} min={departure || undefined} onChange={(e) => { setEndTouched(true); setArrival(e.target.value) }} required />
          </div>
        </div>
        {days > 0 && <p className="text-xs text-gray-400">{days} day{days === 1 ? '' : 's'}.</p>}
        {(project.requested_start_earliest || project.requested_start_latest || project.requested_science_days != null) && (
          <p className="text-xs text-gray-500">
            The researcher asked for a start{' '}
            {project.requested_start_earliest && project.requested_start_latest
              ? <>anywhere from <span className="font-medium text-navy">{project.requested_start_earliest}</span> to <span className="font-medium text-navy">{project.requested_start_latest}</span></>
              : project.requested_start_earliest ? <>on or after <span className="font-medium text-navy">{project.requested_start_earliest}</span></>
              : project.requested_start_latest ? <>by <span className="font-medium text-navy">{project.requested_start_latest}</span></> : <>on flexible dates</>}
            {project.requested_science_days != null && <>, with {project.requested_science_days} science day{project.requested_science_days === 1 ? '' : 's'}</>}.
            {project.dates_notes && <> {project.dates_notes}</>}
          </p>
        )}
        {conflicts && conflicts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">{vessel?.name ?? 'This vessel'} already has something in that window:</p>
            <ul className="mt-1 space-y-0.5">
              {conflicts.map((c) => <li key={c.id}>{c.slug ? <Link href={`/cruises/${c.slug}`} className="underline" target="_blank">{c.label}</Link> : c.label}, {new Date(c.start_at).toLocaleDateString()} – {new Date(c.end_at).toLocaleDateString()}</li>)}
            </ul>
            <p className="mt-1 text-xs">You can still bid; confirming later will need the dates to be clear.</p>
          </div>
        )}
        {conflicts && conflicts.length === 0 && <p className="text-xs text-teal">{vessel?.name ?? 'The vessel'} is free in that window.</p>}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={label}>Science berths offered</label>
          <input type="number" min={0} max={500} className={input} value={berths} onChange={(e) => setBerths(e.target.value)} placeholder={project.party_size != null ? `Project asked for ${project.party_size}` : ''} />
        </div>
        <div>
          <label className={label}>Cost</label>
          <input type="number" min={0} step={1} className={input} value={cost} onChange={(e) => setCost(e.target.value)} placeholder={suggested != null ? `${suggested.toLocaleString()} at the day rate` : 'Total for the cruise'} />
          {suggested != null && !cost && <button type="button" onClick={() => setCost(String(suggested))} className="text-xs text-teal hover:underline mt-1">Use {suggested.toLocaleString()} ({Math.ceil(days)} days at the day rate)</button>}
        </div>
        <div>
          <label className={label}>Currency</label>
          <input className={input} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} maxLength={3} placeholder="USD" />
        </div>
      </section>

      {gear.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-navy mb-1">Gear they asked for</h2>
          <p className="text-xs text-gray-400 mb-3">For each line: you provide it, they bring it and your vessel can support it, or leave it blank if you can&apos;t.</p>
          <div className="space-y-2">
            {gear.map((g) => {
              const a = answers[g.id!]
              return (
                <div key={g.id} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center rounded-xl border border-gray-100 px-3 py-2">
                  <p className="text-sm font-medium text-navy">{g.label}{g.quantity && g.quantity > 1 ? ` ×${g.quantity}` : ''}{g.notes && <span className="block text-xs text-gray-500 font-normal">{g.notes}</span>}</p>
                  <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50 text-xs">
                    {([['none', 'Can’t'], ['provide', 'We provide'], ['support', 'Bring your own']] as [Answer, string][]).map(([k, lbl]) => (
                      <button key={k} type="button" onClick={() => setAnswers((m) => ({ ...m, [g.id!]: { ...m[g.id!], answer: k } }))}
                        className={`px-2.5 py-1.5 rounded-[10px] font-medium transition-colors ${a.answer === k ? (k === 'provide' ? 'bg-teal text-white' : k === 'support' ? 'bg-gold-100 text-gold-700' : 'bg-white text-gray-600 shadow-sm') : 'text-gray-500 hover:text-navy'}`}>{lbl}</button>
                    ))}
                  </div>
                  <input className={`${input} text-xs`} value={a.notes} onChange={(e) => setAnswers((m) => ({ ...m, [g.id!]: { ...m[g.id!], notes: e.target.value } }))} placeholder={a.answer === 'none' ? '' : 'Note (optional)'} disabled={a.answer === 'none'} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <label className={label}>Notes to the researcher</label>
        <textarea className={`${input} resize-y`} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything about the vessel, the dates, what's included in the cost, or what you'd need from them." />
      </section>

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
        <button type="submit" disabled={!!saving} className="px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-600 disabled:opacity-60">{saving === 'save' ? 'Saving…' : bid ? 'Update bid' : 'Offer this bid'}</button>
        <Link href={`/projects/${project.slug}`} className="text-sm text-gray-500 hover:text-navy">Cancel</Link>
        {bid && <button type="button" disabled={!!saving} onClick={withdraw} className="ml-auto text-sm text-gray-500 hover:text-red-600">{saving === 'withdraw' ? 'Withdrawing…' : 'Withdraw bid'}</button>}
      </div>
    </form>
  )
}
