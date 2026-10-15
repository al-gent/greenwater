'use client'

// Hover card for a bar on the fleet timeline: what the cruise is, when, where, and a link
// to the cruise page (where the operator can be messaged).
import Link from 'next/link'
import { STAGE_CLASS } from '@/lib/cruise-utils'
import type { TimelineEntry } from '@/lib/timeline/types'

export default function CruiseHoverCard({ entry }: { entry: TimelineEntry }) {
  const m = entry.meta ?? {}
  if (m.block) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-card-hover p-4">
        <p className="text-sm font-semibold text-navy">{m.label ?? 'Unavailable'}</p>
        <p className="text-xs text-gray-500 mt-0.5">{m.vesselName} · {m.dates}</p>
        {m.notes && <p className="text-xs text-gray-600 mt-2">{m.notes}</p>}
      </div>
    )
  }
  const stageCls = STAGE_CLASS[m.stage as keyof typeof STAGE_CLASS] ?? ''
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-card-hover p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-navy leading-snug">{m.title}{m.projects > 1 && <span className="ml-1.5 text-[11px] font-medium text-teal bg-teal/10 rounded-full px-1.5 py-px align-middle">+{m.projects - 1}</span>}</p>
        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${stageCls}`}>{m.stageLabel}</span>
      </div>
      <p className="text-xs text-gray-600 mt-1.5">{m.dates}</p>
      {m.area && <p className="text-xs text-gray-600">{m.area}</p>}
      <p className="text-xs text-gray-500 mt-1.5">{m.vesselName}{m.operator ? ` · ${m.operator}` : ''}</p>
      <div className="mt-3">
        <Link href={`/cruises/${m.slug}`} className="text-xs font-medium text-teal hover:underline">View cruise</Link>
      </div>
    </div>
  )
}
