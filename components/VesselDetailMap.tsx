'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
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

interface VesselDetailMapProps {
  lat: number
  lng: number
  homeport: string | null
  vesselName: string
  portCallLat?: number | null
  portCallLng?: number | null
  portCallName?: string | null
  portCallDate?: string | null
}

export default function VesselDetailMap({
  lat, lng, homeport, vesselName,
  portCallLat, portCallLng, portCallName, portCallDate,
}: VesselDetailMapProps) {
  const hasPortCall = portCallLat != null && portCallLng != null

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={6}
      style={{ width: '100%', height: '100%' }}
      className="z-0"
      scrollWheelZoom={false}
    >
      <FixLeafletIcons />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />

      {/* Last known port call — gold marker */}
      {hasPortCall && (
        <Marker position={[portCallLat!, portCallLng!]} icon={makeMarker('#F5A623')}>
          <Popup>
            <div className="font-sans text-sm">
              <p className="font-semibold text-navy">{vesselName}</p>
              {portCallName && <p className="text-gray-700 text-xs">{portCallName}</p>}
              {portCallDate && (
                <p className="text-gray-400 text-xs">
                  {new Date(portCallDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      )}

      {/* Static homeport coords — teal marker, only if different location */}
      {!hasPortCall && (
        <Marker position={[lat, lng]} icon={makeMarker('#2A7B6F')}>
          <Popup>
            <div className="font-sans text-sm">
              <p className="font-semibold text-navy">{vesselName}</p>
              {homeport && <p className="text-gray-500 text-xs">{homeport}</p>}
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  )
}
