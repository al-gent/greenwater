'use client'

import { useState } from 'react'
import RequestModal from './RequestModal'

export default function RequestButton({ vesselName }: { vesselName: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-navy text-white py-4 rounded-2xl font-semibold text-base hover:bg-navy-600 transition-all hover:shadow-lg active:scale-[0.98]"
      >
        Connect with this Vessel
      </button>
      {open && <RequestModal vesselName={vesselName} onClose={() => setOpen(false)} />}
    </>
  )
}
