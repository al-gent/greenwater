import { notFound } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getVesselById, fmt, stripHtml, getPhotoUrl } from '@/lib/vessels'
import RequestButton from '@/components/RequestButton'

const VesselDetailMap = dynamic(() => import('@/components/VesselDetailMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center rounded-2xl">
      <span className="text-sm text-gray-400">Loading map…</span>
    </div>
  ),
})

function SpecCard({ label, value, icon }: { label: string; value: string | number | null | undefined; icon: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="bg-gray-50 rounded-2xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0 text-teal">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-navy leading-snug">{value}</p>
      </div>
    </div>
  )
}

export default async function VesselDetailPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const vessel = await getVesselById(id)
  if (!vessel) notFound()

  const activity = stripHtml(vessel.Main_Activity)
  const photoUrl = getPhotoUrl(vessel)
  const lat = vessel.primaryLatitude ? parseFloat(vessel.primaryLatitude) : null
  const lng = vessel.primaryLongitude ? parseFloat(vessel.primaryLongitude) : null
  const hasCoords = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)

  const specs = [
    { label: 'Length', value: vessel.length != null ? `${vessel.length} m` : null, icon: <IconRuler /> },
    { label: 'Cruise Speed', value: vessel.Speed_Cruise != null ? `${vessel.Speed_Cruise} kn` : null, icon: <IconBolt /> },
    { label: 'Research Bunks', value: vessel.scientists, icon: <IconUsers /> },
    { label: 'Beam', value: vessel.beam != null ? `${vessel.beam} m` : null, icon: <IconArrows /> },
    { label: 'Draft', value: vessel.draft != null ? `${vessel.draft} m` : null, icon: <IconDown /> },
    { label: 'Crew', value: vessel.crew, icon: <IconPerson /> },
    { label: 'Year Built', value: vessel.Year_Built, icon: <IconCalendar /> },
    { label: 'Home Port', value: vessel.homeport, icon: <IconPin /> },
    { label: 'Call Sign', value: vessel.Call_sign, icon: <IconSignal /> },
    { label: 'Operating Area', value: vessel.Operating_area, icon: <IconGlobe /> },
  ].filter((s) => s.value !== null && s.value !== undefined && s.value !== '')

  return (
    <div className="pt-16 bg-white min-h-screen">
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-2">
        <nav className="flex items-center gap-2 text-sm text-gray-400">
          <Link href="/" className="hover:text-navy transition-colors">Find a Vessel</Link>
          <span>/</span>
          <span className="text-gray-600 truncate max-w-xs">{vessel.name}</span>
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ── Left / Main column ─────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Hero photo */}
            <div className="relative rounded-3xl overflow-hidden bg-gray-100" style={{ aspectRatio: '16/9' }}>
              <img
                src={photoUrl}
                alt={vessel.name}
                className="w-full h-full object-cover"
              />
              {vessel.country && (
                <span className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-navy text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
                  {vessel.country}
                </span>
              )}
            </div>

            {/* Title + quick badges */}
            <div>
              <h1 className="text-3xl font-bold text-navy leading-tight">{vessel.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {vessel.homeport && (
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    <svg className="w-4 h-4 text-teal flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {vessel.homeport}
                  </span>
                )}
                {vessel.scientists != null && (
                  <span className="bg-teal text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                    {vessel.scientists} research bunks
                  </span>
                )}
                {activity && (
                  <span className="bg-navy-50 text-navy text-xs font-medium px-2.5 py-1 rounded-full border border-navy/10">
                    {activity.length > 60 ? activity.slice(0, 60) + '…' : activity}
                  </span>
                )}
              </div>
            </div>

            {/* Divider */}
            <hr className="border-gray-100" />

            {/* Activity description */}
            {activity && activity.length > 60 && (
              <div>
                <h2 className="text-lg font-semibold text-navy mb-2">Research Activity</h2>
                <p className="text-gray-600 leading-relaxed">{activity}</p>
              </div>
            )}

            {/* Specs grid — only populated fields */}
            {specs.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-navy mb-3">Specifications</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {specs.map((s) => (
                    <SpecCard key={s.label} label={s.label} value={s.value} icon={s.icon} />
                  ))}
                </div>
              </div>
            )}

            {/* Operator */}
            {(vessel.Affiliation || vessel.Operator_Name) && (
              <div className="border border-gray-100 rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-navy mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Operator
                </h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {[
                    ['Affiliation', vessel.Affiliation],
                    ['Operator', vessel.Operator_Name],
                    ['Country', vessel.country],
                    ['Home Port', vessel.homeport],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, value]) => (
                      <div key={label as string}>
                        <dt className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</dt>
                        <dd className="text-sm font-medium text-gray-800">{value}</dd>
                      </div>
                    ))}
                </dl>
                <div className="mt-4 flex flex-wrap gap-4">
                  {vessel.url_ship && (
                    <a href={vessel.url_ship} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-medium text-teal hover:underline flex items-center gap-1">
                      Official website
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  <a href="#" className="text-sm font-medium text-teal hover:underline flex items-center gap-1">
                    View operator profile
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            )}

            {/* Map */}
            {hasCoords && (
              <div>
                <h2 className="text-lg font-semibold text-navy mb-3">Home Port Location</h2>
                <div className="rounded-2xl overflow-hidden border border-gray-100" style={{ height: '280px' }}>
                  <VesselDetailMap lat={lat!} lng={lng!} homeport={vessel.homeport} vesselName={vessel.name} />
                </div>
              </div>
            )}
          </div>

          {/* ── Right / Booking column ─────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              <div className="border border-gray-200 rounded-2xl shadow-card p-6">
                {/* Berths headline */}
                <div className="mb-5">
                  {vessel.scientists != null ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-bold text-navy">{vessel.scientists}</span>
                      <span className="text-gray-500 text-sm"> research bunks</span>
                    </div>
                  ) : (
                    <p className="text-gray-500 font-medium">Contact for availability</p>
                  )}
                  {activity && (
                    <p className="text-xs text-gray-400 mt-1 leading-snug line-clamp-2">{activity}</p>
                  )}
                </div>

                <RequestButton vesselName={vessel.name} />

                <p className="text-center text-xs text-gray-400 mt-3">
                  Messages are handled through Greenwater — your contact details stay private until you both agree to connect.
                </p>

                {/* Summary facts */}
                {specs.filter(s => ['Length','Cruise Speed','Year Built','Country'].includes(s.label)).length > 0 && (
                  <div className="mt-5 pt-4 border-t border-gray-100 space-y-2.5">
                    {specs
                      .filter(s => ['Length','Cruise Speed','Year Built','Country'].includes(s.label))
                      .map(s => (
                        <div key={s.label} className="flex justify-between text-sm">
                          <span className="text-gray-500">{s.label}</span>
                          <span className="font-medium text-gray-800">{s.value}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Share */}
              <div className="flex items-center justify-center gap-6">
                <button className="text-sm text-gray-400 hover:text-navy flex items-center gap-1.5 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Inline SVG icon components ─────────────────────────────────────────────
function IconRuler() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
}
function IconBolt() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
}
function IconUsers() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
}
function IconArrows() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
}
function IconDown() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
}
function IconPerson() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
}
function IconCalendar() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
}
function IconPin() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
}
function IconSignal() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
}
function IconGlobe() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
}
