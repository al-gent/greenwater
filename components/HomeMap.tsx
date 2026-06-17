'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, Rectangle, Circle, useMap } from 'react-leaflet'
import type { Vessel } from '@/lib/vessel-utils'
import { stripHtml, getFallbackPhotoUrl, countryNameToFlag } from '@/lib/vessel-utils'
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

export type MapView = 'home_port' | 'last_port' | 'operating_area'

interface OperatingAreaVessel {
  id: number
  name: string
  operating_area_geojson: GeoJSON.FeatureCollection
}

const NM_TO_M = 1852

// Box buffered outward by a radius (nm) → Leaflet [[south, west], [north, east]].
function expandedBoxBounds(bbox: [number, number, number, number], radiusNm: number): [[number, number], [number, number]] {
  const [w, s, e, n] = bbox
  const cLat = (s + n) / 2
  const dLat = radiusNm / 60
  const dLon = radiusNm / (60 * Math.max(Math.cos((cLat * Math.PI) / 180), 0.01))
  return [[s - dLat, w - dLon], [n + dLat, e + dLon]]
}

interface SearchPlace {
  lat: number
  lon: number
  label?: string
  // [minLon, minLat, maxLon, maxLat] when the place is an administrative area
  bbox?: [number, number, number, number]
  // search radius in nautical miles — set only for point picks in a proximity mode
  radiusNm?: number
}

interface HomeMapProps {
  vessels: VesselWithPhoto[]
  onVesselClick?: (id: number) => void
  view?: MapView
  operatingAreas?: OperatingAreaVessel[]
  searchPlace?: SearchPlace
}

