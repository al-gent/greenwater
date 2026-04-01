'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import type { Vessel } from '@/lib/vessel-utils'
import { stripHtml, getFallbackPhotoUrl, toTitleCase, iso3ToFlag, countryNameToFlag } from '@/lib/vessel-utils'
import Link from 'next/link'
import L from 'leaflet'

// Fix Leaflet default icon paths in Next.js
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

function createVesselMarker(color = '#2A7B6F') {
  return L.divIcon({
    html: `<div style="
      width:14px;
      height:14px;
      background:${color};
      border:2.5px solid white;
      border-radius:50%;
      box-shadow:0 1px 6px rgba(0,0,0,0.35);
      cursor:pointer;
      transition:transform 0.15s;
    "></div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  })
}

interface VesselWithPhoto extends Vessel {
  photoUrl: string
}

interface HomeMapProps {
  vessels: VesselWithPhoto[]
  onVesselClick?: (id: number) => void
}

export default function HomeMap({ vessels, onVesselClick }: HomeMapProps) {
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({})

  const validVessels = vessels
    .map((v) => {
      // Prefer last port call coords; fall back to static homeport coords
      const lat = v.last_port_lat ?? (v.primaryLatitude ? parseFloat(v.primaryLatitude) : null)
      const lng = v.last_port_lon ?? (v.primaryLongitude ? parseFloat(v.primaryLongitude) : null)
      return { ...v, _lat: lat, _lng: lng }
    })
    .filter((v) => v._lat !== null && v._lng !== null && !isNaN(v._lat) && !isNaN(v._lng))

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={2}
      style={{ width: '100%', height: '100%' }}
      className="z-0"
      worldCopyJump
    >
      <FixLeafletIcons />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />
      {validVessels.map((vessel) => {
        const activity = stripHtml(vessel.Main_Activity)
        const photoSrc = imgErrors[vessel.id]
          ? getFallbackPhotoUrl(vessel)
          : vessel.photoUrl
        const locationLabel = vessel.last_port_name
          ? toTitleCase(vessel.last_port_name) + (vessel.last_port_flag ? ` ${iso3ToFlag(vessel.last_port_flag) ?? vessel.last_port_flag}` : '')
          : vessel.port_city
            ? vessel.port_city + (countryNameToFlag(vessel.country) ? ` ${countryNameToFlag(vessel.country)}` : '')
            : vessel.homeport

        return (
          <Marker
            key={vessel.id}
            position={[vessel._lat!, vessel._lng!]}
            icon={createVesselMarker()}
          >
            <Popup
              minWidth={240}
              maxWidth={280}
              className="vessel-popup"
            >
              <div className="font-sans">
                {/* Photo */}
                <div className="h-32 -mx-[13px] -mt-[13px] mb-3 overflow-hidden rounded-t-lg bg-gray-100">
                  <img
                    src={photoSrc}
                    alt={vessel.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={() => setImgErrors((prev) => ({ ...prev, [vessel.id]: true }))}
                  />
                </div>

                {/* Content */}
                <div className="px-1">
                  <h3 className="font-bold text-navy text-sm leading-tight mb-1">
                    {vessel.name}
                  </h3>
                  {locationLabel && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                      <svg className="w-3 h-3 text-teal flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      {locationLabel}
                    </p>
                  )}
                  {vessel.scientists != null && (
                    <p className="text-xs text-gray-600 mb-1">
                      <span className="font-medium text-teal">{vessel.scientists}</span> research bunks
                    </p>
                  )}
                  {activity && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">{activity}</p>
                  )}
                  <a
                    href={`/vessels/${vessel.id}`}
                    className="block w-full bg-navy text-white text-xs font-semibold text-center py-2 rounded-lg hover:bg-navy-600 transition-colors"
                  >
                    View Vessel →
                  </a>
                </div>
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
