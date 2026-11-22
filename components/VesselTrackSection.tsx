'use client'

/**
 * Vessel track for the selected time window, with the latest recorded port call
 * shown below the map.
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
  lastPort: { position: LatLng | null; name: string; date: string | null } | null
  operatingArea: GeoJSON.FeatureCollection | null
  initialDays: number | null
  initialWindow: TrackWindow
}

const fmtStay = (h: number) => (h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`)
const portDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default function VesselTrackSection({
  vesselId, vesselName, homePort, lastPort, operatingArea, initialDays, initialWindow,
}: Props) {
  const [days, setDays] = useState<number | null>(initialDays)
  const [cache, setCache] = useState<Record<string, TrackWindow>>({ [String(initialDays)]: initialWindow })
  const [loading, setLoading] = useState(false)

  const window = cache[String(days)]

  // The gold "last port call" marker only belongs on the map when that call
  // falls inside the selected window.
  const lastPortInWindow = !!lastPort?.position && (
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

  const latestTrackedPort = [...initialWindow.events].reverse().find(event => event.kind === 'port')
  const latestPort = latestTrackedPort && (!lastPort?.date || Date.parse(latestTrackedPort.date) > Date.parse(lastPort.date))
    ? { name: latestTrackedPort.name && toTitleCase(latestTrackedPort.name), date: latestTrackedPort.date }
    : lastPort

  return (
    <div>
      <VesselMap
        vesselName={vesselName}
        homePort={homePort}
        lastPort={lastPortInWindow && lastPort?.position ? { ...lastPort.position, name: lastPort.name, date: lastPort.date } : null}
        portCalls={trackPoints}
        operatingArea={operatingArea}
        height={320}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 mt-2">
        <p className="text-xs text-gray-400 min-h-[1rem]">
          {latestPort ? <>
            <span className="font-medium text-gray-600">Latest port call</span>
            {' · '}{latestPort.name || 'Port name unavailable'}
            {latestPort.date && <> · <time dateTime={latestPort.date}>{portDate.format(new Date(latestPort.date))}</time></>}
          </> : 'No recorded port calls'}
        </p>
        <div className="flex items-center gap-1" aria-busy={loading}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              aria-pressed={days === p.days}
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
