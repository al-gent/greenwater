'use client'

/**
 * Map for a single cruise: the operating-area GeoJSON (stations, transects,
 * moorings, research areas…) plus the leg ports. Leaflet — import via
 * dynamic({ ssr: false }); see CruiseMapSection.
 */
import { useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CARTO_TILE_URL, CARTO_ATTRIBUTION } from '@/lib/vessel-utils'
import type { CruiseLeg } from '@/lib/cruise-utils'

const NAVY = '#1B3A6B', TEAL = '#2A7B6F', GOLD = '#F5A623', LIGHT = '#7A9ED0'

// Ship routes the PI drew in the cruise planner — usually include the transit
// from home port, which is not this cruise's work. Drawn faint, excluded from fit.
export const ROUTE_TYPES = new Set(['ShipTransect'])
const NON_WORK_TYPES = new Set(['ShipTransect', 'BoundCoordinates'])

// MFP feature Type → style. Anything unknown gets the neutral track style.
function styleFor(type: string | undefined) {
  switch (type) {
    case 'ShipTransect': return { color: NAVY, weight: 1.5, dash: '5 6', opacity: 0.35 }
    case 'Sampling Station': return { color: TEAL, radius: 4 }
    case 'Mooring': case 'Lander': case 'ROV': case 'AUV': case 'Glider Station': return { color: GOLD, radius: 5 }
    case 'Research Area': return { color: LIGHT, fill: 0.12 }
    case 'Port': return { color: '#c0392b', radius: 5 }
    default: return { color: NAVY, radius: 3 }
  }
}

// Fit to the ports + the work (stations, moorings, areas…); fall back to
// everything only when there is no work geometry at all.
function FitBounds({ fc, points }: { fc: GeoJSON.FeatureCollection | null; points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    try {
      const b = L.latLngBounds(points)
      const work = (fc?.features ?? []).filter((f: any) => !NON_WORK_TYPES.has(f.properties?.Type))
      const layer = work.length ? work : fc?.features ?? []
      if (layer.length) b.extend(L.geoJSON({ type: 'FeatureCollection', features: layer } as any).getBounds())
      if (b.isValid()) map.fitBounds(b.pad(0.15), { maxZoom: 9 })
    } catch { /* leave default view */ }
  }, [fc, points, map])
  return null
}

interface Props {
  operatingArea: GeoJSON.FeatureCollection | null
  legs: CruiseLeg[]
  height?: number
}

export default function CruiseMap({ operatingArea, legs, height = 360 }: Props) {
  // Distinct leg ports with coordinates, in track order.
  const ports: { name: string; lat: number; lon: number }[] = []
  for (const l of legs) {
    for (const p of [{ name: l.depart_port, lat: l.depart_lat, lon: l.depart_lon }, { name: l.arrive_port, lat: l.arrive_lat, lon: l.arrive_lon }]) {
      if (p.lat != null && p.lon != null && !ports.some((q) => q.name === p.name)) ports.push(p as any)
    }
  }
  const portLatLngs = ports.map((p) => [p.lat, p.lon] as [number, number])
  const fcKey = operatingArea ? `${operatingArea.features?.length}-${JSON.stringify(operatingArea).length}` : 'none'
  // BoundCoordinates is MFP's bounding box stored as a 2-corner "polygon" (Leaflet
  // would draw a diagonal) and only restates the features' extent — not drawn.
  // Planner "Port" points are the PI's plan and can be stale (a transit re-routed
  // after planning); when the schedule gives us leg ports, those win.
  const drawn: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: (operatingArea?.features ?? []).filter((f: any) => f.properties?.Type !== 'BoundCoordinates' && !(f.properties?.Type === 'Port' && ports.length > 0)),
  }

  return (
    <div className="relative z-0 isolate rounded-xl overflow-hidden border border-gray-100" style={{ height }}>
      <MapContainer center={[30, -60]} zoom={3} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer url={CARTO_TILE_URL} attribution={CARTO_ATTRIBUTION} />
        <FitBounds fc={operatingArea} points={portLatLngs} />
        {drawn.features.length > 0 && (
          <GeoJSON
            key={fcKey}
            data={drawn}
            style={(f: any) => {
              const s = styleFor(f?.properties?.Type) as any
              return { color: s.color, weight: s.weight ?? 2, fillOpacity: s.fill ?? 0.5, dashArray: s.dash, opacity: s.opacity ?? 1 }
            }}
            pointToLayer={(f: any, latlng) => {
              const s = styleFor(f?.properties?.Type)
              return L.circleMarker(latlng, { radius: s.radius ?? 3, color: s.color, fillColor: s.color, fillOpacity: 0.8, weight: 1 })
            }}
            onEachFeature={(f: any, layer) => {
              const p = f.properties ?? {}
              const bits = [p.Type, p.Name].filter(Boolean)
              if (bits.length) layer.bindTooltip(bits.join(' · '), { direction: 'top', opacity: 0.9 })
            }}
          />
        )}
        {portLatLngs.length > 1 && <Polyline positions={portLatLngs} pathOptions={{ color: NAVY, weight: 1.5, dashArray: '6 6', opacity: 0.5 }} />}
        {ports.map((p) => (
          <CircleMarker key={p.name} center={[p.lat, p.lon]} radius={6} pathOptions={{ color: 'white', weight: 2, fillColor: '#c0392b', fillOpacity: 1 }}>
            <Tooltip direction="top" opacity={0.9}>{p.name}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
