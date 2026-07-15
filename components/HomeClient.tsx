'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Vessel } from '@/lib/vessel-utils'
import { getPhotoUrl, stripHtml } from '@/lib/vessel-utils'
import { type SearchMode } from './LocationSearch'
import { type AdvancedFilters, EMPTY_ADVANCED, advancedActive, normalizeHull } from './AdvancedSearch'
import VesselSearchBar from './VesselSearchBar'
import { useVesselLocationSearch, type Place } from './useVesselLocationSearch'
import VesselCard from './VesselCard'
import VesselFeaturedCard from './VesselFeaturedCard'
import VesselList, { sortVessels, type SortKey, type SortDir } from './VesselList'

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
const PAGE_SIZE = 24

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
  const nameKw = advanced.name.trim().toLowerCase()
  const activityKw = advanced.activity.trim().toLowerCase()
  const affiliationKw = advanced.affiliation.trim().toLowerCase()
  return vessels.filter((v) => {
    if (locationIds && !locationIds.has(v.id)) return false
    if (advanced.flag && v.country !== advanced.flag) return false
    if (advanced.hull && normalizeHull(v.hull_material) !== advanced.hull) return false
    if (nameKw && !v.name.toLowerCase().includes(nameKw)) return false
    if (activityKw && !stripHtml(v.main_activity ?? '').toLowerCase().includes(activityKw)) return false
    if (affiliationKw && !(v.affiliation ?? '').toLowerCase().includes(affiliationKw)) return false
    if (advanced.minBerths > 0 && (!v.scientists || v.scientists < advanced.minBerths)) return false
    if (advanced.minEndurance > 0) {
      const endurance = parseInt(v.endurance ?? '', 10)
      if (!endurance || endurance < advanced.minEndurance) return false
    }
    if (advanced.minLength > 0 && (!v.length || v.length < advanced.minLength)) return false
    if (advanced.maxLength > 0 && (!v.length || v.length > advanced.maxLength)) return false
    if (advanced.maxDraft > 0 && (v.draft == null || v.draft > advanced.maxDraft)) return false
    if (advanced.minSpeed > 0 && (v.speed_cruise == null || v.speed_cruise < advanced.minSpeed)) return false
    if (advanced.builtAfter > 0 && (v.year_built == null || v.year_built < advanced.builtAfter)) return false
    if (advanced.iceBreaking) {
      const ice = (v.ice_breaking ?? '').trim().toLowerCase()
      if (!ice || ICE_NO_VALUES.has(ice)) return false
    }
    if (advanced.voo && v.vessel_of_opportunity !== true) return false
    for (const key of advanced.features) {
      if (FEATURE_CHECKS[key] && !FEATURE_CHECKS[key](v)) return false
    }
    return true
  })
}

type ViewMode = 'card' | 'list' | 'featured'

// "Featured" = complete enough to render a rich card with no blanks. The required
// fields ARE the fields the featured card shows (see VesselFeaturedCard).
function isFeatured(v: Vessel): boolean {
  return (
    (v.photo_urls?.length ?? 0) > 0 &&
    v.length != null &&
    v.scientists != null &&
    v.draft != null &&
    !!(v.endurance ?? '').trim() &&
    !!(v.last_port_city || v.port_city) &&
    !!v.affiliation &&
    !!stripHtml(v.main_activity ?? '').trim()
  )
}

interface HomeClientProps {
  vessels: Vessel[]
}

