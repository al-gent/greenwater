'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Vessel } from '@/lib/vessel-utils'
import { getPhotoUrl } from '@/lib/vessel-utils'
import { type SearchMode } from './LocationSearch'
import { type AdvancedFilters, EMPTY_ADVANCED, advancedActive } from './AdvancedSearch'
import VesselSearchBar from './VesselSearchBar'
import { useVesselLocationSearch, type Place } from './useVesselLocationSearch'
import VesselCard from './VesselCard'
import VesselRow from './VesselRow'

const HomeMap = dynamic(() => import('./HomeMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-lightblue-100 flex items-center justify-center">
      <svg className="w-6 h-6 animate-spin opacity-30 text-navy" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  ),
})

const ICE_NO_VALUES = new Set(['no', 'none', 'none.', 'negative', 'n/a', '-', ''])

const FEATURE_CHECKS: Record<string, (v: Vessel) => boolean> = {
  wetlab:    (v) => (v.area_wetlab ?? 0) > 0,
  drylab:    (v) => (v.area_drylab ?? 0) > 0,
  ctd:       (v) => !!v.ctd_cap,
  multibeam: (v) => !!v.aquis_multibeam,
  rov:       (v) => !!v.underwater_vehicles_rov,
  auv:       (v) => !!v.underwater_vehicles_auv,
  diving:    (v) => !!v.diving_cap,
  dp:        (v) => !!v.dpos,
  coring:    (v) => !!v.core_capable,
}

function applySearch(vessels: Vessel[], advanced: AdvancedFilters, locationIds: Set<number> | null): Vessel[] {
  return vessels.filter((v) => {
    if (locationIds && !locationIds.has(v.id)) return false
    if (advanced.name && !v.name.toLowerCase().includes(advanced.name.toLowerCase())) return false
    if (advanced.minBerths > 0 && (!v.scientists || v.scientists < advanced.minBerths)) return false
    if (advanced.minEndurance > 0) {
      const endurance = parseInt(v.endurance ?? '', 10)
      if (!endurance || endurance < advanced.minEndurance) return false
    }
    if (advanced.minLength > 0 && (!v.length || v.length < advanced.minLength)) return false
    if (advanced.maxLength > 0 && (!v.length || v.length > advanced.maxLength)) return false
    if (advanced.iceBreaking) {
      const ice = (v.ice_breaking ?? '').trim().toLowerCase()
      if (!ice || ICE_NO_VALUES.has(ice)) return false
    }
    for (const key of advanced.features) {
      if (FEATURE_CHECKS[key] && !FEATURE_CHECKS[key](v)) return false
    }
    return true
  })
}

// Group vessels by country, return rows with ≥ 3 vessels, sorted by size desc
function groupByCountry(vessels: Vessel[]): Array<{ country: string; vessels: Vessel[] }> {
  const map = new Map<string, Vessel[]>()
  for (const v of vessels) {
    const c = v.country ?? 'Other'
    if (!map.has(c)) map.set(c, [])
    map.get(c)!.push(v)
  }
  return Array.from(map.entries())
    .filter(([, vs]) => vs.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([country, vs]) => ({ country, vessels: vs }))
}

const COUNTRY_SUBTITLES: Record<string, string> = {
  USA: 'American research fleet',
  UK: 'British research vessels',
  Norway: 'Nordic ocean science',
  Australia: 'Southern hemisphere fleet',
  Germany: 'German research fleet',
  France: 'French oceanographic vessels',
  Canada: 'Canadian research fleet',
  Russia: 'Russian oceanographic ships',
  Netherlands: 'Dutch research vessels',
  Spain: 'Spanish marine research',
  Sweden: 'Swedish research fleet',
  Denmark: 'Danish oceanographic vessels',
  Italy: 'Italian research fleet',
}

interface HomeClientProps {
  vessels: Vessel[]
}

function parseAdvancedFromParams(p: URLSearchParams): AdvancedFilters {
  const features = p.get('features')
  return {
    name: p.get('name') ?? '',
    minBerths: parseInt(p.get('minBerths') ?? '0', 10) || 0,
    minEndurance: parseInt(p.get('endurance') ?? '0', 10) || 0,
    minLength: parseInt(p.get('minLength') ?? '0', 10) || 0,
    maxLength: parseInt(p.get('maxLength') ?? '0', 10) || 0,
    iceBreaking: p.get('ice') === '1',
    features: features ? features.split(',').filter(Boolean) : [],
  }
}

interface LocationState {
  query: string
  place: Place | null
  mode: SearchMode
  radius: number
}

function parseLocationFromParams(p: URLSearchParams): LocationState {
  const lat = parseFloat(p.get('lat') ?? '')
  const lon = parseFloat(p.get('lon') ?? '')
  const has = !isNaN(lat) && !isNaN(lon)
  const label = p.get('loc') ?? ''
  const bboxRaw = (p.get('bbox') ?? '').split(',').map(Number)
  const bbox = bboxRaw.length === 4 && bboxRaw.every((n) => !isNaN(n))
    ? (bboxRaw as [number, number, number, number])
    : undefined
  return {
    query: label,
    place: has ? { label, lat, lon, bbox } : null,
    mode: (p.get('smode') as SearchMode) || 'last_port',
    radius: parseInt(p.get('radius') ?? '250', 10) || 250,
  }
}

