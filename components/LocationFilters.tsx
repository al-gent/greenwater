import { useState } from 'react'
import PlaceAutocomplete from './PlaceAutocomplete'
import VesselFilterGroup from './VesselFilterGroup'
import type { SearchMode, VesselLocationSearch } from './useVesselLocationSearch'

const MODES: { value: SearchMode; label: string; hint: string }[] = [
  { value: 'operating_area', label: 'Operating area', hint: 'Vessels that work in this area' },
  { value: 'home_port', label: 'Home port', hint: 'Vessels based near here' },
  { value: 'last_port', label: 'Near now', hint: 'Vessels last seen near here' },
]

export default function LocationFilters({ location }: { location: VesselLocationSearch }) {
  const [query, setQuery] = useState('')

  return (
    <VesselFilterGroup title="Location" initiallyOpen>
      {location.place ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-navy">{location.place.label}</p>
            <button type="button" onClick={location.clear} className="text-sm text-teal hover:underline" aria-label="Clear location">Clear</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MODES.map(({ value, label, hint }) => (
              <button key={value} type="button" title={hint} aria-pressed={location.mode === value} onClick={() => location.setMode(value)} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-sm text-gray-600 aria-pressed:bg-navy aria-pressed:text-white">{label}</button>
            ))}
          </div>
          {location.radiusApplies && (
            <label className="block text-sm text-gray-600">
              Search radius · {location.radius} nm
              <input type="range" min={50} max={1000} step={50} value={location.radius} onChange={event => location.setRadius(Number(event.target.value))} className="mt-1 block w-full accent-teal" />
            </label>
          )}
        </>
      ) : (
        <PlaceAutocomplete
          value={query}
          onChange={setQuery}
          onSelect={place => {
            location.selectPlace(place)
            setQuery('')
          }}
          ariaLabel="Search for a location"
          placeholder="Search for a place"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40"
        />
      )}
    </VesselFilterGroup>
  )
}
