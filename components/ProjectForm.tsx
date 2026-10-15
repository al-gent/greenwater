'use client'

/**
 * Create / edit a research project. Only the title is required; everything else can come
 * later. "Save draft" keeps it private; "Publish" opens it to operators to bid on.
 * Area is drawn with the same map tool operators use for vessel operating areas.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Project, ProjectGearLine, ProjectPerson } from '@/lib/project-utils'
import { FUNDING_STATUSES } from '@/lib/project-utils'
import PlaceAutocomplete from '@/components/PlaceAutocomplete'

const VesselMap = dynamic(() => import('@/components/VesselMap'), {
  ssr: false,
  loading: () => <div className="h-[320px] rounded-xl bg-gray-100 animate-pulse" />,
})

const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition'
const label = 'block text-xs font-medium text-gray-500 mb-1'

type Gear = { label: string; equipment_type_id: string | null; quantity: string; notes: string }

type Person = { role_id: string; name: string }

interface Props {
  project?: Project | null
  gear?: ProjectGearLine[]
  people?: ProjectPerson[]
  equipmentTypes: { id: string; name: string; category: string | null }[]
  roles: { id: string; slug: string; label: string }[]
}

export default function ProjectForm({ project, gear: initialGear = [], people: initialPeople = [], equipmentTypes, roles }: Props) {
  const router = useRouter()
  const p = project
  const [title, setTitle] = useState(p?.title ?? '')
  const [summary, setSummary] = useState(p?.summary ?? '')
  const [area, setArea] = useState<GeoJSON.FeatureCollection | null>(p?.area_geojson ?? null)
  const [areaLabel, setAreaLabel] = useState(p?.area_label ?? '')
  const [placeQuery, setPlaceQuery] = useState('')
  const [focus, setFocus] = useState<{ key: number; lat: number; lon: number; bbox?: [number, number, number, number] } | null>(null)

  // Searching a place moves the map there and names the area; the researcher draws the box.
  const selectPlace = (r: { label: string; lat: number; lon: number; bbox?: [number, number, number, number] }) => {
    setPlaceQuery(r.label)
    if (!areaLabel.trim()) setAreaLabel(r.label)
    setFocus({ key: Date.now(), lat: r.lat, lon: r.lon, bbox: r.bbox })
  }
  const [earliest, setEarliest] = useState(p?.requested_start_earliest ?? '')
  const [latest, setLatest] = useState(p?.requested_start_latest ?? '')
  const [scienceDays, setScienceDays] = useState(p?.requested_science_days != null ? String(p.requested_science_days) : '')
  const [datesNotes, setDatesNotes] = useState(p?.dates_notes ?? '')
  const [partySize, setPartySize] = useState(p?.party_size != null ? String(p.party_size) : '')
  const [fundingSource, setFundingSource] = useState(p?.funding_source ?? '')
  const [fundingStatus, setFundingStatus] = useState<string>(p?.funding_status ?? '')
  const [grantNumber, setGrantNumber] = useState(p?.grant_number ?? '')
  const [fundingNotes, setFundingNotes] = useState(p?.funding_notes ?? '')
  const piRole = roles.find((r) => r.slug === 'pi')?.id ?? roles[0]?.id ?? ''
  const [people, setPeople] = useState<Person[]>(initialPeople.map((r) => ({ role_id: r.role_id, name: r.name })))
  const [gear, setGear] = useState<Gear[]>(initialGear.map((g) => ({ label: g.label, equipment_type_id: g.equipment_type_id, quantity: g.quantity != null ? String(g.quantity) : '', notes: g.notes ?? '' })))
  const [saving, setSaving] = useState<'draft' | 'publish' | 'unpublish' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nz = (s: string) => (s.trim() ? s.trim() : null)
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  const payload = (publish: boolean) => ({
    title: title.trim(),
    summary: nz(summary),
    area_label: nz(areaLabel),
    area_geojson: area?.features?.length ? area : null,
    requested_start_earliest: nz(earliest),
    requested_start_latest: nz(latest),
    requested_science_days: num(scienceDays),
    dates_notes: nz(datesNotes),
    party_size: num(partySize),
    funding_source: nz(fundingSource),
    funding_status: fundingStatus || null,
    grant_number: nz(grantNumber),
    funding_notes: nz(fundingNotes),
    people: people.filter((r) => r.name.trim()).map((r) => ({ role_id: r.role_id, name: r.name.trim() })),
    gear: gear.filter((g) => g.label.trim()).map((g) => ({ label: g.label.trim(), equipment_type_id: g.equipment_type_id, quantity: num(g.quantity), notes: nz(g.notes) })),
    publish,
  })

  const save = async (publish: boolean) => {
    if (!title.trim()) { setError('Give the project a title first.'); return }
    if (earliest && latest && latest < earliest) { setError('Latest start is before earliest start.'); return }
    setSaving(publish ? 'publish' : 'draft'); setError(null)
    const res = await fetch(p ? `/api/projects/${p.id}` : '/api/projects', {
      method: p ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(publish)),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(null)
    if (!res.ok) { setError(data.error ?? 'Could not save. Try again.'); return }
    router.push(`/projects/${p?.slug ?? data.slug}`)
    router.refresh()
  }

  const unpublish = async () => {
    if (!p) return
    setSaving('unpublish'); setError(null)
    const res = await fetch(`/api/projects/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publish: false }) })
    const data = await res.json().catch(() => ({}))
    setSaving(null)
    if (!res.ok) { setError(data.error ?? 'Could not unpublish.'); return }
    router.push(`/projects/${p.slug}`); router.refresh()
  }
  const typeName = (id: string | null) => equipmentTypes.find((t) => t.id === id)?.name ?? ''
  const setGearAt = (i: number, patch: Partial<Gear>) => setGear((g) => g.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(false) }} className="space-y-8">
      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}

      <section className="space-y-4">
        <div>
          <label className={label}>Title <span className="text-red-400">*</span></label>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shelf nutrient survey, Monterey Bay" maxLength={200} required />
        </div>
        <div>
          <label className={label}>What you want to do</label>
          <textarea className={`${input} resize-y`} rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Science goals, sampling plan, anything an operator needs to know to say whether their vessel fits." />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-navy mb-1">Who</h2>
        <p className="text-xs text-gray-400 mb-3">The people on this project and what they do. You don&apos;t have to be one of them.</p>
        <div className="space-y-2">
          {people.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[220px_1fr_auto] gap-2 items-start">
              <select className={input} value={r.role_id} onChange={(e) => setPeople((rows) => rows.map((row, idx) => (idx === i ? { ...row, role_id: e.target.value } : row)))}>
                {roles.map((ro) => <option key={ro.id} value={ro.id}>{ro.label}</option>)}
              </select>
              <input className={`${input} col-span-2 sm:col-span-1`} value={r.name} onChange={(e) => setPeople((rows) => rows.map((row, idx) => (idx === i ? { ...row, name: e.target.value } : row)))} placeholder="Name" maxLength={200} />
              <button type="button" onClick={() => setPeople((rows) => rows.filter((_, idx) => idx !== i))} className="h-10 w-10 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 hidden sm:block" aria-label="Remove person">×</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setPeople((rows) => [...rows, { role_id: people.length ? roles.find((r) => r.slug === 'scientist')?.id ?? piRole : piRole, name: '' }])} className="mt-2 text-sm font-medium text-teal hover:underline">+ Add a person</button>
        <div className="mt-4 max-w-xs">
          <label className={label}>Total number of science personnel</label>
          <input type="number" min={0} max={500} className={input} value={partySize} onChange={(e) => setPartySize(e.target.value)} placeholder="Everyone sailing, named or not" />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-navy mb-1">Where</h2>
        <p className="text-xs text-gray-400 mb-2">Search a place to jump there, then draw the area you need to work in. Operators use this to tell whether their vessel can get there.</p>
        <div className="mb-2">
          <PlaceAutocomplete value={placeQuery} onChange={setPlaceQuery} onSelect={selectPlace} placeholder="Search a place — a bay, a sea, a port, a coast" className={input} />
        </div>
        <VesselMap editable operatingArea={area} onAreaChange={setArea} height={320} focus={focus} />
        <div className="mt-3">
          <label className={label}>Area name</label>
          <input className={input} value={areaLabel} onChange={(e) => setAreaLabel(e.target.value)} placeholder="Monterey Bay; Gulf of Alaska shelf" maxLength={200} />
          <p className="text-xs text-gray-400 mt-1">Shown wherever the map isn&apos;t. Filled in from the search; change it to whatever reads best.</p>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-navy mb-3">When</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>Earliest start</label>
            <input type="date" className={input} value={earliest} onChange={(e) => setEarliest(e.target.value)} />
          </div>
          <div>
            <label className={label}>Latest start</label>
            <input type="date" className={input} value={latest} onChange={(e) => setLatest(e.target.value)} />
          </div>
          <div>
            <label className={label}>Science days needed</label>
            <input type="number" min={0} max={365} step={0.5} className={input} value={scienceDays} onChange={(e) => setScienceDays(e.target.value)} placeholder="e.g. 3" />
          </div>
        </div>
        <div className="mt-3">
          <label className={label}>Anything about timing</label>
          <input className={input} value={datesNotes} onChange={(e) => setDatesNotes(e.target.value)} placeholder="Any weekday in October; must avoid the first week of November" />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-navy mb-3">How it&apos;s funded</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Funding status</label>
            <select className={input} value={fundingStatus} onChange={(e) => setFundingStatus(e.target.value)}>
              <option value="">Not stated</option>
              {FUNDING_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Funding source</label>
            <input className={input} value={fundingSource} onChange={(e) => setFundingSource(e.target.value)} placeholder="NSF OCE, NOAA, institutional…" />
          </div>
          <div>
            <label className={label}>Grant number</label>
            <input className={input} value={grantNumber} onChange={(e) => setGrantNumber(e.target.value)} placeholder="OCE-2345678" />
          </div>
        </div>
        <div className="mt-3">
          <label className={label}>Funding notes</label>
          <input className={input} value={fundingNotes} onChange={(e) => setFundingNotes(e.target.value)} placeholder="Ship time is in the award; cost-share available from the department" />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-navy mb-1">Gear you need</h2>
        <p className="text-xs text-gray-400 mb-3">List what the vessel needs to provide or support. Operators answer each line in their bid.</p>
        <div className="space-y-2">
          {gear.map((g, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[2fr_2fr_80px_auto] gap-2 items-start">
              <input className={input} value={g.label} onChange={(e) => setGearAt(i, { label: e.target.value })} placeholder="CTD rosette, 12 bottles" maxLength={200} />
              <input className={`${input} hidden sm:block`} list="equipment-types" value={typeName(g.equipment_type_id) || g.notes}
                onChange={(e) => { const t = equipmentTypes.find((x) => x.name === e.target.value); setGearAt(i, t ? { equipment_type_id: t.id, notes: '' } : { equipment_type_id: null, notes: e.target.value }) }}
                placeholder="Type (optional)" />
              <input type="number" min={1} max={999} className={input} value={g.quantity} onChange={(e) => setGearAt(i, { quantity: e.target.value })} placeholder="Qty" />
              <button type="button" onClick={() => setGear((rows) => rows.filter((_, idx) => idx !== i))} className="h-10 w-10 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50" aria-label="Remove line">×</button>
            </div>
          ))}
        </div>
        <datalist id="equipment-types">{equipmentTypes.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        <button type="button" onClick={() => setGear((rows) => [...rows, { label: '', equipment_type_id: null, quantity: '', notes: '' }])} className="mt-2 text-sm font-medium text-teal hover:underline">+ Add a line</button>
      </section>

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
        <button type="submit" disabled={!!saving} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-navy hover:border-navy/30 disabled:opacity-60">
          {saving === 'draft' ? 'Saving…' : p?.published_at ? 'Save changes' : 'Save draft'}
        </button>
        {!p?.published_at && (
          <button type="button" disabled={!!saving} onClick={() => save(true)} className="px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-600 disabled:opacity-60">
            {saving === 'publish' ? 'Publishing…' : 'Publish'}
          </button>
        )}
        <p className="text-xs text-gray-400">
          {p?.published_at ? 'Published: operators can see this and bid on it.' : 'Drafts are private to you. Publishing lets operators see it and bid.'}
        </p>
      </div>

      {p?.published_at && !p.cruise_id && (
        <div className="pt-4 border-t border-gray-100 text-sm">
          <button type="button" disabled={!!saving} onClick={unpublish} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:border-navy/30 hover:text-navy disabled:opacity-60">
            {saving === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
          </button>
          <p className="text-xs text-gray-400 mt-2">Back to a private draft only you can see. Operators lose sight of it until you publish again.</p>
        </div>
      )}
      {p?.cruise_id && <p className="text-xs text-gray-400 pt-4 border-t border-gray-100">This project is scheduled on a cruise, so it can&apos;t be unpublished from here.</p>}
    </form>
  )
}
