// TEMPORARY — MFP data explorer at /tmp-cruise. Reads mfp-api/raw/ directly; delete before shipping.
import Link from 'next/link'
import { isValidElement } from 'react'
import { readCruises, readGeo, firstLegDeparture, isUpcoming, derivedStatus, fetchSme, parseSme } from './data'
import MapLoader from './MapLoader'
import { PeopleTab, OrganizationsTab, EquipmentTab } from './EntityTables'

const TABS = [
  { key: 'cruises', label: 'Cruises' },
  { key: 'people', label: 'People' },
  { key: 'organizations', label: 'Organizations' },
  { key: 'equipment', label: 'Equipment' },
]

export const dynamic = 'force-dynamic'

const fmtD = (s?: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : '—')
const shipsOf = (c: any) => (c.Ships ?? []).map((s: any) => s.Ship?.Name).filter(Boolean) as string[]
const parkedOn = (c: any) => c.Cruise?.Start?.Voyage?.FlexLocation?.Name ?? null

function Row({ k, v }: { k: string; v: any }) {
  const isEl = isValidElement(v)
  const text = isEl ? null : v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return (
    <div className="flex gap-3 py-1 border-b border-gray-100 text-sm">
      <div className="w-56 shrink-0 text-gray-500">{k}</div>
      <div className={text === '—' ? 'text-gray-300' : 'text-navy break-words'}>{isEl ? v : text}</div>
    </div>
  )
}

function Section({ title, children, note }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-teal mb-1">
        {title} {note && <span className="normal-case font-normal text-gray-400">— {note}</span>}
      </h3>
      <div>{children}</div>
    </section>
  )
}

function Loc({ l }: { l: any }) {
  if (!l) return <span className="text-gray-300">—</span>
  return (
    <span>
      {l.Location ?? '?'}
      {l.Provence ? ` (${l.Provence})` : ''} {l.Country ?? ''} · <code className="text-xs">{l.Key || '—'}</code>{' '}
      {l.Latitude != null && <span className="text-gray-400 text-xs">{l.Latitude.toFixed(3)}, {l.Longitude.toFixed(3)}</span>}
    </span>
  )
}

