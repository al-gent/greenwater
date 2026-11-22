'use client'

import { useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import PlaceAutocomplete, { type PlaceResult, type VesselOption } from './PlaceAutocomplete'

function SearchIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" />
  </svg>
}

export default function HeaderSearch({ onOpen }: { onOpen: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const [vessels, setVessels] = useState<VesselOption[]>([])
  const [namesUnavailable, setNamesUnavailable] = useState(false)
  const namesRequest = useRef<Promise<void> | null>(null)

  function loadNames() {
    if (namesRequest.current) return
    setNamesUnavailable(false)
    namesRequest.current = fetch('/api/vessels/names').then(async response => {
      if (!response.ok) throw new Error('Vessel names unavailable')
      setVessels(await response.json())
    }).catch(() => { namesRequest.current = null; setNamesUnavailable(true) })
  }

  function navigate(href: string) {
    setQuery('')
    // Directory filters are initialized from the URL when its component mounts.
    if (pathname === '/vessels' && href.startsWith('/vessels?')) window.location.assign(href)
    else router.push(href)
  }

  function openPlace(place: PlaceResult) {
    const params = new URLSearchParams(pathname === '/vessels' ? window.location.search : '')
    for (const key of ['mlat', 'mlon', 'mz', 'placeCountry', 'bbox']) params.delete(key)
    if (params.get('view') !== 'list') params.set('view', 'card')
    params.set('map', '1')
    params.set('loc', place.label)
    params.set('lat', String(place.lat))
    params.set('lon', String(place.lon))
    if (place.kind === 'country') params.set('placeCountry', place.country || place.name)
    if (place.bbox) params.set('bbox', place.bbox.join(','))
    navigate(`/vessels?${params}`)
  }

  return <div role="search" aria-label="VesselConnect" className="relative min-w-0 max-w-60 flex-1 lg:max-w-48 xl:max-w-60"
    onFocusCapture={() => { onOpen(); loadNames() }}
    onKeyDown={event => { if (event.key === 'Escape') setQuery('') }}>
    <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-500"><SearchIcon /></span>
    <PlaceAutocomplete value={query} onChange={value => { setQuery(value); if (value.trim().length >= 2) loadNames() }} vessels={vessels} onSelect={openPlace}
      onSelectVessel={vessel => navigate(`/vessels/${vessel.id}`)} placeholder="Search VesselConnect" ariaLabel="Search vessels and locations"
      unavailableHint={namesUnavailable ? 'Vessel names are temporarily unavailable.' : undefined}
      className="h-10 w-full rounded-full bg-gray-100 pl-10 pr-3 text-base text-navy placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal lg:text-sm" />
  </div>
}
