'use client'

import type { FilterState } from '@/lib/vessel-utils'

interface FilterBarProps {
  countries: string[]
  activities: string[]
  filters: FilterState
  onChange: (f: FilterState) => void
  totalCount: number
  filteredCount: number
}

export default function FilterBar({
  countries,
  activities,
  filters,
  onChange,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const hasFilters = filters.country || filters.activity || filters.minScientists > 0

  return (
    <div className="bg-white border-b border-gray-100 sticky top-16 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Country */}
          <div className="flex-1 min-w-[140px] max-w-[200px]">
            <select
              value={filters.country}
              onChange={(e) => onChange({ ...filters, country: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent bg-white text-gray-700 cursor-pointer"
            >
              <option value="">All Countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Activity */}
          <div className="flex-1 min-w-[160px] max-w-[260px]">
            <select
              value={filters.activity}
              onChange={(e) => onChange({ ...filters, activity: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent bg-white text-gray-700 cursor-pointer"
            >
              <option value="">All Activity Types</option>
              {activities.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Min Scientists Slider */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm text-gray-500 whitespace-nowrap hidden sm:inline">
              Min bunks:
            </span>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={filters.minScientists}
              onChange={(e) =>
                onChange({ ...filters, minScientists: Number(e.target.value) })
              }
              className="w-24 accent-teal cursor-pointer"
            />
            <span className="text-sm font-semibold text-navy w-6 text-center">
              {filters.minScientists > 0 ? filters.minScientists : '—'}
            </span>
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => onChange({ country: '', activity: '', minScientists: 0 })}
              className="text-sm text-teal font-medium hover:text-teal-500 transition-colors flex items-center gap-1 flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}

          {/* Count */}
          <div className="ml-auto text-sm text-gray-400 flex-shrink-0 hidden md:block">
            <span className="font-semibold text-navy">{filteredCount}</span>{' '}
            of {totalCount} vessels
          </div>
        </div>
      </div>
    </div>
  )
}
