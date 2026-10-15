'use client'

// Toolbar + viewport for one vessel's strip: Today, and a zoom (week / month / year density).
// The server passes the first span of rows; zooming re-mounts the viewport at a new density
// over the same dates, and scrolling loads more as usual.
import { useState } from 'react'
import CruiseTimeline from '@/components/CruiseTimeline'
import GotoDateButton from '@/components/timeline/GotoDateButton'
import type { VesselTimelineEntry } from '@/lib/cruises'
import type { TimelineResource } from '@/lib/timeline/types'

const ZOOM: { key: string; label: string; px: number }[] = [
  { key: 'week', label: 'Week', px: 48 },
  { key: 'month', label: 'Month', px: 12 },
  { key: 'year', label: 'Year', px: 4 },
]

export default function VesselStripClient({ vesselId, at, span, timeZone, today, initialRows, resources, highlightCruiseId }: {
  vesselId: number; at: string; span: { start: string; end: string }; timeZone: string; today: string
  initialRows: VesselTimelineEntry[]; resources: TimelineResource[]; highlightCruiseId?: string
}) {
  const [zoom, setZoom] = useState('month')
  const px = ZOOM.find((z) => z.key === zoom)!.px
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <GotoDateButton date={today} className="px-3 h-7 rounded-lg border border-gray-200 text-xs flex items-center text-gray-600 hover:text-navy hover:border-navy/30">Today</GotoDateButton>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="tablist" aria-label="Zoom">
          {ZOOM.map((z) => (
            <button key={z.key} type="button" role="tab" aria-selected={zoom === z.key} onClick={() => setZoom(z.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${zoom === z.key ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'}`}>{z.label}</button>
          ))}
        </div>
      </div>
      <CruiseTimeline
        key={`${vesselId}|${zoom}`}
        scale={zoom === 'week' ? 'week' : zoom === 'year' ? 'year' : 'month'} pxPerDay={px} density="compact"
        at={at} span={span} timeZone={timeZone} today={today}
        initialRows={initialRows} resources={resources}
        vesselId={vesselId} highlightCruiseId={highlightCruiseId}
      />
    </div>
  )
}
