'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { Vessel } from '@/lib/vessel-utils'
import type { MapView } from './HomeMap'

// Leaflet must not SSR
const HomeMap = dynamic(() => import('./HomeMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-lightblue-100" />,
})

interface VesselWithPhoto extends Vessel {
  photoUrl: string
}

interface OperatingAreaVessel {
  id: number
  name: string
  operating_area_geojson: GeoJSON.FeatureCollection
}

const VIEWS: { value: MapView; label: string }[] = [
  { value: 'home_port', label: 'Home ports' },
  { value: 'last_port', label: 'Recent port calls' },
  { value: 'operating_area', label: 'Operating areas' },
]

export default function MapPageClient({ vessels }: { vessels: VesselWithPhoto[] }) {
  const [view, setView] = useState<MapView>('home_port')
  const [areas, setAreas] = useState<OperatingAreaVessel[] | null>(null)
  const [loadingAreas, setLoadingAreas] = useState(false)

  // Operating-area polygons are heavy, so only fetch them the first time the
  // user switches to that view.
  useEffect(() => {
    if (view !== 'operating_area' || areas !== null || loadingAreas) return
    setLoadingAreas(true)
    fetch('/api/vessels/operating-areas')
      .then((r) => r.json())
      .then((d) => setAreas(d.vessels ?? []))
      .catch(() => setAreas([]))
      .finally(() => setLoadingAreas(false))
  }, [view, areas, loadingAreas])

  return (
    <div className="relative w-full h-full">
      {/* view toggle */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
        <div className="inline-flex bg-white/95 backdrop-blur rounded-full p-1 gap-1 shadow-md border border-gray-100">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setView(v.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                view === v.value ? 'bg-navy text-white shadow-sm' : 'text-gray-500 hover:text-navy'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'operating_area' && loadingAreas && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] text-xs text-gray-500 bg-white/90 rounded-full px-3 py-1 shadow">
          Loading operating areas…
        </div>
      )}

      <HomeMap vessels={vessels} view={view} operatingAreas={areas ?? undefined} />
    </div>
  )
}
