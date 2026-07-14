'use client'

/**
 * VesselMap — one map for both editing and display.
 *
 *  • editable: geoman draw tools (rectangle/polygon, edit, drag, delete) for the
 *    operating area, emitted via `onAreaChange`. Used in the listing + edit forms.
 *  • read-only (default): renders the operating-area polygon + home/last-port
 *    markers + legend. Used on the vessel detail page.
 *
 * The operating area is a GeoJSON FeatureCollection (drawn boxes and gazetteer
 * polygons share that format). Markers update live as their coords change.
 *
 * IMPORTANT: Leaflet must not SSR. Import with
 *   const VesselMap = dynamic(() => import('@/components/VesselMap'), { ssr: false })
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Tooltip, GeoJSON, Polyline, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

type FC = GeoJSON.FeatureCollection

interface LatLng { lat: number; lng: number }
interface LastPort extends LatLng { name?: string | null; date?: string | null }
export interface TrackPoint extends LatLng {
  name?: string | null
  date?: string | null
  kind?: 'port' | 'sea' // sea = GFW loitering event (station work); default port
  isLatest?: boolean // rendered by the gold lastPort marker — no extra dot
}

interface Props {
  operatingArea?: FC | null
  editable?: boolean
  onAreaChange?: (fc: FC | null) => void
  homePort?: LatLng | null
  lastPort?: LastPort | null
  /** Port call history, oldest → newest. Drawn as a dashed track ending at lastPort. */
  portCalls?: TrackPoint[] | null
  vesselName?: string
  height?: number
  showLegend?: boolean // default: !editable
  fitToContent?: boolean // default: !editable (editable fits once on mount)
  scrollWheelZoom?: boolean // default: editable
}

const TEAL = '#2A7B6F'
const GOLD = '#F5A623'
const NAVY = '#1B3A6B'

// Shift each successive longitude by ±360 so the segment takes the short way
// around (a Pacific crossing shouldn't draw a line across the whole map).
// worldCopyJump keeps the shifted copies visible.
function unwrapTrack(points: TrackPoint[]): TrackPoint[] {
  const out: TrackPoint[] = []
  let prev: number | null = null
  for (const p of points) {
    let lng = p.lng
    if (prev !== null) {
      while (lng - prev > 180) lng -= 360
      while (lng - prev < -180) lng += 360
    }
    out.push({ ...p, lng })
    prev = lng
  }
  return out
}

