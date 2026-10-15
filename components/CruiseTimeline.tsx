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
  vesselIds?: number[]            // only these vessels (homepage search); rows sorted by name
  boxClass?: string
}

const HIGHLIGHT_PALETTE = { ...CRUISE_PALETTE, current: 'bg-gold text-navy-800 ring-2 ring-gold-500/60' }

export default function CruiseTimeline({ vesselId, highlightCruiseId, vesselIds, ...props }: Props) {
  const idKey = vesselIds ? vesselIds.join(',') : ''
  const fetchUrl = useCallback((from: string, to: string) => {
    const narrow = vesselIds && vesselIds.length <= 100 ? `&vessels=${idKey}` : ''
    return `/api/timeline/vessels?from=${from}&to=${to}${vesselId ? `&vessel=${vesselId}` : ''}${narrow}`
  }, [vesselId, idKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const toTimeline = useCallback((rows: VesselTimelineEntry[], fixed: TimelineResource[]) => {
    const keep = vesselIds ? new Set(vesselIds) : null
    const out = vesselEntriesToTimeline(keep ? rows.filter((r) => keep.has(r.vessel_id)) : rows, fixed)
    if (keep) out.resources.sort((a, b) => a.label.localeCompare(b.label))
    if (highlightCruiseId) for (const e of out.entries as TimelineEntry[]) if (e.meta?.cruiseId === highlightCruiseId) e.status = 'current'
    return out
  }, [highlightCruiseId, idKey]) // eslint-disable-line react-hooks/exhaustive-deps
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
