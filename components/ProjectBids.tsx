'use client'

// Bids on a project. The author sees all of them with Accept / Decline; an operator sees
// the ones on their vessels. Gear answers are shown against the project's requests.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { bidState, BID_STATE_LABEL, BID_STATE_CLASS, type ProjectBid, type ProjectGearLine } from '@/lib/project-utils'
import { fmtDateRange } from '@/lib/cruise-utils'

const money = (amount: number | null, currency: string | null) => amount == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(amount)

export default function ProjectBids({ projectId, bids, gear, canDecide }: { projectId: string; bids: ProjectBid[]; gear: ProjectGearLine[]; canDecide: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (bidId: string, action: 'accept' | 'decline') => {
    setBusy(bidId); setError(null)
    const res = await fetch(`/api/projects/${projectId}/bids/${bidId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(data.error ?? 'Could not update the bid.'); return }
    router.refresh()
  }
  if (!bids.length) return <p className="text-sm text-gray-400">No bids yet.</p>
  return (
    <div className="space-y-3">
      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}
      {bids.map((b) => {
        const state = bidState(b)
        const covered = new Map(b.gear.map((g) => [g.project_gear_id, g]))
        return (
          <div key={b.id} className={`rounded-2xl border p-4 ${state === 'accepted' || state === 'confirmed' ? 'border-teal/40 bg-teal/5' : 'border-gray-100'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-navy">{b.vessel ? <Link href={`/vessels/${b.vessel.id}`} className="hover:text-teal">{b.vessel.name}</Link> : 'Vessel'}{b.vessel?.operator_name && <span className="font-normal text-gray-500"> · {b.vessel.operator_name}</span>}</p>
                <p className="text-sm text-gray-700 mt-0.5">{fmtDateRange(b.proposed_departure_at, b.proposed_arrival_at)}{b.berths != null && <> · {b.berths} berth{b.berths === 1 ? '' : 's'}</>}{money(b.cost_amount, b.cost_currency) && <> · {money(b.cost_amount, b.cost_currency)}</>}</p>
              </div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${BID_STATE_CLASS[state]}`}>{BID_STATE_LABEL[state]}</span>
            </div>
            {gear.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {gear.map((g) => {
                  const a = covered.get(g.id!)
                  const cls = a?.answer === 'provide' ? 'bg-teal/10 text-teal border-teal/30' : a?.answer === 'support' ? 'bg-gold-50 text-gold-700 border-gold-200' : 'bg-gray-50 text-gray-400 border-gray-200 line-through'
                  const hint = a?.answer === 'provide' ? 'Provided aboard' : a?.answer === 'support' ? 'Bring your own; the vessel can support it' : 'Not supported'
                  return <li key={g.id} title={a?.notes ? `${hint} · ${a.notes}` : hint} className={`text-xs border rounded-full px-2.5 py-1 ${cls}`}>{g.label}</li>
                })}
              </ul>
            )}
            {b.notes && <p className="text-sm text-gray-600 mt-3 whitespace-pre-line">{b.notes}</p>}
            {b.cruise_id && <p className="text-sm mt-3"><Link href={`/cruises/${b.cruise_id}`} className="text-teal font-medium hover:underline">View the cruise →</Link></p>}
            {canDecide && state === 'offered' && (
              <div className="flex items-center gap-2 mt-3">
                <button disabled={busy === b.id} onClick={() => act(b.id, 'accept')} className="px-4 py-2 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-600 disabled:opacity-60">{busy === b.id ? 'Working…' : 'Accept this bid'}</button>
                <button disabled={busy === b.id} onClick={() => act(b.id, 'decline')} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:text-navy hover:border-navy/30 disabled:opacity-60">Decline</button>
              </div>
            )}
            {canDecide && state === 'accepted' && <p className="text-xs text-gray-500 mt-3">Accepted. Waiting for the operator to confirm and schedule the cruise.</p>}
          </div>
        )
      })}
    </div>
  )
}
