'use client'

// The operator's bids on the dashboard. An accepted bid is waiting on them: Confirm creates
// the cruise and puts it on the vessel's timeline.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MyBid } from '@/lib/projects'
import { bidState, BID_STATE_LABEL, BID_STATE_CLASS } from '@/lib/project-utils'
import { fmtDateRange } from '@/lib/cruise-utils'

export default function MyBids({ bids }: { bids: MyBid[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (b: MyBid, action: 'confirm' | 'withdraw') => {
    setBusy(b.id); setError(null)
    const res = await fetch(`/api/projects/${b.project_id}/bids/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(data.error ?? 'Could not update the bid.'); return }
    if (action === 'confirm' && data.cruise_slug) { router.push(`/cruises/${data.cruise_slug}`); return }
    router.refresh()
  }
  if (!bids.length) return null
  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold text-navy mb-3">Bids you&apos;ve made</h3>
      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-3">{error}</div>}
      <ul className="bg-white rounded-2xl shadow-card divide-y divide-gray-100 overflow-hidden">
        {bids.map((b) => {
          const state = bidState(b)
          return (
            <li key={b.id} className={`px-5 py-4 ${state === 'accepted' ? 'bg-gold-50/40' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy truncate">{b.project ? <Link href={`/projects/${b.project.slug}`} className="hover:text-teal">{b.project.title}</Link> : 'Project'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{b.vessel?.name} · {fmtDateRange(b.proposed_departure_at, b.proposed_arrival_at)}{b.berths != null && <> · {b.berths} berth{b.berths === 1 ? '' : 's'}</>}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${BID_STATE_CLASS[state]}`}>{BID_STATE_LABEL[state]}</span>
                {state === 'accepted' && (
                  <button disabled={busy === b.id} onClick={() => act(b, 'confirm')} className="px-4 py-2 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-600 disabled:opacity-60">{busy === b.id ? 'Scheduling…' : 'Confirm and schedule'}</button>
                )}
                {state === 'offered' && b.project && <Link href={`/projects/${b.project.slug}/bid`} className="text-sm font-medium text-teal hover:underline">Update</Link>}
                {(state === 'offered' || state === 'accepted') && <button disabled={busy === b.id} onClick={() => act(b, 'withdraw')} className="text-sm text-gray-400 hover:text-red-600">Withdraw</button>}
                {state === 'confirmed' && b.cruise_slug && <Link href={`/cruises/${b.cruise_slug}`} className="text-sm font-medium text-teal hover:underline">View cruise</Link>}
              </div>
              {state === 'accepted' && <p className="text-xs text-gray-600 mt-2">The researcher accepted this bid. Confirming creates the cruise on {b.vessel?.name ?? 'the vessel'} for these dates and puts it on your schedule.</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
