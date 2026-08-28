'use client'

/**
 * LocationSearch — presentational. State (query / place / mode / radius) lives in
 * the parent so it can be synced to the URL and rehydrated on load/back. The
 * parent runs the /api/vessels/search call and applies the matching IDs.
 *
 * Modes:
 *   operating_area → vessels whose operating area covers the point (cruise planning)
 *   home_port      → vessels based within `radius` nm
 *   last_port      → vessels last seen within `radius` nm (live GFW data)
 */

import PlaceAutocomplete, { type VesselOption } from './PlaceAutocomplete'

export type SearchMode = 'operating_area' | 'home_port' | 'last_port'

const MODES: { value: SearchMode; label: string; hint: string }[] = [
  { value: 'operating_area', label: 'Operating area', hint: 'Vessels that work in this area' },
  { value: 'home_port', label: 'Home port', hint: 'Vessels based near here' },
  { value: 'last_port', label: 'Near now', hint: 'Vessels last seen near here' },
]

interface Props {
  query: string
  onQueryChange: (v: string) => void
  onSelectPlace: (r: {
    label: string
    lat: number
    lon: number
    bbox?: [number, number, number, number]
    kind?: string
    country?: string | null
  }) => void
  mode: SearchMode
  onModeChange: (m: SearchMode) => void
  radius: number
  onRadiusChange: (n: number) => void
  showRadius: boolean
  hasPlace: boolean
  onClear: () => void
  loading?: boolean
  /** One box, two searches: vessel-name matches mix into the dropdown. */
  vessels?: VesselOption[]
  onSelectVessel?: (v: VesselOption) => void
}

export default function LocationSearch({
  query, onQueryChange, onSelectPlace,
  mode, onModeChange, radius, onRadiusChange, showRadius,
  hasPlace, onClear, loading, vessels, onSelectVessel,
}: Props) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex-1 relative">
          <PlaceAutocomplete
            value={query}
            onChange={onQueryChange}
            onSelect={(r) => onSelectPlace({ label: r.label, lat: r.lat, lon: r.lon, bbox: r.bbox, kind: r.kind, country: r.country })}
            vessels={vessels}
            onSelectVessel={onSelectVessel}
            placeholder={vessels ? 'Search a vessel or a place' : 'Search a place — city, sea, or country'}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
          )}
        </div>

        {showRadius && (
          <div className="flex items-center gap-2 sm:w-56">
            <input
              type="range"
              min={50}
              max={1000}
              step={50}
              value={radius}
              onChange={(e) => onRadiusChange(Number(e.target.value))}
              className="flex-1 accent-teal"
            />
            <span className="text-xs text-gray-500 whitespace-nowrap w-16 text-right">{radius} nm</span>
          </div>
        )}

        {hasPlace && (
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-gray-500 hover:text-navy underline whitespace-nowrap sm:ml-3"
          >
            Clear
          </button>
        )}
      </div>

      {/* Mode options appear once a place is chosen — what does "near {place}" mean? */}
      {hasPlace && (
        <div className="flex flex-col items-center gap-1.5 mt-3">
          <div className="inline-flex bg-gray-100 rounded-full p-1 gap-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => onModeChange(m.value)}
                title={m.hint}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  mode === m.value ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">{MODES.find((m) => m.value === mode)?.hint}</p>
        </div>
      )}
    </div>
  )
}
