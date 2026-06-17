'use client'

/**
 * PlaceAutocomplete — type-ahead place search backed by Photon (Komoot, OSM).
 * Free, no API key. On select, returns a verified place with real coordinates.
 * Reused by the home-port field and (later) the location search box.
 *
 * `preferPorts` floats harbour/port/marina-type results to the top (still shows
 * cities etc). We don't store the OSM category — it's only used for ranking + a
 * subtle hint in the dropdown.
 */

import { useEffect, useRef, useState } from 'react'

export interface PlaceResult {
  name: string
  label: string
  lat: number
  lon: number
  city: string | null
  state: string | null
  country: string | null
  // [minLon, minLat, maxLon, maxLat] when the place is an area (state/country/city)
  bbox?: [number, number, number, number]
  // Photon granularity: 'country' | 'state' | 'city' | 'locality' | 'house' | …
  kind?: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  onSelect: (r: PlaceResult) => void
  preferPorts?: boolean
  placeholder?: string
  className?: string
}

// Photon `type` values that are administrative areas — only these get a bbox, so
// search matches vessels *inside* the region. Other extent-bearing results (seas,
// straits, landmarks) come through as plain points and fall through to a radius.
const AREA_KINDS = new Set(['state', 'county', 'city', 'district', 'region', 'province'])

// OSM osm_value strings that indicate a port-like place
const PORT_VALUES = new Set(['marina', 'harbour', 'port', 'ferry_terminal', 'dock', 'quay', 'pier'])
const PORT_NAME_RE = /\b(harbou?r|marina|port|quay|pier|wharf|dock)\b/i

function portKind(p: any): string | null {
  const v = (p.osm_value || '').toLowerCase()
  if (PORT_VALUES.has(v)) return v
  if ((p.osm_key || '').toLowerCase() === 'harbour') return 'harbour'
  if (PORT_NAME_RE.test(p.name || '')) return 'port'
  return null
}

export default function PlaceAutocomplete({
  value,
  onChange,
  onSelect,
  preferPorts = false,
  placeholder,
  className,
}: Props) {
  const [results, setResults] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const skipNext = useRef(false) // don't re-query right after a selection sets the value

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false
      return
    }
    const q = value.trim()
    if (q.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=6`)
        const data = await res.json()
        let feats = data.features ?? []
        if (preferPorts) {
          // stable sort: port-like first
          feats = [...feats].sort(
            (a: any, b: any) => (portKind(b.properties) ? 1 : 0) - (portKind(a.properties) ? 1 : 0),
          )
        }
        setResults(feats)
        setOpen(true)
      } catch {
        setResults([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [value, preferPorts])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (f: any) => {
    const p = f.properties ?? {}
    const [lon, lat] = f.geometry.coordinates
    const label = [p.name, p.state, p.country].filter(Boolean).join(', ')
    // Only administrative areas get a bbox (so search matches vessels *inside* the
    // region and the map draws the box). Seas/straits/ports/landmarks come through
    // as plain points → radius + a pin. Photon `extent` is [west, north, east, south]
    // → normalize to [minLon, minLat, maxLon, maxLat].
    const ext = p.extent
    const bbox = AREA_KINDS.has(p.type) && Array.isArray(ext) && ext.length === 4
      ? ([ext[0], ext[3], ext[2], ext[1]] as [number, number, number, number])
      : undefined
    skipNext.current = true
    onChange(p.name ?? label)
    onSelect({
      name: p.name ?? label,
      label,
      lat,
      lon,
      city: p.city ?? null,
      state: p.state ?? null,
      country: p.country ?? null,
      bbox,
      kind: p.type,
    })
    setOpen(false)
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-[1000] mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {results.map((f, i) => {
            const p = f.properties ?? {}
            const sub = [p.city, p.state, p.country].filter(Boolean).join(', ')
            const kind = portKind(p)
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pick(f)}
                  className="w-full text-left px-3.5 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
                >
                  <span className="flex-1 min-w-0">
                    <span className="text-navy">{p.name}</span>
                    {sub && <span className="text-gray-400"> — {sub}</span>}
                  </span>
                  {kind && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-teal bg-teal-50 rounded px-1.5 py-0.5">
                      {kind}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
