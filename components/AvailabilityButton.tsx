'use client'

import { useState } from 'react'
import AvailabilityModal from '@/components/AvailabilityModal'

export default function AvailabilityButton({ vesselId, vesselName, className, children = 'Update availability' }: { vesselId: number; vesselName: string; className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? 'inline-flex items-center gap-1.5 border border-navy/20 text-navy text-xs font-medium px-3.5 py-2 rounded-xl hover:border-navy/40 hover:bg-navy-50 transition-colors'}>{children}</button>
      {open && <AvailabilityModal vesselId={vesselId} vesselName={vesselName} onClose={() => setOpen(false)} />}
    </>
  )
}
