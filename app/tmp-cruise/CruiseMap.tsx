'use client'
// TEMPORARY — MFP data explorer map.
import { useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CARTO_TILE_URL, CARTO_ATTRIBUTION } from '@/lib/vessel-utils'

const COLORS: Record<string, string> = {
  ShipTransect: '#1B3A6B',
  Transect: '#1B3A6B',
  Waypoint: '#1B3A6B',
  'Sampling Station': '#2A7B6F',
  Mooring: '#F5A623',
  Lander: '#F5A623',
  Glider: '#F5A623',
  'Glider Station': '#F5A623',
  ROV: '#F5A623',
  AUV: '#F5A623',
  'Research Area': '#7A9ED0',
  BoundCoordinates: '#B8D9E8',
  Port: '#c0392b',
}

function Fit({ fc }: { fc: any }) {
  const map = useMap()
  useEffect(() => {
    try {
      const b = L.geoJSON(fc).getBounds()
      if (b.isValid()) map.fitBounds(b.pad(0.2))
    } catch {}
  }, [fc, map])
  return null
}

export default function CruiseMap({ fc, ports }: { fc: any; ports: { name: string; lat: number; lon: number }[] }) {
  const portFc = {
    type: 'FeatureCollection',
    features: ports
      .filter((p) => p.lat != null && p.lon != null)
      .map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { Type: 'Port', Name: p.name } })),
  }
  const all = { type: 'FeatureCollection', features: [...(fc?.features ?? []), ...portFc.features] }
  return (
    <MapContainer center={[30, -90]} zoom={3} style={{ height: 420, width: '100%' }} scrollWheelZoom={false}>
      <TileLayer url={CARTO_TILE_URL} attribution={CARTO_ATTRIBUTION} />
      <Fit fc={all} />
      <GeoJSON
        key={JSON.stringify(all).length}
        data={all as any}
        style={(f: any) => {
          const c = COLORS[f?.properties?.Type] ?? '#666'
          return { color: c, weight: f?.properties?.Type === 'BoundCoordinates' ? 1 : 2, fillOpacity: f?.geometry?.type === 'Polygon' ? 0.1 : 0.6, dashArray: f?.properties?.Type === 'BoundCoordinates' ? '4 4' : undefined }
        }}
        pointToLayer={(f: any, latlng) =>
          L.circleMarker(latlng, { radius: f?.properties?.Type === 'Port' ? 7 : 4, color: COLORS[f?.properties?.Type] ?? '#666', fillOpacity: 0.8, weight: 1.5 })
        }
        onEachFeature={(f: any, layer) => {
          const p = f.properties ?? {}
          const extra = Object.entries(p)
            .filter(([k]) => !['id', 'parent_id', 'CruiseApplication_id', 'Organisation_id', 'ActualOrganisation_id', 'Workflow_id'].includes(k))
            .map(([k, v]) => `${k}: ${v}`)
            .join('<br/>')
          layer.bindPopup(`<b>${p.Type ?? ''}</b><br/>${extra}`)
        }}
      />
    </MapContainer>
  )
}
