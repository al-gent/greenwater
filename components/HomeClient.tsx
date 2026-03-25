'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { Vessel } from '@/lib/vessel-utils'
import { getPhotoUrl, toThumbnailUrl } from '@/lib/vessel-utils'
import SearchBar, { type SearchState } from './SearchBar'
import AdvancedSearch, { type AdvancedFilters, EMPTY_ADVANCED } from './AdvancedSearch'
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
  wetlab:    (v) => (v.Area_wetlab ?? 0) > 0,
  drylab:    (v) => (v.Area_drylab ?? 0) > 0,
  ctd:       (v) => !!v.CTD_cap,
  multibeam: (v) => !!v.Aquis_Multibeam,
  rov:       (v) => !!v.Underwater_vehicles_rov,
  auv:       (v) => !!v.Underwater_vehicles_auv,
  diving:    (v) => !!v.Diving_cap,
  dp:        (v) => !!v.DPos,
  coring:    (v) => !!v.Core_capable,
}

function applySearch(vessels: Vessel[], search: SearchState, advanced: AdvancedFilters): Vessel[] {
  return vessels.filter((v) => {
    if (search.where && v.country !== search.where) return false
    if (search.bunks > 0 && (!v.scientists || v.scientists < search.bunks)) return false
    if (advanced.name && !v.name.toLowerCase().includes(advanced.name.toLowerCase())) return false
    if (advanced.minBerths > 0 && (!v.scientists || v.scientists < advanced.minBerths)) return false
    if (advanced.iceBreaking) {
      const ice = (v.Ice_breaking ?? '').trim().toLowerCase()
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
  countries: string[]
  activities: string[]
}

export default function HomeClient({ vessels, countries }: HomeClientProps) {
  const [search, setSearch] = useState<SearchState>({ where: '', when: '', bunks: 0 })
  const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_ADVANCED)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showMap, setShowMap] = useState(false)

  const advancedActive = !!(advanced.name || advanced.minBerths > 0 || advanced.iceBreaking || advanced.features.length > 0)
  const hasSearch = !!(search.where || search.when || search.bunks > 0 || advancedActive)

  const withPhotos = useMemo(() => vessels.filter((v) => v.photo_url || v.photo_urls?.length), [vessels])
  const filtered = useMemo(() => applySearch(vessels, search, advanced), [vessels, search, advanced])
  const rows = useMemo(() => groupByCountry(withPhotos), [withPhotos])
  const mapVessels = useMemo(
    () => (hasSearch ? filtered : vessels).map((v) => ({ ...v, photoUrl: toThumbnailUrl(getPhotoUrl(v), 400, 75) })),
    [hasSearch, filtered, vessels]
  )

  return (
    <div className="pt-16 bg-white min-h-screen">

      {/* Search bar */}
      <div className="border-b border-gray-100 bg-white py-8 px-4">
        <SearchBar countries={countries} value={search} onChange={setSearch} />
        <div className="flex justify-center mt-3">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              showAdvanced || advancedActive ? 'text-teal font-medium' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Advanced search
            {advancedActive && (
              <span className="inline-flex items-center justify-center w-4 h-4 bg-teal text-white text-[10px] font-bold rounded-full">
                {[!!advanced.name, advanced.minBerths > 0, advanced.iceBreaking, ...advanced.features.map(() => true)].filter(Boolean).length}
              </span>
            )}
            <svg
              className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
        {showAdvanced && (
          <AdvancedSearch
            value={advanced}
            onChange={setAdvanced}
            onClear={() => setAdvanced(EMPTY_ADVANCED)}
          />
        )}
      </div>

      {/* Map (toggleable) */}
      {showMap && (
        <div style={{ height: '420px' }} className="w-full border-b border-gray-100">
          <HomeMap vessels={mapVessels} />
        </div>
      )}

      {/* Map toggle + result count */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2 flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {hasSearch ? (
            <>
              <span className="font-semibold text-navy">{filtered.length}</span> vessel{filtered.length !== 1 ? 's' : ''} found
              {search.bunks > 0 && ` · ${search.bunks}+ research bunks`}
            </>
          ) : (
            <span className="font-semibold text-navy">{vessels.length}</span>
          ) }
          {!hasSearch && ' featured vessels'}
        </p>
        <div className="flex items-center gap-3">
          {hasSearch && (
            <button
              onClick={() => { setSearch({ where: '', when: '', bunks: 0 }); setAdvanced(EMPTY_ADVANCED) }}
              className="text-sm text-gray-500 hover:text-navy underline"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setShowMap((v) => !v)}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border transition-all ${
              showMap ? 'bg-navy text-white border-navy' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            {showMap ? 'Hide map' : 'Show map'}
          </button>
        </div>
      </div>

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
              <p className="text-sm text-gray-400 mb-4">Try a different location or fewer bunks.</p>
              <button
                onClick={() => { setSearch({ where: '', when: '', bunks: 0 }); setAdvanced(EMPTY_ADVANCED) }}
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
          {rows.map(({ country, vessels: rowVessels }) => (
            <VesselRow
              key={country}
              title={`Research vessels in ${country}`}
              subtitle={COUNTRY_SUBTITLES[country]}
              vessels={rowVessels}
            />
          ))}
        </div>
      )}
    </div>
  )
}
