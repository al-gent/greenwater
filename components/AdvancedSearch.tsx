'use client'

export interface AdvancedFilters {
  name: string
  minBerths: number
  iceBreaking: boolean
  features: string[]
}

export const EMPTY_ADVANCED: AdvancedFilters = {
  name: '',
  minBerths: 0,
  iceBreaking: false,
  features: [],
}

export const FEATURES = [
  { key: 'wetlab',    label: 'Wet laboratory' },
  { key: 'drylab',    label: 'Dry laboratory' },
  { key: 'ctd',       label: 'CTD equipment' },
  { key: 'multibeam', label: 'Multibeam sonar' },
  { key: 'rov',       label: 'ROV' },
  { key: 'auv',       label: 'AUV' },
  { key: 'diving',    label: 'Diving support' },
  { key: 'dp',        label: 'Dynamic positioning' },
  { key: 'coring',    label: 'Coring capability' },
]

interface Props {
  value: AdvancedFilters
  onChange: (f: AdvancedFilters) => void
  onClear: () => void
}

export default function AdvancedSearch({ value, onChange, onClear }: Props) {
  const toggleFeature = (key: string) => {
    const next = value.features.includes(key)
      ? value.features.filter((k) => k !== key)
      : [...value.features, key]
    onChange({ ...value, features: next })
  }

  const isActive =
    !!value.name ||
    value.minBerths > 0 ||
    value.iceBreaking ||
    value.features.length > 0

  return (
    <div className="w-full max-w-3xl mx-auto mt-3 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-5 space-y-5">

        {/* Row 1: Name */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Vessel name
          </label>
          <input
            type="text"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="e.g. Atlantis, Discovery…"
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-transparent"
          />
        </div>

        {/* Row 2: Berths + Ice breaking */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Minimum berths
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onChange({ ...value, minBerths: Math.max(0, value.minBerths - 1) })}
                disabled={value.minBerths === 0}
                className="w-9 h-9 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center hover:border-gray-400 disabled:opacity-30 text-lg font-light flex-shrink-0"
              >
                −
              </button>
              <span className="text-xl font-semibold text-navy w-6 text-center">{value.minBerths}</span>
              <button
                onClick={() => onChange({ ...value, minBerths: value.minBerths + 1 })}
                className="w-9 h-9 rounded-full border border-gray-300 text-gray-600 flex items-center justify-center hover:border-gray-400 text-lg font-light flex-shrink-0"
              >
                +
              </button>
              {value.minBerths > 0 && (
                <span className="text-sm text-gray-400">{value.minBerths}+ research berths</span>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Ice capability
            </label>
            <button
              onClick={() => onChange({ ...value, iceBreaking: !value.iceBreaking })}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                value.iceBreaking
                  ? 'border-teal bg-teal/5 text-teal'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span>🧊</span>
              Ice breaking / ice class
              {value.iceBreaking && (
                <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Row 3: Onboard features */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Onboard features
          </label>
          <div className="flex flex-wrap gap-2">
            {FEATURES.map((f) => {
              const active = value.features.includes(f.key)
              return (
                <button
                  key={f.key}
                  onClick={() => toggleFeature(f.key)}
                  className={`px-3.5 py-2 rounded-full border text-sm transition-colors ${
                    active
                      ? 'border-teal bg-teal text-white font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
                  }`}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Clear */}
        {isActive && (
          <div className="pt-1 border-t border-gray-100 flex justify-end">
            <button
              onClick={onClear}
              className="text-sm text-gray-400 hover:text-navy transition-colors"
            >
              Clear advanced filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