// A 📍 pin that sits with its point on the exact coordinate.
function pinIcon() {
  return L.divIcon({
    html: `<div style="font-size:30px;line-height:30px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));">📍</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [9, 30],
  })
}

// Imperatively pan/zoom the map to the searched place whenever it changes.
function FlyToPlace({ place }: { place?: SearchPlace }) {
  const map = useMap()
  useEffect(() => {
    if (!place) return
    if (place.bbox) {
      // area pick: frame the box, buffered by the radius if set
      const b = place.radiusNm
        ? expandedBoxBounds(place.bbox, place.radiusNm)
        : ([[place.bbox[1], place.bbox[0]], [place.bbox[3], place.bbox[2]]] as [[number, number], [number, number]])
      map.fitBounds(b, { padding: [40, 40], maxZoom: 9 })
    } else if (place.radiusNm) {
      map.fitBounds(L.latLng(place.lat, place.lon).toBounds(place.radiusNm * NM_TO_M * 2), { padding: [40, 40] })
    } else {
      map.flyTo([place.lat, place.lon], 6, { duration: 0.8 })
    }
    // key on primitive values — `place` is a fresh object each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place?.lat, place?.lon, place?.bbox?.join(','), place?.radiusNm, map])
  return null
}

// Marker colors by what the dot actually represents (matches VesselMap).
const HOME_COLOR = '#2A7B6F' // teal — static home port
const LAST_COLOR = '#F5A623' // gold — most recent port call (live GFW)

type Source = 'home_port' | 'last_port'

// Resolve which coordinate to plot and what it represents. On the home page
// (no view) we prefer the live last port call and fall back to the home port.
function resolveCoords(v: VesselWithPhoto, view?: MapView): { lat: number; lng: number; source: Source } | null {
  const home = v.primary_latitude && v.primary_longitude
    ? { lat: parseFloat(v.primary_latitude), lng: parseFloat(v.primary_longitude), source: 'home_port' as Source }
    : null
  const last = v.last_port_lat != null && v.last_port_lon != null
    ? { lat: v.last_port_lat, lng: v.last_port_lon, source: 'last_port' as Source }
    : null

  let pick: { lat: number; lng: number; source: Source } | null
  if (view === 'home_port') pick = home
  else if (view === 'last_port') pick = last
  else pick = last ?? home // home page: prefer last port call, fall back to home

  if (!pick || isNaN(pick.lat) || isNaN(pick.lng)) return null
  return pick
}

export default function HomeMap({ vessels, onVesselClick, view, operatingAreas, searchPlace }: HomeMapProps) {
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({})

  const validVessels = vessels
    .map((v) => {
      const c = resolveCoords(v, view)
      return c ? { ...v, _lat: c.lat, _lng: c.lng, _source: c.source } : null
    })
    .filter((v): v is VesselWithPhoto & { _lat: number; _lng: number; _source: Source } => v !== null)

  // Only the home page (no explicit view) mixes both kinds, so show the legend there.
  const showLegend = view === undefined && validVessels.some((v) => v._source === 'last_port')
    && validVessels.some((v) => v._source === 'home_port')

  return (
    <div className="relative w-full h-full">
      {showLegend && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow-md border border-gray-100 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: LAST_COLOR }} />
            <span className="text-gray-600">Last port call</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: HOME_COLOR }} />
            <span className="text-gray-600">Home port</span>
          </div>
        </div>
      )}
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
      <FlyToPlace place={searchPlace} />
      {searchPlace?.bbox ? (
        <>
          {/* search reach: the extent buffered outward by the radius */}
          {searchPlace.radiusNm && (
            <Rectangle
              bounds={expandedBoxBounds(searchPlace.bbox, searchPlace.radiusNm)}
              pathOptions={{ color: '#2A7B6F', weight: 1.5, fillColor: '#2A7B6F', fillOpacity: 0.08 }}
            />
          )}
          {/* the place itself */}
          <Rectangle
            bounds={[[searchPlace.bbox[1], searchPlace.bbox[0]], [searchPlace.bbox[3], searchPlace.bbox[2]]]}
            pathOptions={{ color: '#1B3A6B', weight: 1.5, fill: false, dashArray: '5 4' }}
          />
        </>
      ) : searchPlace?.radiusNm ? (
        <Circle
          center={[searchPlace.lat, searchPlace.lon]}
          radius={searchPlace.radiusNm * NM_TO_M}
          pathOptions={{ color: '#2A7B6F', weight: 1.5, fillColor: '#2A7B6F', fillOpacity: 0.08 }}
        />
      ) : null}
      {searchPlace && (
        <Marker position={[searchPlace.lat, searchPlace.lon]} icon={pinIcon()} interactive={false} zIndexOffset={1000} />
      )}
      {view === 'operating_area' &&
        (operatingAreas ?? []).map((o) => (
          <GeoJSON
            key={o.id}
            data={o.operating_area_geojson}
            style={{ color: '#2A7B6F', weight: 1, fillColor: '#2A7B6F', fillOpacity: 0.1 }}
            onEachFeature={(_f, layer) => {
              layer.bindPopup(
                `<a href="/vessels/${o.id}" style="color:#1B3A6B;font-weight:600;font-family:sans-serif;font-size:13px;">${o.name} →</a>`,
              )
            }}
          />
        ))}
      {view !== 'operating_area' && validVessels.map((vessel) => {
        const activity = stripHtml(vessel.main_activity)
        const photoSrc = imgErrors[vessel.id]
          ? getFallbackPhotoUrl(vessel)
          : vessel.photoUrl
        const isLast = vessel._source === 'last_port'
        const locationLabel = isLast
          ? vessel.last_port_city
            ? vessel.last_port_city + (vessel.last_port_country ? ` ${countryNameToFlag(vessel.last_port_country) ?? vessel.last_port_country}` : '')
            : vessel.country
          : vessel.port_city
            ? vessel.port_city + (countryNameToFlag(vessel.country) ? ` ${countryNameToFlag(vessel.country)}` : '')
            : vessel.country

        return (
          <Marker
            key={vessel.id}
            position={[vessel._lat!, vessel._lng!]}
            icon={createVesselMarker(isLast ? LAST_COLOR : HOME_COLOR)}
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
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: isLast ? LAST_COLOR : HOME_COLOR }}
                      />
                      <span className="font-medium text-gray-600">{isLast ? 'Last seen' : 'Home port'}:</span>
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
    </div>
  )
}
