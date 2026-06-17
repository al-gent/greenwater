'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { Vessel } from '@/lib/vessel-utils'
import { getPhotoUrl } from '@/lib/vessel-utils'
import { type AdvancedFilters, EMPTY_ADVANCED, advancedActive } from './AdvancedSearch'
import VesselSearchBar from './VesselSearchBar'
import { useVesselLocationSearch } from './useVesselLocationSearch'
import VesselCard from './VesselCard'

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

function applySearch(
  vessels: Vessel[],
  advanced: AdvancedFilters,
  locationIds: Set<number> | null,
  country: string,
): Vessel[] {
  return vessels.filter((v) => {
    if (country && v.country !== country) return false
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

interface BrowseClientProps {
  vessels: Vessel[]
  initialCountry?: string
}

export default function BrowseClient({ vessels, initialCountry = '' }: BrowseClientProps) {
  const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_ADVANCED)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [country, setCountry] = useState(initialCountry)

  const loc = useVesselLocationSearch()

  const hasFilters = !!(advancedActive(advanced) || loc.place || country)

  const clearAll = () => {
    setAdvanced(EMPTY_ADVANCED)
    setCountry('')
    loc.clear()
  }

  const filtered = useMemo(
    () => applySearch(vessels, advanced, loc.match?.ids ?? null, country),
    [vessels, advanced, loc.match, country],
  )

  // Vessels with photos sort to the top so the grid looks good above the fold.
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aHas = (a.photo_urls?.length ?? 0) > 0 ? 1 : 0
      const bHas = (b.photo_urls?.length ?? 0) > 0 ? 1 : 0
      if (aHas !== bHas) return bHas - aHas
      return a.name.localeCompare(b.name)
    })
  }, [filtered])

  const mapVessels = useMemo(
    () => filtered.map((v) => ({ ...v, photoUrl: getPhotoUrl(v) })),
    [filtered],
  )

  const heading = country ? `Research vessels from ${country}` : 'Browse all research vessels'

  return (
    <div className="pt-[88px] bg-white min-h-screen">

      {/* Page heading */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-navy">{heading}</h1>
        <p className="text-sm text-gray-500 mt-1">
          <span className="font-semibold text-navy">{filtered.length}</span> of {vessels.length} vessels shown
        </p>
      </div>

      {/* Search */}
      <div className="bg-white pt-6 pb-8 px-4">
        <VesselSearchBar
          loc={loc}
          advanced={advanced}
          onAdvancedChange={setAdvanced}
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced((v) => !v)}
          showMap={showMap}
          onToggleMap={() => setShowMap((v) => !v)}
          trailing={hasFilters ? (
            <button
              onClick={clearAll}
              className="ml-1 text-sm text-gray-500 hover:text-navy underline transition-colors"
            >
              Clear filters
            </button>
          ) : undefined}
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
              bbox: loc.mode === 'operating_area' ? undefined : loc.place.bbox,
              radiusNm: loc.radiusApplies ? loc.radius : undefined,
            } : undefined}
          />
        </div>
      )}

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-navy mb-1">No vessels match those filters</h3>
            <p className="text-sm text-gray-400 mb-4">Try a different location or fewer filters.</p>
            <button
              onClick={clearAll}
              className="bg-navy text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-navy-600 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sorted.map((v) => (
              <VesselCard key={v.id} vessel={v} photoUrl={getPhotoUrl(v)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
