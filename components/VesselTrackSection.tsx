'use client'

/**
 * Location section of the vessel detail page: time-window chips + date-range
 * readout above the map, then the map itself with the vessel's track for the
 * selected window (port calls + at-sea work periods from GFW).
 *
 * The initial window is server-loaded and passed in; other windows are
 * fetched from /api/vessels/[id]/track on demand and cached per preset.
 */

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { TrackWindow } from '@/lib/track'
import type { TrackPoint } from '@/components/VesselMap'
import { toTitleCase } from '@/lib/vessel-utils'

const VesselMap = dynamic(() => import('@/components/VesselMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full bg-gray-100 flex items-center justify-center rounded-xl" style={{ height: 320 }}>
      <span className="text-sm text-gray-400">Loading map…</span>
    </div>
  ),
})

const PRESETS: { label: string; days: number | null }[] = [
  { label: '3 months', days: 90 },
  { label: 'Year', days: 365 },
  { label: '5 years', days: 1825 },
  { label: 'All time', days: null },
]

interface LatLng { lat: number; lng: number }

interface Props {
  vesselId: number
  vesselName: string
  homePort: LatLng | null
  lastPort: (LatLng & { name?: string | null; date?: string | null }) | null
  operatingArea: GeoJSON.FeatureCollection | null
  initialDays: number | null
  initialWindow: TrackWindow
}

const fmtStay = (h: number) => (h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`)
const fmtMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

export default function VesselTrackSection({
  vesselId, vesselName, homePort, lastPort, operatingArea, initialDays, initialWindow,
}: Props) {
  const [days, setDays] = useState<number | null>(initialDays)
  const [cache, setCache] = useState<Record<string, TrackWindow>>({ [String(initialDays)]: initialWindow })
  const [loading, setLoading] = useState(false)

  const window = cache[String(days)]

  // The gold "last port call" marker only belongs on the map when that call
  // falls inside the selected window.
  const lastPortInWindow = !!lastPort && (
    days === null ||
    (!!lastPort.date && Date.now() - new Date(lastPort.date).getTime() <= days * 86400000)
  )

  const pick = async (nextDays: number | null) => {
    setDays(nextDays)
    if (cache[String(nextDays)]) return
    setLoading(true)
    try {
      const res = await fetch(`/api/vessels/${vesselId}/track${nextDays ? `?days=${nextDays}` : ''}`)
      if (res.ok) {
        const data: TrackWindow = await res.json()
        setCache((c) => ({ ...c, [String(nextDays)]: data }))
      }
    } finally {
      setLoading(false)
    }
  }

  const trackPoints: TrackPoint[] = useMemo(() => {
    const events = window?.events ?? []
    const latestPortDate = [...events].reverse().find((e) => e.kind === 'port')?.date
    return events.map((e) => ({
      lat: e.lat,
      lng: e.lng,
      kind: e.kind,
      date: e.date,
      name: e.kind === 'port'
        ? (e.name ? toTitleCase(e.name) : 'Port call')
        : `At sea${e.hrs ? ` — ${fmtStay(e.hrs)}` : ''}`,
      // the newest port call is covered by the gold lastPort marker
      isLatest: lastPortInWindow && e.kind === 'port' && e.date === latestPortDate,
    }))
  }, [window, lastPortInWindow])

  const events = window?.events ?? []
  const ports = events.filter((e) => e.kind === 'port').length
  const sea = events.length - ports
  const rangeLabel = events.length > 0
    ? `${fmtMonth(events[0].date)} – ${fmtMonth(events[events.length - 1].date)}`
    : null

  return (
    <div>
      <VesselMap
        vesselName={vesselName}
        homePort={homePort}
        lastPort={lastPortInWindow ? lastPort : null}
        portCalls={trackPoints}
        operatingArea={operatingArea}
        height={320}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 mt-2">
        <p className="text-xs text-gray-400 min-h-[1rem]">
          {loading ? 'Loading…'
            : events.length === 0 ? 'No tracked activity in this period'
            : <>
                {rangeLabel} · {ports} port call{ports === 1 ? '' : 's'}
                {sea > 0 && <> · {sea} at-sea period{sea === 1 ? '' : 's'}</>}
                {window?.condensed && <> · showing {events.length} of {window.totalInWindow} events</>}
              </>}
        </p>
        <div className="flex items-center gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => pick(p.days)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                days === p.days
                  ? 'bg-navy text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
