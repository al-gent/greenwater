import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import { getCruiseBySlug, getCruiseById, isUuid, cruiseStage, STAGE_LABEL, STAGE_CLASS, fmtDate, fmtDateRange, cruiseDays } from '@/lib/cruises'
import BackButton from '@/components/BackButton'
import ShareButton from '@/components/ShareButton'
import CruiseMapSection from '@/components/CruiseMapSection'
import VesselTimelineStrip from '@/components/VesselTimelineStrip'
import CruiseProjectsTabs from '@/components/CruiseProjectsTabs'
import RequestButton from '@/components/RequestButton'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const cruise = await getCruiseBySlug(params.slug)
  if (!cruise) return {}
  const title = `${cruise.title}${cruise.vessel ? ` — ${cruise.vessel.name}` : ''} · VesselConnect`
  const description = `${fmtDateRange(cruise.departure_at, cruise.arrival_at)}${cruise.operating_area ? ` · ${cruise.operating_area}` : ''}`
  return {
    title,
    description,
    // Keep cruise pages out of search until slugs/SEO for them are decided.
    robots: { index: false, follow: true },
    openGraph: { title, description, type: 'website', siteName: 'VesselConnect' },
  }
}

export default async function CruisePage({ params }: { params: { slug: string } }) {
  // Old uuid links → canonical slug URL.
  if (isUuid(params.slug)) {
    const byId = await getCruiseById(params.slug)
    if (byId) permanentRedirect(`/cruises/${byId.slug}`)
    notFound()
  }
  const cruise = await getCruiseBySlug(params.slug)
  if (!cruise) notFound()

  const { vessel, organization, legs, projects, seats } = cruise
  const stage = cruiseStage(cruise)
  const days = cruiseDays(cruise.departure_at, cruise.arrival_at)
  const hasArea = !!cruise.operating_area_geojson && (cruise.operating_area_geojson.features?.length ?? 0) > 0
  const hasPortCoords = legs.some((l) => l.depart_lat != null || l.arrive_lat != null)
  const showMap = hasArea || hasPortCoords
  // Vacant berths: what the operator says, else the vessel's science berths minus the party aboard.
  const berthsTotal = cruise.berths_total ?? vessel?.scientists ?? null
  const party = cruise.science_party_size
  const berthsOpen = cruise.berths_open ?? (berthsTotal != null && party != null ? Math.max(0, berthsTotal - party) : null)
  const berthsEstimated = cruise.berths_open == null && berthsOpen != null
  const mfpRefs = [...new Set(projects.map((p) => p.reference).filter(Boolean) as string[])]
  if (!mfpRefs.length && cruise.external_refs?.reference_number) mfpRefs.push(cruise.external_refs.reference_number)

  return (
    <div className="pt-[88px] bg-white min-h-screen">
      {stage === 'cancelled' && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <p className="text-sm text-amber-800 font-medium">This cruise has been cancelled.</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-2">
        <nav className="flex items-center justify-between gap-2 text-sm text-gray-400">
          <BackButton fallbackHref={vessel ? `/vessels/${vessel.id}` : '/'} />
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 space-y-8">
        {/* Title */}
        <div>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-3xl font-bold text-navy leading-tight">{cruise.title}</h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STAGE_CLASS[stage]}`}>{STAGE_LABEL[stage]}</span>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              {vessel && (
                <RequestButton
                vesselId={vessel.id}
                vesselName={vessel.name}
                compact
                label="Message the operator"
                className="bg-navy text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-navy-600 transition-colors"
                prefill={{ startDate: cruise.departure_at.slice(0, 10), endDate: cruise.arrival_at.slice(0, 10), context: `${cruise.title} (${fmtDateRange(cruise.departure_at, cruise.arrival_at)})`, message: `Hi — I'm interested in ${cruise.title} (${fmtDateRange(cruise.departure_at, cruise.arrival_at)}) on ${vessel.name}. ` }}
                next={`/cruises/${cruise.slug}`}
              />
              )}
              <ShareButton title={cruise.title} />
            </div>
          </div>
        </div>

        {/* Vessel + map */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div>
            {vessel ? (
              <Link href={`/vessels/${vessel.id}`} className="block rounded-xl border border-gray-100 overflow-hidden hover:border-teal/40 transition-colors group">
                <div className="aspect-[16/9] bg-lightblue-100 overflow-hidden">
                  <img
                    // Full-size photo: this card is wide enough that the ~400px thumb looks soft.
                    src={vessel.photo_urls?.[0] ?? 'https://jmpxcsihkmyotidxjuyv.supabase.co/storage/v1/object/public/vessel-photos/placeholder.jpg'}
                    alt={vessel.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                  />
                </div>
                <div className="p-4">
                  <p className="text-lg font-semibold text-navy group-hover:text-teal transition-colors">{vessel.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {[organization?.name ?? vessel.operator_name, vessel.country].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </Link>
            ) : (
              <div className="rounded-xl border border-gray-100 p-4">
                <p className="text-sm text-gray-400">Vessel not on VesselConnect</p>
                {organization && <p className="text-sm text-gray-500 mt-1">{organization.name}</p>}
              </div>
            )}
          </div>

          <div>
            {showMap ? (
              <CruiseMapSection operatingArea={hasArea ? cruise.operating_area_geojson : null} legs={legs} />
            ) : (
              <div className="rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-sm text-gray-400" style={{ height: 360 }}>
                No location data for this cruise
              </div>
            )}
            {cruise.operating_area && (
              <p className="text-sm text-gray-600 mt-2">
                <span className="font-medium text-navy">Operating area:</span> {cruise.operating_area}
              </p>
            )}
            {legs.length === 1 && (
              <p className="text-sm text-gray-600 mt-3">
                <span className="font-medium text-navy">Route:</span> {legs[0].depart_port} → {legs[0].arrive_port}
                {legs[0].notes && <span className="block text-xs text-gray-500">{legs[0].notes}</span>}
              </p>
            )}
            {legs.length > 1 && (
              <details className="mt-3 group">
                <summary className="cursor-pointer select-none text-sm font-semibold text-navy flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
                  <span className="inline-block w-4 text-gray-400 transition-transform group-open:rotate-90">›</span>
                  {legs.length} legs
                  <span className="font-normal text-gray-500">· {legs[0].depart_port} → {legs[legs.length - 1].arrive_port}</span>
                </summary>
                <ol className="mt-2 space-y-1.5 pl-6">
                  {legs.map((l) => (
                    <li key={l.id} className="text-sm">
                      <span className="inline-block w-5 text-xs text-gray-400">{l.seq}</span>
                      <span className="font-medium text-navy">{l.depart_port}</span>
                      <span className="text-gray-300 mx-1.5">→</span>
                      <span className="font-medium text-navy">{l.arrive_port}</span>
                      <span className="text-xs text-gray-500 ml-2">{fmtDateRange(l.depart_at, l.arrive_at)} · {cruiseDays(l.depart_at, l.arrive_at)} d</span>
                      {l.notes && <p className="text-xs text-gray-500 ml-5">{l.notes}</p>}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Dates + this vessel's timeline, full width */}
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
            <span className="text-2xl font-semibold text-navy">{fmtDateRange(cruise.departure_at, cruise.arrival_at)}</span>
            <span className="text-sm text-gray-500">{days} day{days === 1 ? '' : 's'} at sea</span>
            {(cruise.actual_departure_at || cruise.actual_arrival_at) && (
              <span className="text-xs text-gray-400">actual: departed {fmtDate(cruise.actual_departure_at) ?? '—'}, arrived {fmtDate(cruise.actual_arrival_at) ?? '—'}</span>
            )}
          </div>
          {vessel && (
            <VesselTimelineStrip
              vesselId={vessel.id} vesselName={vessel.name} highlightCruiseId={cruise.id}
              from={new Date(new Date(cruise.departure_at).getTime() - 28 * 86_400_000)}
              to={new Date(new Date(cruise.arrival_at).getTime() + 29 * 86_400_000)}
            />
          )}
        </div>

        <hr className="border-gray-100" />

        {/* Projects, full width, one tab each */}
        <div>
          <h2 className="text-lg font-semibold text-navy mb-3">
            Project{projects.length === 1 ? '' : 's'} aboard {projects.length > 1 && <span className="text-sm font-normal text-gray-400">({projects.length})</span>}
          </h2>
          <CruiseProjectsTabs projects={projects} />
        </div>

        <hr className="border-gray-100" />

        {/* People | equipment */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div>
            <h2 className="text-lg font-semibold text-navy mb-3">People aboard</h2>
            {projects.some((p) => p.people.length) || seats.length ? (
              <div className="space-y-3">
                {projects.filter((p) => p.people.length).map((p) => (
                  <div key={p.id}>
                    {projects.length > 1 && <p className="text-xs font-medium text-gray-500 mb-1">{p.title}</p>}
                    <ul className="space-y-1">
                      {p.people.map((r) => <li key={r.id} className="text-sm"><span className="font-medium text-navy">{r.name}</span>{r.role && <span className="text-gray-500"> · {r.role.label}</span>}</li>)}
                    </ul>
                  </div>
                ))}
                {seats.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Crew</p>
                    <ul className="space-y-1">
                      {seats.map((s) => <li key={s.id} className="text-sm"><span className="font-medium text-navy">{s.person?.name ?? s.name ?? <span className="text-gray-400 font-normal">Open seat</span>}</span>{s.role && <span className="text-gray-500"> · {s.role.label}</span>}{(s.start_at || s.end_at) && <span className="text-xs text-gray-500"> · {fmtDateRange(s.start_at ?? cruise.departure_at, s.end_at ?? cruise.arrival_at)}</span>}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Not listed</p>
            )}
            {cruise.science_party_size != null && (
              <p className="text-xs text-gray-500 mt-2">Party size: {cruise.science_party_size}</p>
            )}
            {berthsOpen != null && (
              <p className="text-xs text-gray-500 mt-1">{berthsEstimated ? 'Estimated vacant berths' : 'Vacant berths'}: <span className="font-semibold text-navy">{berthsOpen}</span></p>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-navy mb-3">Equipment</h2>
            {(() => {
              // Group every requested line by who provides it: the confirmed bid's answer when
              // there is one, else the origin MFP recorded (ship fitted / pooled / science party).
              const GROUPS: [string, string][] = [['ship', 'Aboard the vessel'], ['pool', 'Pooled / portable'], ['science_party', 'Science party brings'], ['none', 'Not supported on this cruise'], ['requested', 'Requested, not yet answered']]
              const lines = projects.flatMap((p) => p.gear.map((g) => ({ ...g, project: p.title })))
              const confirmed = lines.some((g) => g.answer)
              const groupOf = (g: (typeof lines)[number]) =>
                g.answer === 'provide' ? 'ship' : g.answer === 'support' ? 'science_party' : confirmed ? 'none'
                : g.notes === 'Ship fitted' ? 'ship' : g.notes === 'Pooled / portable' ? 'pool' : g.notes === 'Science party brings' ? 'science_party' : 'requested'
              if (!lines.length) return <p className="text-sm text-gray-400">No equipment listed for this cruise yet.</p>
              return (
                <div className="space-y-3">
                  {GROUPS.map(([key, title]) => {
                    const inGroup = lines.filter((g) => groupOf(g) === key)
                    if (!inGroup.length) return null
                    return (
                      <div key={key}>
                        <p className="text-xs font-medium text-gray-500 mb-1">{title}</p>
                        <ul className="flex flex-wrap gap-1.5">
                          {inGroup.map((g) => (
                            <li key={g.id} title={projects.length > 1 ? g.project : undefined} className={`text-xs rounded-full px-2.5 py-1 ${key === 'none' ? 'bg-gray-50 text-gray-400 border border-gray-200 line-through' : 'text-navy bg-navy-50'}`}>
                              {g.label}{g.quantity != null && g.quantity > 1 ? ` ×${g.quantity}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Provenance */}
        {cruise.source === 'unols_mfp' && (
          <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
            Schedule data from{' '}
            <a href="https://www.mfp.us/programme" target="_blank" rel="noopener noreferrer" className="underline hover:text-teal">
              UNOLS Marine Facilities Planning
            </a>
            {cruise.cruise_code && <> · operator cruise code <span className="font-mono">{cruise.cruise_code}</span></>}
            {mfpRefs.length > 0 && <> · MFP reference{mfpRefs.length > 1 ? 's' : ''} {mfpRefs.join(', ')}</>}
            {cruise.updated_at && <> · synced {fmtDate(cruise.updated_at)}</>}
          </p>
        )}
      </div>
    </div>
  )
}
