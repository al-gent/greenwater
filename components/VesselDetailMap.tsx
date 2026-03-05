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

function createPortMarker() {
  return L.divIcon({
    html: `<div style="
      width:18px;
      height:18px;
      background:#F5A623;
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
}

export default function VesselDetailMap({ lat, lng, homeport, vesselName }: VesselDetailMapProps) {
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
      <Marker position={[lat, lng]} icon={createPortMarker()}>
        <Popup>
          <div className="font-sans text-sm">
            <p className="font-semibold text-navy">{vesselName}</p>
            {homeport && <p className="text-gray-500 text-xs">Home port: {homeport}</p>}
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  )
}
