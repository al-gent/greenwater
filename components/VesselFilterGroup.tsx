'use client'

import { useState, type ReactNode } from 'react'

export default function VesselFilterGroup({ title, initiallyOpen = false, children }: {
  title: string
  initiallyOpen?: boolean
  children: ReactNode
}) {
  // Seed the disclosure from the incoming search, then let the user toggle it.
  const [openOnMount] = useState(initiallyOpen)
  return (
    <details open={openOnMount} className="group rounded-2xl border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-base font-semibold text-navy focus-visible:outline-teal [&::-webkit-details-marker]:hidden">
        {title}
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-gray-500 group-open:rotate-180">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="space-y-2.5 px-4 pb-4">{children}</div>
    </details>
  )
}
