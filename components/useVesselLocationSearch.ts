'use client'

import { useEffect, useState } from 'react'
export type SearchMode = 'operating_area' | 'home_port' | 'last_port'

export interface Place {
  label: string
  lat: number
  lon: number
  bbox?: [number, number, number, number]
  kind?: string
  country?: string | null
}

export interface LocationMatch {
  ids: Set<number>
  label: string
  mode: SearchMode
}

export interface VesselLocationSearch {
  place: Place | null
  mode: SearchMode
  radius: number
  match: LocationMatch | null
  loading: boolean
  /** Radius applies for any place except a country (matched by name). */
  radiusApplies: boolean
  selectPlace: (place: Place) => void
  clear: () => void
  setMode: (m: SearchMode) => void
  setRadius: (n: number) => void
}

/**
 * Owns the location-search state (query / place / mode / radius) and runs the
 * debounced /api/vessels/search call, exposing the matching vessel IDs. Shared by
 * the home and browse pages so the search semantics stay in one place.
 */
export function useVesselLocationSearch(initial?: {
  place?: Place | null
  mode?: SearchMode
  radius?: number
}): VesselLocationSearch {
  const [place, setPlace] = useState<Place | null>(initial?.place ?? null)
  const [mode, setMode] = useState<SearchMode>(initial?.mode ?? 'last_port')
  const [radius, setRadius] = useState(initial?.radius ?? 250)
  const [match, setMatch] = useState<LocationMatch | null>(null)
  const [loading, setLoading] = useState(false)

  const clear = () => setPlace(null)

  const radiusApplies = !!place && (place.kind !== 'country' || mode === 'operating_area')

  // Debounced search whenever place / mode / radius changes.
  useEffect(() => {
    if (!place) {
      setMatch(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(() => {
      const params = new URLSearchParams({ mode, lat: String(place.lat), lon: String(place.lon) })
      if (mode === 'operating_area') {
        params.set('radius', String(radius)) // within `radius` nm of the operating area
      } else {
        if (place.kind === 'country' && place.country) params.set('country', place.country)
        if (place.bbox) params.set('bbox', place.bbox.join(','))
        params.set('radius', String(radius)) // box expanded by radius, or a circle for points
      }
      fetch(`/api/vessels/search?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => { if (!cancelled) setMatch({ ids: new Set<number>(d.ids ?? []), label: place.label, mode }) })
        .catch(() => { if (!cancelled) setMatch({ ids: new Set<number>(), label: place.label, mode }) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [place, mode, radius])

  return {
    place, mode, radius, match, loading, radiusApplies,
    selectPlace: setPlace, clear, setMode, setRadius,
  }
}