// Legend row with a checkbox — makes it obvious layers can be shown/hidden
function LegendToggle({ label, checked, onToggle, swatch }: {
  label: string
  checked: boolean
  onToggle: () => void
  swatch: React.ReactNode
}) {
  return (
    <label className={`flex items-center gap-2 cursor-pointer select-none transition-opacity hover:opacity-75 ${checked ? '' : 'opacity-45'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-3 h-3 accent-teal cursor-pointer flex-shrink-0"
      />
      {swatch}
      {label}
    </label>
  )
}

function dotIcon(color: string) {
  return L.divIcon({
    html: `<div style="width:16px;height:16px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 1px 6px rgba(0,0,0,0.35);"></div>`,
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  })
}

// ── editable operating area (leaflet-geoman) ───────────────────────────────
function GeomanArea({ value, onChange }: { value: FC | null; onChange: (fc: FC | null) => void }) {
  const map = useMap()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const fgRef = useRef<L.FeatureGroup | null>(null)
  const lastSig = useRef('')
  const trackRef = useRef<(l: L.Layer) => void>(() => {})

  useEffect(() => {
    const fg = new L.FeatureGroup().addTo(map)
    fgRef.current = fg
    lastSig.current = '' // force the sync effect to (re)hydrate onto this fresh group

    map.pm.addControls({
      position: 'topright',
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawText: false,
      drawRectangle: true,
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      removalMode: true,
      cutPolygon: false,
      rotateMode: false,
    })

    const emit = () => {
      const gj = fg.toGeoJSON() as FC
      const out = gj.features.length ? gj : null
      lastSig.current = JSON.stringify(out)
      onChangeRef.current(out)
    }
    const track = (layer: L.Layer) => {
      fg.addLayer(layer)
      layer.on('pm:edit', emit)
      layer.on('pm:update', emit)
      layer.on('pm:dragend', emit)
    }
    trackRef.current = track

    map.on('pm:create', (e: any) => {
      track(e.layer)
      emit()
    })
    map.on('pm:remove', (e: any) => {
      fg.removeLayer(e.layer)
      emit()
    })

    return () => {
      map.off('pm:create')
      map.off('pm:remove')
      map.pm.removeControls()
      fg.remove()
      fgRef.current = null
    }
  }, [map])

  // sync EXTERNAL value changes onto the map (ignores our own emits)
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const incoming = JSON.stringify(value ?? null)
    if (incoming === lastSig.current) return
    fg.clearLayers()
    if (value?.features?.length) {
      L.geoJSON(value as any).eachLayer((l) => trackRef.current(l))
    }
    lastSig.current = incoming
  }, [value])

  return null
}

// ── fit the view to whatever content exists ────────────────────────────────
function FitBounds({ homePort, lastPort, track, area, once }: {
  homePort?: LatLng | null
  lastPort?: LatLng | null
  track?: TrackPoint[]
  area?: FC | null
  once: boolean
}) {
  const map = useMap()
  const done = useRef(false)
  const sig = JSON.stringify([homePort, lastPort && { lat: lastPort.lat, lng: lastPort.lng }, track?.length ?? 0, area?.features?.length ?? 0])

  useEffect(() => {
    if (once && done.current) return
    let b: L.LatLngBounds | null = null
    if (area?.features?.length) {
      try {
        const gb = L.geoJSON(area as any).getBounds()
        if (gb.isValid()) b = gb
      } catch {
        /* ignore */
      }
    }
    const pts = [homePort, lastPort, ...(track ?? [])].filter(Boolean) as LatLng[]
    for (const p of pts) {
      const ll: [number, number] = [p.lat, p.lng]
      b = b ? b.extend(ll) : L.latLngBounds(ll, ll)
    }
    if (!b || !b.isValid()) return
    if (pts.length === 1 && !area?.features?.length) {
      map.setView([pts[0].lat, pts[0].lng], 6)
    } else {
      map.fitBounds(b, { padding: [40, 40], maxZoom: 10 })
    }
    done.current = true
  }, [map, sig, once]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export default function VesselMap({
  operatingArea = null,
  editable = false,
  onAreaChange,
  homePort = null,
  lastPort = null,
  portCalls = null,
  vesselName,
  height = 360,
  showLegend,
  fitToContent,
  scrollWheelZoom,
}: Props) {
  const legend = showLegend ?? !editable
  const fitOnce = !(fitToContent ?? !editable)
  const scroll = scrollWheelZoom ?? editable
  const hasArea = !!operatingArea?.features?.length

  // Legend rows double as layer toggles (ports / at-sea / operating area)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggleLayer = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const homeIcon = useMemo(() => dotIcon(TEAL), [])
  const portIcon = useMemo(() => dotIcon(GOLD), [])
  // Track needs ≥2 points to draw a line; unwrap longitudes across the antimeridian
  const track = useMemo(
    () => (portCalls && portCalls.length > 1 ? unwrapTrack(portCalls) : null),
    [portCalls]
  )
  // Layer-filtered view of the track (fade + fit still use the full track so
  // toggling doesn't re-zoom the map or reshuffle the age gradient)
  const visibleTrack = useMemo(() => {
    if (!track) return null
    const filtered = track.filter((p) => !hidden.has(p.kind === 'sea' ? 'sea' : 'ports'))
    return filtered.length > 0 ? filtered : null
  }, [track, hidden])

  // Older events render fainter so the track reads chronologically at a glance
  const ageOpacity = useMemo(() => {
    const times = (track ?? [])
      .map((p) => (p.date ? new Date(p.date).getTime() : null))
      .filter((t): t is number => t !== null)
    if (times.length < 2) return () => 1
    const min = Math.min(...times)
    const max = Math.max(...times)
    return (p: TrackPoint) => {
      if (!p.date || max === min) return 1
      const t = (new Date(p.date).getTime() - min) / (max - min)
      return 0.35 + 0.65 * t
    }
  }, [track])

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-gray-200" style={{ height }}>
      {legend && (hasArea || homePort || lastPort) && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-xl shadow-sm px-3 py-2 flex flex-col gap-1.5 text-xs text-gray-600">
          {homePort && (
            <LegendToggle
              label="Home port"
              checked={!hidden.has('home')}
              onToggle={() => toggleLayer('home')}
              swatch={<span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: TEAL, border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />}
            />
          )}
          {lastPort && !track && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: GOLD, border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              Last port call
            </div>
          )}
          {track && (lastPort || track.some((p) => p.kind !== 'sea')) && (
            <LegendToggle
              label="Port calls"
              checked={!hidden.has('ports')}
              onToggle={() => toggleLayer('ports')}
              swatch={
                <span className="flex items-center gap-0.5 flex-shrink-0">
                  <span className="w-3" style={{ borderTop: `2px dashed ${NAVY}` }} />
                  {lastPort
                    ? <span className="w-2.5 h-2.5 rounded-full" style={{ background: GOLD, border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                    : <span className="w-2.5 h-2.5 rounded-full" style={{ background: NAVY, border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />}
                </span>
              }
            />
          )}
          {track?.some((p) => p.kind === 'sea') && (
            <LegendToggle
              label="Working at sea"
              checked={!hidden.has('sea')}
              onToggle={() => toggleLayer('sea')}
              swatch={<span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'white', border: `2px solid ${TEAL}` }} />}
            />
          )}
          {hasArea && (
            <LegendToggle
              label="Operating area"
              checked={!hidden.has('area')}
              onToggle={() => toggleLayer('area')}
              swatch={<span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: 'rgba(42,123,111,0.2)', border: `1.5px solid ${TEAL}` }} />}
            />
          )}
        </div>
      )}
      <MapContainer
        center={[20, 0]}
        zoom={2}
        minZoom={2}
        style={{ width: '100%', height: '100%' }}
        className="z-0"
        scrollWheelZoom={scroll}
        worldCopyJump
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />

        {editable ? (
          <GeomanArea value={operatingArea} onChange={onAreaChange ?? (() => {})} />
        ) : (
          hasArea && !hidden.has('area') && (
            <GeoJSON
              key={JSON.stringify(operatingArea!.features.length)}
              data={operatingArea!}
              style={() => ({ color: TEAL, weight: 1.5, fillColor: TEAL, fillOpacity: 0.12 })}
            />
          )
        )}

        {visibleTrack && (
          <>
            <Polyline
              positions={visibleTrack.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{ color: NAVY, weight: 2, opacity: 0.55, dashArray: '5 7' }}
            />
            {/* dots for every event except the one the gold lastPort marker covers */}
            {visibleTrack.filter((p) => !p.isLatest).map((p, i) => (
              <CircleMarker
                key={`${p.lat},${p.lng},${i}`}
                center={[p.lat, p.lng]}
                radius={p.kind === 'sea' ? 3.5 : 4}
                pathOptions={p.kind === 'sea'
                  ? { color: TEAL, weight: 2, opacity: ageOpacity(p), fillColor: 'white', fillOpacity: 0.9 * ageOpacity(p) }
                  : { color: 'white', weight: 1.5, opacity: ageOpacity(p), fillColor: NAVY, fillOpacity: 0.9 * ageOpacity(p) }}
              >
                {p.kind !== 'sea' && (
                  <Tooltip direction="top" offset={[0, -6]}>
                    <span className="font-sans text-xs font-semibold text-navy">{p.name ?? 'Port call'}</span>
                    {p.date && (
                      <span className="font-sans text-xs text-gray-500">
                        {' · '}
                        {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </Tooltip>
                )}
              </CircleMarker>
            ))}
          </>
        )}

        {homePort && !hidden.has('home') && (
          <Marker position={[homePort.lat, homePort.lng]} icon={homeIcon}>
            <Popup>
              <div className="font-sans text-sm">
                <p className="font-semibold text-navy">{vesselName ?? 'Home port'}</p>
                <p className="text-gray-400 text-xs">Home port</p>
              </div>
            </Popup>
          </Marker>
        )}
        {lastPort && !(track && hidden.has('ports')) && (
          <Marker position={[lastPort.lat, lastPort.lng]} icon={portIcon}>
            {track ? (
              // part of the track — same hover behavior as the other port dots
              <Tooltip direction="top" offset={[0, -10]}>
                <span className="font-sans text-xs font-semibold text-navy">{lastPort.name ?? 'Last port call'}</span>
                {lastPort.date && (
                  <span className="font-sans text-xs text-gray-500">
                    {' · '}
                    {new Date(lastPort.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </Tooltip>
            ) : (
              <Popup>
                <div className="font-sans text-sm">
                  <p className="font-semibold text-navy">{vesselName ?? 'Last port call'}</p>
                  {lastPort.name && <p className="text-gray-700 text-xs">{lastPort.name}</p>}
                  {lastPort.date && (
                    <p className="text-gray-400 text-xs">
                      Last seen {new Date(lastPort.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </Popup>
            )}
          </Marker>
        )}

        <FitBounds homePort={homePort} lastPort={lastPort} track={track ?? undefined} area={operatingArea} once={fitOnce} />
      </MapContainer>
    </div>
  )
}
