'use client'

export interface AdvancedFilters {
  name: string
  activity: string
  affiliation: string
  flag: string
  minBerths: number
  minEndurance: number
  minLength: number
  maxLength: number
  maxDraft: number
  minSpeed: number
  builtAfter: number
  hull: string
  iceBreaking: boolean
  voo: boolean // vessels of opportunity only
  features: string[]
}

export const EMPTY_ADVANCED: AdvancedFilters = {
  name: '',
  activity: '',
  affiliation: '',
  flag: '',
  minBerths: 0,
  minEndurance: 0,
  minLength: 0,
  maxLength: 0,
  maxDraft: 0,
  minSpeed: 0,
  builtAfter: 0,
  hull: '',
  iceBreaking: false,
  voo: false,
  features: [],
}

/** True if any advanced filter is set. */
export function advancedActive(f: AdvancedFilters): boolean {
  return (
    !!f.name || !!f.activity || !!f.affiliation || !!f.flag || !!f.hull ||
    f.minBerths > 0 || f.minEndurance > 0 ||
    f.minLength > 0 || f.maxLength > 0 || f.maxDraft > 0 ||
    f.minSpeed > 0 || f.builtAfter > 0 ||
    f.iceBreaking || f.voo || f.features.length > 0
  )
}

/** Count of active advanced filter groups (for the badge). */
export function advancedCount(f: AdvancedFilters): number {
  return [
    !!f.name, !!f.activity, !!f.affiliation, !!f.flag, !!f.hull,
    f.minBerths > 0, f.minEndurance > 0,
    f.minLength > 0 || f.maxLength > 0, f.maxDraft > 0,
    f.minSpeed > 0, f.builtAfter > 0,
    f.iceBreaking, f.voo,
    ...f.features.map(() => true),
  ].filter(Boolean).length
}

// Capability fields kept at ≥15% coverage; sparser ones (ROV/AUV/diving/DP/coring)
// were dropped because filtering on them hides vessels that simply didn't report it.
export const FEATURES = [
  { key: 'wetlab',    label: 'Wet lab' },
  { key: 'drylab',    label: 'Dry lab' },
  { key: 'ctd',       label: 'CTD' },
  { key: 'multibeam', label: 'Multibeam' },
]

const HULL_JUNK = new Set(['no', 'none', 'n/a', 'na', '-', 'unknown'])
export const HULL_OPTIONS = ['Steel', 'Aluminum', 'Fiberglass', 'Iron', 'Other']

/** Collapse the messy hull_material free-text into a handful of buckets. */
export function normalizeHull(s: string | null | undefined): string | null {
  const t = (s ?? '').trim().toLowerCase()
  if (!t || HULL_JUNK.has(t)) return null
  if (t.includes('alum')) return 'Aluminum'
  if (t.includes('fiber') || t.includes('frp') || t.includes('grp') || t.includes('glass')) return 'Fiberglass'
  if (t.includes('steel')) return 'Steel'
  if (t.includes('iron')) return 'Iron'
  return 'Other'
}

interface Props {
  value: AdvancedFilters
  onChange: (f: AdvancedFilters) => void
  onClear: () => void
  countries?: string[]
}

const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
const label = 'block text-[11px] font-medium text-gray-500 mb-1'
const section = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400'

