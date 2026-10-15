'use client'

// Cruise-specific client wrapper: binds the generic TimelineViewport to the vessel
// entries API and adapter. Functions can't cross the server→client boundary, so they
// live here and the page passes only data.
import TimelineViewport from '@/components/timeline/TimelineViewport'
import { useCallback } from 'react'
import type { TimelineEntry } from '@/lib/timeline/types'
import CruiseHoverCard from '@/components/CruiseHoverCard'
import { vesselEntriesToTimeline, CRUISE_PALETTE } from '@/lib/cruise-timeline'
import type { VesselTimelineEntry } from '@/lib/cruises'
import type { TimelineResource } from '@/lib/timeline/types'
import type { TimelineScale } from '@/lib/timeline/scale'

interface Props {
  scale: TimelineScale
  at: string
  span: { start: string; end: string }
  timeZone: string
  today: string
  initialRows: VesselTimelineEntry[]
  resources: TimelineResource[]
  emptyRowText?: string
  density?: 'compact' | 'comfortable' | 'spacious'
  vesselId?: number               // only this vessel's entries
  highlightCruiseId?: string      // drawn in gold
  pxPerDay?: number
}

const HIGHLIGHT_PALETTE = { ...CRUISE_PALETTE, current: 'bg-gold text-navy-800 ring-2 ring-gold-500/60' }

export default function CruiseTimeline({ vesselId, highlightCruiseId, ...props }: Props) {
  const fetchUrl = useCallback((from: string, to: string) => `/api/timeline/vessels?from=${from}&to=${to}${vesselId ? `&vessel=${vesselId}` : ''}`, [vesselId])
  const toTimeline = useCallback((rows: VesselTimelineEntry[], fixed: TimelineResource[]) => {
    const out = vesselEntriesToTimeline(rows, fixed)
    if (highlightCruiseId) for (const e of out.entries as TimelineEntry[]) if (e.meta?.cruiseId === highlightCruiseId) e.status = 'current'
    return out
  }, [highlightCruiseId])
  return (
    <TimelineViewport<VesselTimelineEntry>
      {...props}
      toTimeline={toTimeline}
      fetchUrl={fetchUrl}
      palette={HIGHLIGHT_PALETTE}
      renderCard={(entry) => <CruiseHoverCard entry={entry} />}
    />
  )
}