export default async function TmpCruisePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const cruises = readCruises()
  const showAll = searchParams.all === '1'
  const shipFilter = searchParams.ship ?? ''
  const q = (searchParams.q ?? '').toLowerCase()
  const tab = TABS.some((t) => t.key === searchParams.tab) ? (searchParams.tab as string) : 'cruises'

  const allShips = Array.from(new Set(cruises.flatMap((c: any) => [...shipsOf(c), parkedOn(c)]).filter(Boolean) as string[])).sort()

  let list = cruises.filter((c: any) => showAll || isUpcoming(c))
  if (shipFilter) list = list.filter((c: any) => shipsOf(c).includes(shipFilter) || parkedOn(c) === shipFilter)
  if (q) list = list.filter((c: any) => `${c.Name} ${c.ShortName} ${c.PrincipleScientist} ${c.AffiliatedOrganisation} ${c.Workflow?.AlternateReferenceNumber ?? ''}`.toLowerCase().includes(q))
  list = [...list].sort((a: any, b: any) => (firstLegDeparture(a) ?? '').localeCompare(firstLegDeparture(b) ?? ''))

  const selectedId = searchParams.id
  const c = selectedId ? cruises.find((x: any) => String(x.CruiseApplication_id) === selectedId) : null
  const geo = c ? readGeo(c.CruiseApplication_id) : null
  const status = c ? derivedStatus(c) : null

  let sme: { sections: ReturnType<typeof parseSme>; cached: boolean } | { error: string } | null = null
  if (c && searchParams.sme === '1') {
    const r = await fetchSme(c.Cruise?.VoyageEvent_id, c.Organisation_id)
    sme = 'error' in r ? r : { sections: parseSme(r.html), cached: r.cached }
  }

  const keep = (k: string) => `?${new URLSearchParams({ ...(showAll ? { all: '1' } : {}), ...(shipFilter ? { ship: shipFilter } : {}), ...(q ? { q } : {}), ...(k ? { id: k } : {}) }).toString()}`

  const ports = c
    ? [
        ...(c.Legs ?? []).flatMap((l: any, i: number) => [
          { name: `Leg ${i + 1} depart: ${l.DepartName}`, lat: undefined as any, lon: undefined as any },
        ]),
        ...[c.Mobilisation, c.Demobilisation].filter(Boolean).map((l: any) => ({ name: `${l.Location} (${l.Key})`, lat: l.Latitude, lon: l.Longitude })),
      ].filter((p) => p.lat != null)
    : []

  const geoTypes: Record<string, number> = {}
  for (const f of geo?.features ?? []) geoTypes[f.properties?.Type ?? '?'] = (geoTypes[f.properties?.Type ?? '?'] ?? 0) + 1

  return (
    <div className="pt-[112px] px-4 pb-16 max-w-[1500px] mx-auto">
      <div className="flex items-baseline gap-3 mb-3">
        <h1 className="text-xl font-bold text-navy">MFP cruise explorer</h1>
        <span className="text-xs text-gray-400">temporary · reads mfp-api/raw/ · {cruises.length} records, pulled 2026-09-17</span>
      </div>

      <div className="inline-flex bg-gray-100 rounded-full p-1 gap-1 mb-4">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === 'cruises' ? '?' : `?tab=${t.key}`} className={`px-4 py-1 rounded-full text-sm font-medium ${tab === t.key ? 'bg-navy text-white' : 'text-gray-500 hover:text-navy'}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'people' && <PeopleTab q={q} sort={searchParams.sort ?? ''} />}
      {tab === 'organizations' && <OrganizationsTab q={q} source={searchParams.source ?? ''} kind={searchParams.kind ?? ''} />}
      {tab === 'equipment' && <EquipmentTab q={q} type={searchParams.type ?? ''} vessel={searchParams.vessel ?? ''} />}

      {tab === 'cruises' && (
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* ---------- list ---------- */}
        <div>
          <form className="flex flex-wrap gap-2 mb-2 text-sm" method="get">
            {selectedId && <input type="hidden" name="id" value={selectedId} />}
            <select name="ship" defaultValue={shipFilter} className="border rounded px-2 py-1 flex-1 min-w-0">
              <option value="">All vessels</option>
              {allShips.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input name="q" defaultValue={q} placeholder="search title / PI / org / code" className="border rounded px-2 py-1 flex-1 min-w-0" />
            <label className="flex items-center gap-1 text-gray-600">
              <input type="checkbox" name="all" value="1" defaultChecked={showAll} /> include past
            </label>
            <button className="bg-navy text-white rounded px-3 py-1">Filter</button>
          </form>
          <div className="text-xs text-gray-400 mb-1">{list.length} cruises{showAll ? '' : ' with a leg departing after today'}</div>
          <div className="border rounded divide-y max-h-[80vh] overflow-y-auto">
            {list.map((x: any) => {
              const st = derivedStatus(x)
              const active = String(x.CruiseApplication_id) === selectedId
              return (
                <Link key={x.CruiseApplication_id} href={keep(String(x.CruiseApplication_id))} className={`block px-3 py-2 hover:bg-navy-50 ${active ? 'bg-navy-50' : ''}`}>
                  <div className="flex justify-between gap-2">
                    <span className="text-xs text-gray-500">{fmtD(firstLegDeparture(x))}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">{st.label}</span>
                  </div>
                  <div className="text-sm font-medium text-navy truncate">{x.ShortName || x.Name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {parkedOn(x)} · {x.PrincipleScientist} ({x.AffiliatedOrganisation}) · {x.Workflow?.AlternateReferenceNumber ?? 'no code'}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* ---------- detail ---------- */}
        <div>
          {!c && <div className="text-gray-400 text-sm pt-8">Pick a cruise on the left.</div>}
          {c && (
            <div>
              <h2 className="text-lg font-bold text-navy">{c.Name}</h2>
              <div className="text-sm text-gray-500 mb-4">
                {c.ShortName} · <b>{parkedOn(c)}</b> · {c.VoyageEventTypeName} · derived status <b className="text-navy">{status!.label}</b>{' '}
                <span className="text-gray-400">({status!.reasons.join('; ')})</span>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8">
                <div>
                  <Section title="Identity">
                    <Row k="CruiseApplication_id" v={c.CruiseApplication_id} />
                    <Row k="Workflow_id / ReferenceNumber" v={`${c.Workflow?.Workflow_id} / ${c.Workflow?.ReferenceNumber}`} />
                    <Row k="Cruise code (AlternateReferenceNumber)" v={c.Workflow?.AlternateReferenceNumber} />
                    <Row k="Cruise_id / VoyageEvent_id" v={`${c.Cruise_id} / ${c.Cruise?.VoyageEvent_id}`} />
                    <Row k="Organisation_id / ResourceContainer_id" v={`${c.Organisation_id} / ${c.ResourceContainer_id}`} />
                    <Row k="Event type / color" v={`${c.VoyageEventTypeName} ${c.VoyageEventTypeColor}`} />
                    <Row k="PlanType" v={c.PlanType} />
                  </Section>

                  <Section title="Scheduled dates" note="Cruise.Start / Cruise.End">
                    <Row k="Mobilisation → Departure" v={`${c.Cruise?.Start?.MobilisationDate || '—'} → ${c.Cruise?.Start?.Departure}`} />
                    <Row k="Arrival → Demobilisation" v={`${c.Cruise?.End?.Arrival} → ${c.Cruise?.End?.DemobilisationDate || '—'}`} />
                    <Row k="Actual departure / arrival" v={`${c.Cruise?.Start?.ActualDeparture ?? '—'} / ${c.Cruise?.End?.ActualArrival ?? '—'}`} />
                    <Row k="Cruise.Start.Voyage vessel" v={parkedOn(c)} />
                  </Section>

                  <Section title="Requested window" note="from the SME, not the sail date">
                    <Row k="StartDate (earliest science start)" v={fmtD(c.StartDate)} />
                    <Row k="EndDate / LatestEndDate" v={`${fmtD(c.EndDate)} / ${fmtD(c.LatestEndDate)}`} />
                    <Row k="PreferredDuration (days)" v={c.PreferredDuration} />
                    <Row k="Mob / Demob days" v={`${c.MobilisationDays ?? '—'} / ${c.DemobilisationDays ?? '—'}`} />
                    <Row k="ScienceLocationGeneral" v={c.ScienceLocationGeneral} />
                  </Section>

                  <Section title={`Legs (${c.Legs?.length ?? 0})`}>
                    {(c.Legs ?? []).map((l: any, i: number) => (
                      <div key={l.Destination_id} className="text-sm py-1 border-b border-gray-100">
                        <b>Leg {i + 1}</b> · {fmtD(l.Departure)} → {fmtD(l.Arrival)}
                        <div className="text-gray-600">
                          {l.DepartName} <code className="text-xs">{l.DepartNameCountryCode}{l.DepartNameLocationCode}</code> → {l.Name}{' '}
                          <code className="text-xs">{l.NameCountryCode}{l.NameLocationCode}</code>
                        </div>
                        {(l.MobilisationDate || l.DemobilisationDate) && (
                          <div className="text-xs text-gray-400">mob {fmtD(l.MobilisationDate)} · demob {fmtD(l.DemobilisationDate)}</div>
                        )}
                      </div>
                    ))}
                  </Section>

                  <Section title="Ports">
                    <Row k="Mobilisation" v={<Loc l={c.Mobilisation} />} />
                    <Row k="Demobilisation" v={<Loc l={c.Demobilisation} />} />
                    <Row k="Cruise.Start departure loc" v={<Loc l={c.Cruise?.Start?.DepartureLocation} />} />
                    <Row k="Cruise.End arrival loc" v={<Loc l={c.Cruise?.End?.ArrivalLocation} />} />
                  </Section>

                  <Section title="People">
                    <Row k="PrincipleScientist" v={`${c.PrincipleScientist} (${c.AffiliatedOrganisation}) id ${c.PrincipleScientist_id}`} />
                    {(c.Users ?? []).map((u: any) => (
                      <Row key={u.Person_id + u.Role} k={`Users[] ${u.Role}`} v={`${u.FullName} — ${u.Organisation}`} />
                    ))}
                  </Section>

                  <Section title="Funding">
                    {(c.DestinationFundings ?? []).map((f: any, i: number) => (
                      <Row key={i} k={`DestinationFundings[${i}]`} v={`${f.Abbreviation} — ${f.Name} · ${f.Days} days · ${f.StatusDisplay || '(blank)'} · type ${f.Type}`} />
                    ))}
                    {(c.Fundings ?? []).map((f: any, i: number) => (
                      <Row key={i} k={`Fundings[${i}]`} v={`CruiseFunding ${f.CruiseFunding_id} · Division ${f.Division_id ?? '—'} · Program ${f.Program_id ?? '—'} · peerReviewed ${f.PeerReviewed} · confirmed ${f.Confirmed}`} />
                    ))}
                  </Section>

                  <Section title="Ships[] (PI preference list)" note="parked vessel is Cruise.Start.Voyage">
                    <Row k="Ships" v={shipsOf(c).join(', ')} />
                    <Row k="FlexLocation_id" v={c.FlexLocation_id} />
                  </Section>

                  <Section title="Equipment (ids only in the table)">
                    <Row k="EquipmentTypes" v={(c.EquipmentTypes ?? []).map((e: any) => e.EquipmentType_id).join(', ')} />
                    <Row k="GenericEquipment" v={(c.GenericEquipment ?? []).map((e: any) => e.GenericEquipment_id).join(', ')} />
                    <Row k="Equipment" v={(c.Equipment ?? []).map((e: any) => e.Equipment_id).join(', ')} />
                  </Section>

                  <Section title="Always-empty fields">
                    <Row k="MetaInformation / InPortEvent / DateRanges / ResearchStream / PlanTypeData / MinimiumDuration" v={JSON.stringify([c.MetaInformation, c.InPortEvent, c.DateRanges, c.ResearchStream, c.PlanTypeData, c.MinimiumDuration])} />
                  </Section>
                </div>

                <div>
                  <Section title="Geometry" note={`Read_CruiseApplicationGEOJson · ${Object.entries(geoTypes).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}`}>
                    {geo ? <MapLoader fc={geo} ports={ports} /> : <div className="text-gray-300 text-sm">no geometry</div>}
                    <div className="text-xs text-gray-400 mt-1">
                      navy = transect/waypoint · teal = sampling station · gold = mooring/lander/ROV/AUV · light blue = research area / bound box · red = mob/demob port. Click features for their properties (TravelTime, ShipSpeed, TimeAtStation, ExpectedSeaDepth…).
                    </div>
                  </Section>

                  <Section title="SME form (live from mfp.us)" note="/Programme/Cruise/{VoyageEvent_id}?organisation_id=…">
                    {!sme && (
                      <Link href={keep(String(c.CruiseApplication_id)) + '&sme=1'} className="inline-block bg-teal text-white text-sm rounded px-3 py-1">
                        Fetch SME detail pane
                      </Link>
                    )}
                    {sme && 'error' in sme && <div className="text-red-600 text-sm">{sme.error}</div>}
                    {sme && 'sections' in sme && (
                      <div>
                        <div className="text-xs text-gray-400 mb-2">{sme.cached ? 'from disk cache' : 'fetched just now'} · {sme.sections.length} sections</div>
                        {sme.sections.map((s) => (
                          <details key={s.title} open className="mb-2">
                            <summary className="text-sm font-semibold text-navy cursor-pointer">{s.title} <span className="text-gray-400 font-normal">({s.rows.length})</span></summary>
                            {s.rows.map((r, i) => (
                              <Row key={i} k={r.label} v={r.value} />
                            ))}
                          </details>
                        ))}
                      </div>
                    )}
                  </Section>

                  <details className="mb-6">
                    <summary className="text-xs font-semibold uppercase tracking-wide text-teal cursor-pointer">Raw decoded record</summary>
                    <pre className="text-[11px] bg-gray-50 p-2 rounded overflow-auto max-h-[500px]">{JSON.stringify(c, null, 1)}</pre>
                  </details>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
