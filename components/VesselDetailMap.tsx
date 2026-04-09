'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

function FixLeafletIcons() {
  useEffect(() => {
    // @ts-ignore
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })
  }, [])
  return null
}

function makeMarker(color: string) {
  return L.divIcon({
    html: `<div style="
      width:18px;height:18px;
      background:${color};
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  })
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 6)
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
    }
  }, [map, points])
  return null
}

interface VesselDetailMapProps {
  vesselName: string
  homeLat?: number | null
  homeLng?: number | null
  portCallLat?: number | null
  portCallLng?: number | null
  portCallName?: string | null
  portCallDate?: string | null
}

export default function VesselDetailMap({
  vesselName,
  homeLat, homeLng,
  portCallLat, portCallLng, portCallName, portCallDate,
}: VesselDetailMapProps) {
  const hasHome = homeLat != null && homeLng != null
  const hasPortCall = portCallLat != null && portCallLng != null

  const points: [number, number][] = [
    ...(hasHome ? [[homeLat!, homeLng!] as [number, number]] : []),
    ...(hasPortCall ? [[portCallLat!, portCallLng!] as [number, number]] : []),
  ]

  // Initial center: prefer home, fall back to port call
  const center: [number, number] = hasHome
    ? [homeLat!, homeLng!]
    : [portCallLat!, portCallLng!]

  return (
    <div className="relative w-full h-full">
    {/* Legend */}
    <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-xl shadow-sm px-3 py-2 flex flex-col gap-1.5 text-xs text-gray-600">
      {hasHome && (
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#2A7B6F', border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
          Home port
        </div>
      )}
      {hasPortCall && (
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#F5A623', border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
          Last port call
        </div>
      )}
    </div>
    <MapContainer
      center={center}
      zoom={6}
      style={{ width: '100%', height: '100%' }}
      className="z-0"
      scrollWheelZoom={false}
    >
      <FixLeafletIcons />
      <FitBounds points={points} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />

      {/* Home port — teal marker */}
      {hasHome && (
        <Marker position={[homeLat!, homeLng!]} icon={makeMarker('#2A7B6F')}>
          <Popup>
            <div className="font-sans text-sm">
              <p className="font-semibold text-navy">{vesselName}</p>
              <p className="text-gray-400 text-xs">Home port</p>
            </div>
          </Popup>
        </Marker>
      )}

      {/* Last known port call — gold marker */}
      {hasPortCall && (
        <Marker position={[portCallLat!, portCallLng!]} icon={makeMarker('#F5A623')}>
          <Popup>
            <div className="font-sans text-sm">
              <p className="font-semibold text-navy">{vesselName}</p>
              {portCallName && <p className="text-gray-700 text-xs">{portCallName}</p>}
              {portCallDate && (
                <p className="text-gray-400 text-xs">
                  Last seen {new Date(portCallDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
    </div>
  )
}
