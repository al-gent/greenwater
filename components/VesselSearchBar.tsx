'use client'

import type { ReactNode } from 'react'
import LocationSearch from './LocationSearch'
import AdvancedSearch, {
  type AdvancedFilters,
  EMPTY_ADVANCED,
  advancedActive,
  advancedCount,
} from './AdvancedSearch'
import type { VesselLocationSearch } from './useVesselLocationSearch'

interface Props {
  loc: VesselLocationSearch
  advanced: AdvancedFilters
  onAdvancedChange: (f: AdvancedFilters) => void
  showAdvanced: boolean
  onToggleAdvanced: () => void
  showMap: boolean
  onToggleMap: () => void
  /** Optional extra control to the right of the toggles (e.g. a Clear filters button). */
  trailing?: ReactNode
}

const TOGGLE_BASE = 'relative group p-2.5 rounded-xl border transition-colors'
const TOGGLE_ON = 'text-teal border-teal/30 bg-teal/5'
const TOGGLE_OFF = 'text-gray-400 border-gray-200 hover:text-gray-600 hover:bg-gray-50'
const TOOLTIP = 'pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap rounded bg-navy text-white text-[11px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity z-[1000]'

export default function VesselSearchBar({
  loc, advanced, onAdvancedChange, showAdvanced, onToggleAdvanced, showMap, onToggleMap, trailing,
}: Props) {
  const isAdvActive = advancedActive(advanced)

  return (
    <>
      <div className="mb-5">
        <div className="max-w-3xl mx-auto flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <LocationSearch
              query={loc.query}
              onQueryChange={loc.setQuery}
              onSelectPlace={loc.selectPlace}
              mode={loc.mode}
              onModeChange={loc.setMode}
              radius={loc.radius}
              onRadiusChange={loc.setRadius}
              showRadius={loc.radiusApplies}
              hasPlace={!!loc.place}
              onClear={loc.clear}
              loading={loc.loading}
            />
          </div>
          <div className="hidden sm:flex items-center gap-1.5 shrink-0 pt-0.5">
            <button
              onClick={onToggleAdvanced}
              title="Advanced search"
              aria-label="Advanced search"
              className={`${TOGGLE_BASE} ${showAdvanced || isAdvActive ? TOGGLE_ON : TOGGLE_OFF}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              {isAdvActive && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-4 h-4 bg-teal text-white text-[10px] font-bold rounded-full">
                  {advancedCount(advanced)}
                </span>
              )}
              <span className={TOOLTIP}>Advanced search</span>
            </button>
            <button
              onClick={onToggleMap}
              title={showMap ? 'Hide map' : 'Show map'}
              aria-label={showMap ? 'Hide map' : 'Show map'}
              className={`${TOGGLE_BASE} ${showMap ? TOGGLE_ON : TOGGLE_OFF}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span className={TOOLTIP}>{showMap ? 'Hide map' : 'Show map'}</span>
            </button>
            {trailing}
          </div>
        </div>
      </div>
      {showAdvanced && (
        <div className="hidden sm:block">
          <AdvancedSearch
            value={advanced}
            onChange={onAdvancedChange}
            onClear={() => onAdvancedChange(EMPTY_ADVANCED)}
          />
        </div>
      )}
    </>
  )
}
