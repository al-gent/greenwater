'use client'

// Small position map, two modes: read-only pin (listing card) and click-to-
// drop-a-pin picker (update-location modal). Always dynamic-imported with
// ssr:false — Leaflet touches window at module scope.

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function pinIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#2A7B6F;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lon], Math.max(map.getZoom(), 8))
  }, [lat, lon, map])
  return null
}

function ClickToPick({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  })
  return null
}

interface PositionMapProps {
  lat: number | null
  lon: number | null
  /** called with new coordinates when the user places or drags the pin */
  onPick?: (lat: number, lon: number) => void
  /** when true (and onPick set), a map click places the pin — armed
   *  explicitly by the "drop a pin" button, never ambient */
  clickToPick?: boolean
  className?: string
}

export default function PositionMap({ lat, lon, onPick, clickToPick, className }: PositionMapProps) {
  const hasPin = lat != null && lon != null
  const interactive = !!onPick
  return (
    <MapContainer
      center={hasPin ? [lat, lon] : [25, -30]}
      zoom={hasPin ? 8 : 1}
      className={className}
      style={{ width: '100%', height: '100%', cursor: clickToPick ? 'crosshair' : undefined }}
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      {hasPin && (
        <Marker
          position={[lat, lon]}
          icon={pinIcon()}
          draggable={interactive}
          eventHandlers={
            onPick
              ? { dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onPick(p.lat, p.lng) } }
              : undefined
          }
        />
      )}
      {hasPin && <Recenter lat={lat} lon={lon} />}
      {onPick && clickToPick && <ClickToPick onPick={onPick} />}
    </MapContainer>
  )
}