function buildQueryString(advanced: AdvancedFilters, loc: LocationState): string {
  const p = new URLSearchParams()
  if (advanced.name) p.set('name', advanced.name)
  if (advanced.minBerths > 0) p.set('minBerths', String(advanced.minBerths))
  if (advanced.minEndurance > 0) p.set('endurance', String(advanced.minEndurance))
  if (advanced.minLength > 0) p.set('minLength', String(advanced.minLength))
  if (advanced.maxLength > 0) p.set('maxLength', String(advanced.maxLength))
  if (advanced.iceBreaking) p.set('ice', '1')
  if (advanced.features.length > 0) p.set('features', advanced.features.join(','))
  if (loc.place) {
    p.set('loc', loc.place.label)
    p.set('lat', String(loc.place.lat))
    p.set('lon', String(loc.place.lon))
    if (loc.mode !== 'last_port') p.set('smode', loc.mode) // last_port is the default
    if (loc.mode === 'operating_area') {
      p.set('radius', String(loc.radius))
    } else {
      if (loc.place.bbox) p.set('bbox', loc.place.bbox.join(','))
      p.set('radius', String(loc.radius))
    }
  }
  return p.toString()
}

export default function HomeClient({ vessels }: HomeClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [advanced, setAdvanced] = useState<AdvancedFilters>(() => parseAdvancedFromParams(searchParams))
  const [showAdvanced, setShowAdvanced] = useState(() => {
    const a = parseAdvancedFromParams(searchParams)
    return !!(a.name || a.minBerths > 0 || a.minEndurance > 0 || a.minLength > 0 || a.maxLength > 0 || a.iceBreaking || a.features.length > 0)
  })
  const [showMap, setShowMap] = useState(true)
  const loc = useVesselLocationSearch(parseLocationFromParams(searchParams))

  // Keep the URL in sync so the search survives back/refresh.
  useEffect(() => {
    const qs = buildQueryString(advanced, { query: loc.query, place: loc.place, mode: loc.mode, radius: loc.radius })
    const next = qs ? `${pathname}?${qs}` : pathname
    const current = window.location.pathname + window.location.search
    if (next !== current) {
      router.replace(next, { scroll: false })
    }
  }, [advanced, loc.place, loc.mode, loc.radius, loc.query, pathname, router])

  const isAdvancedActive = advancedActive(advanced)
  const hasSearch = !!(isAdvancedActive || loc.place)

  const withPhotos = useMemo(() => vessels.filter((v) => v.photo_urls?.length), [vessels])
  const filtered = useMemo(() => applySearch(vessels, advanced, loc.match?.ids ?? null), [vessels, advanced, loc.match])
  const rows = useMemo(() => groupByCountry(withPhotos), [withPhotos])
  const mapVessels = useMemo(
    () => (hasSearch ? filtered : vessels).map((v) => ({ ...v, photoUrl: getPhotoUrl(v) })),
    [hasSearch, filtered, vessels]
  )

  return (
    <div className="pt-[88px] bg-white min-h-screen">

      {/* Search bar */}
      <div className="border-b border-gray-100 bg-white py-8 px-4">
        <VesselSearchBar
          loc={loc}
          advanced={advanced}
          onAdvancedChange={setAdvanced}
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced((v) => !v)}
          showMap={showMap}
          onToggleMap={() => setShowMap((v) => !v)}
        />
      </div>

      {/* Map (toggleable) */}
      {showMap && (
        <div style={{ height: '420px' }} className="w-full border-b border-gray-100">
          <HomeMap
            vessels={mapVessels}
            searchPlace={loc.place ? {
              lat: loc.place.lat,
              lon: loc.place.lon,
              label: loc.place.label,
              // operating-area is point-based (distance to polygon), so always a circle
              bbox: loc.mode === 'operating_area' ? undefined : loc.place.bbox,
              radiusNm: loc.radiusApplies ? loc.radius : undefined,
            } : undefined}
          />
        </div>
      )}

      {/* Result count + clear */}
      {hasSearch && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2 flex items-center justify-between">
          <p className="text-sm text-gray-400">
            <span className="font-semibold text-navy">{filtered.length}</span> vessel{filtered.length !== 1 ? 's' : ''} found
            {loc.match && ` · ${loc.match.mode === 'operating_area' ? 'operating near' : loc.match.mode === 'home_port' ? 'based near' : 'last seen near'} ${loc.match.label}`}
            {advanced.minBerths > 0 && ` · ${advanced.minBerths}+ berths`}
            {advanced.minEndurance > 0 && ` · ${advanced.minEndurance}+ days endurance`}
          </p>
          <button
            onClick={() => { setAdvanced(EMPTY_ADVANCED); loc.clear() }}
            className="text-sm text-gray-500 hover:text-navy underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Search results (flat grid) ── */}
      {hasSearch && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-navy mb-1">No vessels found</h3>
              <p className="text-sm text-gray-400 mb-4">Try a different location or fewer filters.</p>
              <button
                onClick={() => { setAdvanced(EMPTY_ADVANCED); loc.clear() }}
                className="bg-navy text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-navy-600 transition-colors"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((v) => (
                <VesselCard key={v.id} vessel={v} photoUrl={getPhotoUrl(v)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Default: rows by country ── */}
      {!hasSearch && (
        <div className="py-6">
          {rows.slice(0, 5).map(({ country, vessels: rowVessels }) => (
            <VesselRow
              key={country}
              title={`Research vessels from ${country}`}
              subtitle={COUNTRY_SUBTITLES[country]}
              vessels={rowVessels}
              href={`/vessels?country=${encodeURIComponent(country)}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