function parseAdvancedFromParams(p: URLSearchParams): AdvancedFilters {
  const features = p.get('features')
  return {
    name: p.get('name') ?? '',
    activity: p.get('activity') ?? '',
    affiliation: p.get('affiliation') ?? '',
    flag: p.get('flag') ?? p.get('country') ?? '', // accept legacy ?country= from old /vessels links
    hull: p.get('hull') ?? '',
    minBerths: parseInt(p.get('minBerths') ?? '0', 10) || 0,
    minEndurance: parseInt(p.get('endurance') ?? '0', 10) || 0,
    minLength: parseInt(p.get('minLength') ?? '0', 10) || 0,
    maxLength: parseInt(p.get('maxLength') ?? '0', 10) || 0,
    maxDraft: parseFloat(p.get('maxDraft') ?? '0') || 0,
    minSpeed: parseFloat(p.get('minSpeed') ?? '0') || 0,
    builtAfter: parseInt(p.get('builtAfter') ?? '0', 10) || 0,
    iceBreaking: p.get('ice') === '1',
    voo: p.get('voo') === '1',
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

function buildQueryString(advanced: AdvancedFilters, loc: LocationState, view: ViewMode, sort: { key: SortKey; dir: SortDir }): string {
  const p = new URLSearchParams()
  if (view !== 'featured') p.set('view', view) // featured is the default
  if (sort.key !== 'name' || sort.dir !== 'asc') p.set('sort', `${sort.key}:${sort.dir}`)
  if (advanced.name) p.set('name', advanced.name)
  if (advanced.activity) p.set('activity', advanced.activity)
  if (advanced.affiliation) p.set('affiliation', advanced.affiliation)
  if (advanced.flag) p.set('flag', advanced.flag)
  if (advanced.hull) p.set('hull', advanced.hull)
  if (advanced.minBerths > 0) p.set('minBerths', String(advanced.minBerths))
  if (advanced.minEndurance > 0) p.set('endurance', String(advanced.minEndurance))
  if (advanced.minLength > 0) p.set('minLength', String(advanced.minLength))
  if (advanced.maxLength > 0) p.set('maxLength', String(advanced.maxLength))
  if (advanced.maxDraft > 0) p.set('maxDraft', String(advanced.maxDraft))
  if (advanced.minSpeed > 0) p.set('minSpeed', String(advanced.minSpeed))
  if (advanced.builtAfter > 0) p.set('builtAfter', String(advanced.builtAfter))
  if (advanced.iceBreaking) p.set('ice', '1')
  if (advanced.voo) p.set('voo', '1')
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

const SORT_KEYS: SortKey[] = ['name', 'flag', 'affiliation', 'location', 'length', 'scientists', 'draft', 'endurance']

function parseViewFromParams(p: URLSearchParams): ViewMode {
  const v = p.get('view')
  return v === 'card' || v === 'list' ? v : 'featured'
}

function parseSortFromParams(p: URLSearchParams): { key: SortKey; dir: SortDir } {
  const [key, dir] = (p.get('sort') ?? '').split(':')
  if (SORT_KEYS.includes(key as SortKey)) return { key: key as SortKey, dir: dir === 'desc' ? 'desc' : 'asc' }
  return { key: 'name', dir: 'asc' }
}

// Featured renders as a text label; the rest as icons. Featured is first + default.
const ICON_VIEWS: { value: ViewMode; label: string; icon: JSX.Element }[] = [
  { value: 'card', label: 'Cards', icon: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM13 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1V5zM4 14a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5zM13 14a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1v-5z" />
  ) },
  { value: 'list', label: 'List', icon: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  ) },
]

export default function HomeClient({ vessels }: HomeClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [advanced, setAdvanced] = useState<AdvancedFilters>(() => parseAdvancedFromParams(searchParams))
  const [showAdvanced, setShowAdvanced] = useState(() => advancedActive(parseAdvancedFromParams(searchParams)))
  const [showMap, setShowMap] = useState(false)
  const [view, setView] = useState<ViewMode>(() => parseViewFromParams(searchParams))
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [listSort, setListSort] = useState<{ key: SortKey; dir: SortDir }>(() => parseSortFromParams(searchParams))
  const onSort = (key: SortKey) =>
    setListSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  const loc = useVesselLocationSearch(parseLocationFromParams(searchParams))

  // Keep the URL in sync so the search survives back/refresh.
  useEffect(() => {
    const qs = buildQueryString(advanced, { query: loc.query, place: loc.place, mode: loc.mode, radius: loc.radius }, view, listSort)
    const next = qs ? `${pathname}?${qs}` : pathname
    const current = window.location.pathname + window.location.search
    if (next !== current) router.replace(next, { scroll: false })
  }, [advanced, loc.place, loc.mode, loc.radius, loc.query, view, listSort, pathname, router])

  const isAdvancedActive = advancedActive(advanced)
  const hasFilters = !!(isAdvancedActive || loc.place)

  // Featured is only the landing state — drop into Cards the moment a search/filter
  // is active, so results show every match (not just the complete-data subset).
  useEffect(() => {
    if (hasFilters && view === 'featured') setView('card')
  }, [hasFilters, view])

  // Searching a location reveals the map so the pin/area is visible.
  useEffect(() => {
    if (loc.place) setShowMap(true)
  }, [loc.place])

  // distinct flags for the dropdown — derived from the vessels we already have
  const flags = useMemo(
    () => Array.from(new Set(vessels.map((v) => v.country).filter(Boolean) as string[])).sort(),
    [vessels],
  )

  const filtered = useMemo(() => applySearch(vessels, advanced, loc.match?.ids ?? null), [vessels, advanced, loc.match])
  // photos-first so the grid looks good above the fold
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ap = (a.photo_urls?.length ?? 0) > 0 ? 1 : 0
      const bp = (b.photo_urls?.length ?? 0) > 0 ? 1 : 0
      if (ap !== bp) return bp - ap
      return a.name.localeCompare(b.name)
    })
  }, [filtered])
  const mapVessels = useMemo(() => filtered.map((v) => ({ ...v, photoUrl: getPhotoUrl(v) })), [filtered])
  const featured = useMemo(() => sorted.filter(isFeatured), [sorted])
  const displayed = useMemo(() => {
    if (view === 'featured') return featured
    if (view === 'list') return sortVessels(filtered, listSort.key, listSort.dir) // column sort, not photos-first
    return sorted
  }, [view, featured, filtered, sorted, listSort])

  // reset pagination whenever the displayed set changes
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [displayed])

  // infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleCount((c) => c + PAGE_SIZE) },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [view, displayed.length])

  const clearAll = () => { setAdvanced(EMPTY_ADVANCED); loc.clear() }
  const visible = displayed.slice(0, visibleCount)

  return (
    <div className="pt-[88px] bg-white min-h-screen">

      {/* Map (default on, toggleable) */}
      {showMap && (
        <div style={{ height: '420px' }} className="w-full border-b border-gray-100">
          <HomeMap
            vessels={mapVessels}
            searchPlace={loc.place ? {
              lat: loc.place.lat,
              lon: loc.place.lon,
              label: loc.place.label,
              bbox: loc.mode === 'operating_area' ? undefined : loc.place.bbox,
              radiusNm: loc.radiusApplies ? loc.radius : undefined,
            } : undefined}
          />
        </div>
      )}

      {/* Search bar (below the map, above the results) */}
      <div className="border-b border-gray-100 bg-white py-6 px-4">
        <VesselSearchBar
          loc={loc}
          advanced={advanced}
          onAdvancedChange={setAdvanced}
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced((v) => !v)}
          showMap={showMap}
          onToggleMap={() => setShowMap((v) => !v)}
          countries={flags}
        />
      </div>

      {/* Results header: count · view switcher · clear */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-400 min-w-0 truncate">
          {loc.match && `${loc.match.mode === 'operating_area' ? 'Operating near' : loc.match.mode === 'home_port' ? 'Based near' : 'Last seen near'} ${loc.match.label}`}
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          {hasFilters && (
            <button onClick={clearAll} className="text-sm text-gray-500 hover:text-navy underline">Clear</button>
          )}
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {ICON_VIEWS.map((vw) => (
              <button
                key={vw.value}
                onClick={() => setView(vw.value)}
                title={vw.label}
                aria-label={vw.label}
                className={`p-1.5 rounded-md transition-colors ${view === vw.value ? 'bg-white text-navy shadow-sm' : 'text-gray-400 hover:text-navy'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  {vw.icon}
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-navy mb-1">
              {view === 'featured' ? 'No featured vessels in these results' : 'No vessels match those filters'}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {view === 'featured' ? 'Featured vessels have a photo and complete specs.' : 'Try a different location or fewer filters.'}
            </p>
            <button onClick={clearAll} className="bg-navy text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-navy-600 transition-colors">
              Clear search
            </button>
          </div>
        ) : view === 'list' ? (
          <>
            <VesselList vessels={visible} sortKey={listSort.key} sortDir={listSort.dir} onSort={onSort} />
            {visible.length < displayed.length && <div ref={sentinelRef} className="h-10" />}
          </>
        ) : view === 'featured' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {visible.map((v) => (
                <VesselFeaturedCard key={v.id} vessel={v} photoUrl={getPhotoUrl(v)} />
              ))}
            </div>
            {visible.length < displayed.length && <div ref={sentinelRef} className="h-10" />}
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {visible.map((v) => (
                <VesselCard key={v.id} vessel={v} photoUrl={getPhotoUrl(v)} />
              ))}
            </div>
            {visible.length < displayed.length && <div ref={sentinelRef} className="h-10" />}
          </>
        )}
      </div>
    </div>
  )
}
