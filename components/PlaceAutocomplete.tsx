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

export interface VesselOption {
  id: number
  name: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  onSelect: (r: PlaceResult) => void
  preferPorts?: boolean
  placeholder?: string
  ariaLabel?: string
  unavailableHint?: string
  className?: string
  /** When provided, the dropdown mixes name-matching vessels (client-side)
   *  above the Photon place results — one box searches both. */
  vessels?: VesselOption[]
  onSelectVessel?: (v: VesselOption) => void
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
  ariaLabel,
  unavailableHint,
  className,
  vessels,
  onSelectVessel,
}: Props) {
  const [results, setResults] = useState<any[]>([])
  const [placesLoading, setPlacesLoading] = useState(false)
  const [placesFailed, setPlacesFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const skipNext = useRef(false) // don't re-query right after a selection sets the value

  // Vessel matches are instant (the list is already client-side); Photon
  // results join them ~250ms later.
  const q = value.trim().toLowerCase()
  const vesselMatches =
    vessels && q.length >= 2
      ? vessels.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 5)
      : []

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false
      return
    }
    const q = value.trim()
    if (q.length < 2) {
      setResults([])
      setPlacesLoading(false)
      setOpen(false)
      return
    }
    // Vessel matches render instantly (client-side); the dropdown opens right
    // away with a "searching places…" row until Photon answers.
    setPlacesLoading(true)
    setResults([])
    setPlacesFailed(false)
    const controller = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=6`, { signal: controller.signal })
        if (!res.ok) throw new Error('Place search unavailable')
        const data = await res.json()
        let feats = data.features ?? []
        if (preferPorts) {
          // stable sort: port-like first
          feats = [...feats].sort(
            (a: any, b: any) => (portKind(b.properties) ? 1 : 0) - (portKind(a.properties) ? 1 : 0),
          )
        }
        if (!controller.signal.aborted) setResults(feats)
      } catch {
        if (!controller.signal.aborted) setPlacesFailed(true)
      } finally {
        if (!controller.signal.aborted) setPlacesLoading(false)
      }
    }, 250)
    return () => { clearTimeout(t); controller.abort() }
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
    <div className="relative" ref={boxRef}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return
        const input = event.currentTarget.querySelector('input')
        if (event.key === 'Escape') { input?.focus(); setOpen(false); return }
        if (!open) return
        const options = Array.from(event.currentTarget.querySelectorAll('li button')) as HTMLButtonElement[]
        if (!options.length) return
        const index = options.indexOf(event.target as HTMLButtonElement)
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const next = event.key === 'ArrowDown' ? Math.min(index + 1, options.length - 1) : index - 1
          if (next < 0) input?.focus()
          else options[next].focus()
        } else if (event.key === 'Enter' && event.target === input) {
          event.preventDefault()
          options[0].click()
        }
      }}>
      <input
        type="text"
        value={value}
        onChange={(e) => { skipNext.current = false; onChange(e.target.value); setOpen(e.target.value.trim().length >= 2) }}
        onFocus={() => setOpen(q.length >= 2)}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && q.length >= 2 && (
        <ul className="absolute z-[1000] mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
          {vesselMatches.length > 0 && (
            <li className="px-3.5 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400">Vessels</li>
          )}
          {vesselMatches.map((v) => (
            <li key={`vessel-${v.id}`}>
              <button
                type="button"
                onClick={() => {
                  skipNext.current = true
                  onChange(v.name)
                  onSelectVessel?.(v)
                  setOpen(false)
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-gray-50 text-sm flex items-center gap-2"
              >
                <span className="flex-1 min-w-0 text-navy">{v.name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-navy bg-gold/20 rounded px-1.5 py-0.5">
                  vessel
                </span>
              </button>
            </li>
          ))}
          {vesselMatches.length > 0 && (results.length > 0 || placesLoading) && (
            <li className="px-3.5 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-400 border-t border-gray-50">Places</li>
          )}
          {placesLoading && results.length === 0 && (
            <li className="px-3.5 py-2.5 text-sm text-gray-400 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 animate-spin text-teal" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching places…
            </li>
          )}
          {unavailableHint && <li className="px-3.5 py-2 text-sm text-gray-500">{unavailableHint}</li>}
          {placesFailed && <li className="px-3.5 py-2 text-sm text-gray-500">Location search is temporarily unavailable.</li>}
          {!placesFailed && !placesLoading && !unavailableHint && !results.length && !vesselMatches.length && (
            <li className="px-3.5 py-2 text-sm text-gray-500">No matches found.</li>
          )}
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
