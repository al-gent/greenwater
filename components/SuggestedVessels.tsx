'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { claimVessel } from '@/lib/dashboard-navigation'

export default function SuggestedVessels() {
  const [suggestedVessels, setSuggestedVessels] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/dashboard/suggested-vessels', { signal: controller.signal })
        if (response.ok) {
          const matches = await response.json()
          if (!controller.signal.aborted) setSuggestedVessels(matches)
        }
      } catch {
        // This optional prompt can be skipped if the member navigates away or is offline.
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  if (!suggestedVessels.length) return null
  return (
    <section className="mb-5 rounded-2xl bg-white p-6 shadow-card">
      <h2 className="text-lg font-bold text-navy">Do you operate {suggestedVessels.length === 1 ? 'this vessel' : 'one of these vessels'}?</h2>
      <p className="mt-1 text-sm text-gray-600">Your verified email is listed as a contact. If you help manage a vessel, you can claim its listing.</p>
      <ul className="mt-3 divide-y divide-gray-100">
        {suggestedVessels.map(vessel => (
          <li key={vessel.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Link href={`/vessels/${vessel.id}`} className="font-medium text-navy hover:underline">{vessel.name}</Link>
            <Link href={`${claimVessel.href}?vessel=${vessel.id}`} aria-label={`Claim ${vessel.name}`} className="text-sm font-semibold text-teal hover:underline">Claim this vessel</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
