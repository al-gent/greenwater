'use client'

// Read-only map of a project's drawn area. Leaflet must not SSR; the dynamic import lives here.
import dynamic from 'next/dynamic'

const VesselMap = dynamic(() => import('@/components/VesselMap'), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded-xl bg-gray-100 animate-pulse" />,
})

export default function ProjectAreaMap({ area }: { area: GeoJSON.FeatureCollection }) {
  return <VesselMap operatingArea={area} height={300} showLegend={false} scrollWheelZoom={false} />
}
