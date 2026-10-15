'use client'

// Add to / remove from my fleet. Signed-out visitors are sent to sign in and back.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const BASE = 'inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-xl border transition-colors'

export default function FleetButton({ vesselId, initial, signedIn, nextPath, compact = false }: { vesselId: number; initial: boolean; signedIn: boolean; nextPath: string; compact?: boolean }) {
  const router = useRouter()
  const [inFleet, setInFleet] = useState(initial)
  const [busy, setBusy] = useState(false)
  if (!signedIn) return <Link href={`/auth/signin?next=${encodeURIComponent(nextPath)}`} className={`${BASE} border-navy/20 text-navy hover:bg-navy-50`}>Add to my fleet</Link>
  const toggle = async () => {
    setBusy(true)
    const r = await fetch('/api/fleet', { method: inFleet ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vessel_id: vesselId }) })
    setBusy(false)
    if (r.ok) { setInFleet(!inFleet); router.refresh() }
  }
  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={inFleet}
      className={`${BASE} ${inFleet ? 'border-teal/40 bg-teal/5 text-teal hover:bg-teal/10' : 'border-navy/20 text-navy hover:bg-navy-50'} disabled:opacity-60`}>
      {inFleet ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" /></svg>
      )}
      {compact ? (inFleet ? 'In my fleet' : 'Add') : inFleet ? 'In my fleet' : 'Add to my fleet'}
    </button>
  )
}