export default function AdvancedSearch({ value, onChange, onClear, countries = [] }: Props) {
  const set = (patch: Partial<AdvancedFilters>) => onChange({ ...value, ...patch })
  const num = (v: string) => Math.max(0, parseFloat(v) || 0)
  const toggleFeature = (key: string) =>
    set({ features: value.features.includes(key) ? value.features.filter((k) => k !== key) : [...value.features, key] })

  return (
    <div className="w-full max-w-3xl mx-auto mt-3 bg-white border border-gray-200 rounded-2xl shadow-sm">
      <div className="p-4 space-y-4">

        {/* Search */}
        <section className="space-y-2.5">
          <h4 className={section}>Search</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className={label}>Vessel name</label>
              <input type="text" value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Atlantis" className={input} />
            </div>
            <div>
              <label className={label}>Flag</label>
              <select value={value.flag} onChange={(e) => set({ flag: e.target.value })} className={`${input} bg-white`}>
                <option value="">Any flag</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Activity keyword</label>
              <input type="text" value={value.activity} onChange={(e) => set({ activity: e.target.value })} placeholder="fisheries, seismic…" className={input} />
            </div>
            <div>
              <label className={label}>Affiliation</label>
              <input type="text" value={value.affiliation} onChange={(e) => set({ affiliation: e.target.value })} placeholder="NOAA, Ifremer…" className={input} />
            </div>
          </div>
        </section>

        {/* Size & capacity */}
        <section className="space-y-2.5 border-t border-gray-100 pt-4">
          <h4 className={section}>Size &amp; capacity</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="col-span-2 sm:col-span-1">
              <label className={label}>Length (m)</label>
              <div className="flex items-center gap-1.5">
                <input type="number" min={0} inputMode="numeric" value={value.minLength || ''} onChange={(e) => set({ minLength: num(e.target.value) })} placeholder="Min" className={input} />
                <span className="text-gray-300">–</span>
                <input type="number" min={0} inputMode="numeric" value={value.maxLength || ''} onChange={(e) => set({ maxLength: num(e.target.value) })} placeholder="Max" className={input} />
              </div>
            </div>
            <div>
              <label className={label}>Min berths</label>
              <input type="number" min={0} inputMode="numeric" value={value.minBerths || ''} onChange={(e) => set({ minBerths: Math.round(num(e.target.value)) })} placeholder="any" className={input} />
            </div>
            <div>
              <label className={label}>Min endurance (d)</label>
              <input type="number" min={0} inputMode="numeric" value={value.minEndurance || ''} onChange={(e) => set({ minEndurance: num(e.target.value) })} placeholder="any" className={input} />
            </div>
            <div>
              <label className={label}>Max draft (m)</label>
              <input type="number" min={0} inputMode="decimal" value={value.maxDraft || ''} onChange={(e) => set({ maxDraft: num(e.target.value) })} placeholder="any" className={input} />
            </div>
          </div>
        </section>

        {/* Performance & build */}
        <section className="space-y-2.5 border-t border-gray-100 pt-4">
          <h4 className={section}>Performance &amp; build</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <label className={label}>Min cruise (kn)</label>
              <input type="number" min={0} inputMode="decimal" value={value.minSpeed || ''} onChange={(e) => set({ minSpeed: num(e.target.value) })} placeholder="any" className={input} />
            </div>
            <div>
              <label className={label}>Built after</label>
              <input type="number" min={0} inputMode="numeric" value={value.builtAfter || ''} onChange={(e) => set({ builtAfter: num(e.target.value) })} placeholder="year" className={input} />
            </div>
            <div>
              <label className={label}>Hull material</label>
              <select value={value.hull} onChange={(e) => set({ hull: e.target.value })} className={`${input} bg-white`}>
                <option value="">Any</option>
                {HULL_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="space-y-2.5 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between">
            <h4 className={section}>Capabilities</h4>
            <span className="text-[10px] text-gray-400">where reported — incomplete</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => set({ iceBreaking: !value.iceBreaking })}
              className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${value.iceBreaking ? 'border-teal bg-teal text-white font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'}`}
            >
              Ice class
            </button>
            <button
              onClick={() => set({ voo: !value.voo })}
              title="Pleasure craft, fishing, or working vessels that can also host research"
              className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${value.voo ? 'border-teal bg-teal text-white font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'}`}
            >
              Vessel of opportunity
            </button>
            {FEATURES.map((f) => {
              const active = value.features.includes(f.key)
              return (
                <button
                  key={f.key}
                  onClick={() => toggleFeature(f.key)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${active ? 'border-teal bg-teal text-white font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'}`}
                >
                  {f.label}
                </button>
              )
            })}
            {advancedActive(value) && (
              <button onClick={onClear} className="ml-auto text-sm text-gray-400 hover:text-navy transition-colors self-center">
                Clear all
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
