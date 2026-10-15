'use client'

// Leaflet must not SSR; dynamic({ ssr: false }) has to live in a client component.
import dynamic from 'next/dynamic'
import type { CruiseLeg } from '@/lib/cruise-utils'

const CruiseMap = dynamic(() => import('@/components/CruiseMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full bg-gray-100 flex items-center justify-center rounded-xl" style={{ height: 360 }}>
      <span className="text-sm text-gray-400">Loading map…</span>
    </div>
  ),
})

const LEGEND: { swatch: string; label: string; dashed?: boolean }[] = [
  { swatch: '#c0392b', label: 'Port' },
  { swatch: '#1B3A6B', label: 'Track / waypoint' },
  { swatch: '#1B3A6B', label: 'Planned route', dashed: true },
  { swatch: '#2A7B6F', label: 'Station' },
  { swatch: '#F5A623', label: 'Mooring / vehicle' },
  { swatch: '#7A9ED0', label: 'Research area' },
]

export default function CruiseMapSection({ operatingArea, legs }: { operatingArea: GeoJSON.FeatureCollection | null; legs: CruiseLeg[] }) {
  const types = new Set((operatingArea?.features ?? []).map((f: any) => f.properties?.Type as string | undefined))
  const show = (label: string) => {
    if (label === 'Port') return legs.some((l) => l.depart_lat != null || l.arrive_lat != null)
    if (label === 'Station') return types.has('Sampling Station')
    if (label === 'Mooring / vehicle') return ['Mooring', 'Lander', 'ROV', 'AUV', 'Glider Station'].some((t) => types.has(t))
    if (label === 'Research area') return types.has('Research Area')
    if (label === 'Planned route') return types.has('ShipTransect')
    return ['Transect', 'Waypoint'].some((t) => types.has(t))
  }
  // Steaming time the PI planned (MFP TravelTime is hours per ShipTransect).
  const routes = (operatingArea?.features ?? []).filter((f: any) => f.properties?.Type === 'ShipTransect')
  const hours = routes.reduce((n: number, f: any) => n + (parseFloat(f.properties?.TravelTime) || 0), 0)
  const stations = (operatingArea?.features ?? []).filter((f: any) => ['Sampling Station', 'Mooring', 'Lander', 'ROV', 'AUV', 'Glider Station'].includes(f.properties?.Type)).length
  return (
    <div>
      <CruiseMap operatingArea={operatingArea} legs={legs} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
        {LEGEND.filter((l) => show(l.label)).map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            {l.dashed ? (
              <span className="inline-block w-4 border-t-2 border-dashed opacity-50" style={{ borderColor: l.swatch }} />
            ) : (
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: l.swatch }} />
            )}
            {l.label}
          </span>
        ))}
      </div>
      {routes.length > 0 && hours > 0 && (
        <p className="text-xs text-gray-400 mt-1">
          Planned route: {routes.length} segment{routes.length === 1 ? '' : 's'} · ~{hours >= 48 ? `${Math.round(hours / 24)} days` : `${Math.round(hours)} hours`} steaming
          {stations > 0 && <> · {stations} station{stations === 1 ? '' : 's'}</>}
        </p>
      )}
    </div>
  )
}
