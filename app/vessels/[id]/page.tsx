import { notFound } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getVesselById, fmt, stripHtml, countryNameToFlag } from '@/lib/vessels'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerUser } from '@/lib/supabase-server'
import RequestButton from '@/components/RequestButton'
import ClaimButton from '@/components/ClaimButton'
import VesselPhotoGallery from '@/components/VesselPhotoGallery'
import VesselDetailSpecs from '@/components/VesselDetailSpecs'
import SignupNudge from '@/components/SignupNudge'
import BackButton from '@/components/BackButton'
import ShareButton from '@/components/ShareButton'

const VesselMap = dynamic(() => import('@/components/VesselMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center rounded-2xl">
      <span className="text-sm text-gray-400">Loading map…</span>
    </div>
  ),
})

export default async function VesselDetailPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const vessel = await getVesselById(id)
  if (!vessel) notFound()
  if (vessel.status === 'deleted') notFound()

  const [{ data: claimant }, { data: lastPort }, user] = await Promise.all([
    supabaseAdmin.from('profiles').select('id').eq('vessel_id', id).maybeSingle(),
    supabaseAdmin.from('vessel_last_port').select('port_city, port_state, port_country, lat, lon, arrived_at').eq('vessel_id', id).maybeSingle(),
    getServerUser(),
  ])
  const isClaimed = !!claimant

  const isAdmin = user
    ? await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => data?.role === 'admin')
    : false

  const activity = stripHtml(vessel.main_activity)
  const photos = vessel.photo_urls ?? []
  const docs = vessel.doc_details ?? []
  const homeLat = vessel.primary_latitude ? parseFloat(vessel.primary_latitude) : null
  const homeLng = vessel.primary_longitude ? parseFloat(vessel.primary_longitude) : null
  const hasCoords = homeLat !== null && homeLng !== null && !isNaN(homeLat) && !isNaN(homeLng)
  const portCallLat = lastPort?.lat != null ? Number(lastPort.lat) : null
  const portCallLng = lastPort?.lon != null ? Number(lastPort.lon) : null
  const hasPortCall = !!lastPort?.port_city && portCallLat !== null && portCallLng !== null && !isNaN(portCallLat) && !isNaN(portCallLng)
  const operatingArea = vessel.operating_area_geojson ?? null
  const hasArea = !!operatingArea && (operatingArea.features?.length ?? 0) > 0
  const showMap = hasCoords || hasPortCall || hasArea

  return (
    <div className="pt-[88px] bg-white min-h-screen">
      <SignupNudge vesselId={id} isAuthenticated={!!user} />
      {/* Retired / inactive banner */}
      {(vessel.status === 'retired' || vessel.status === 'inactive') && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-amber-800 font-medium">
              {vessel.status === 'retired'
                ? 'This vessel has been retired and is no longer in active service.'
                : 'This vessel is currently inactive.'}
            </p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-2">
        <nav className="flex items-center justify-between gap-2 text-sm text-gray-400">
          <BackButton />
          {isAdmin && (
            <Link
              href={`/admin/vessels/${id}/edit`}
              className="flex items-center gap-1.5 text-xs font-medium text-teal hover:text-teal/80 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit vessel
            </Link>
          )}
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* ── Left / Main column ─────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Hero photo */}
            <VesselPhotoGallery photos={photos} vesselName={vessel.name} country={vessel.country} />

            {/* Title + quick badges */}
            <div>
              <h1 className="text-3xl font-bold text-navy leading-tight">{vessel.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {lastPort?.port_city && (() => {
                  const flag = countryNameToFlag(lastPort.port_country) ?? ''
                  const city = lastPort.port_city
                  const days = lastPort.arrived_at
                    ? Math.floor((Date.now() - new Date(lastPort.arrived_at).getTime()) / 86400000)
                    : null
                  const age = days === null ? null
                    : days < 1 ? 'today'
                    : days < 30 ? `${days}d ago`
                    : days < 365 ? `${Math.floor(days / 30)}mo ago`
                    : `${Math.floor(days / 365)}yr ago`
                  return (
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <svg className="w-4 h-4 text-teal flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {[lastPort.port_city, lastPort.port_state, lastPort.port_country].filter(Boolean).join(', ')}{flag ? ` ${flag}` : ''}{age ? <span className="text-gray-400"> · {age}</span> : null}
                    </span>
                  )
                })()}
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

            {/* Specs */}
            <VesselDetailSpecs vessel={vessel} />

            {/* Documents */}
            {docs.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-navy mb-3">Documents</h2>
                <div className="space-y-2">
                  {docs.map((doc, i) => {
                    const label = doc.description
                      ?? doc.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')
                    const kb = doc.contentLength ? `${Math.round(doc.contentLength / 1024)} KB` : null
                    return (
                      <a
                        key={i}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-teal/40 hover:bg-gray-50 transition-colors group"
                      >
                        <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <IconPDF />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-navy truncate group-hover:text-teal transition-colors">{label}</p>
                          {kb && <p className="text-xs text-gray-400">{kb}</p>}
                        </div>
                        <svg className="w-4 h-4 text-gray-300 group-hover:text-teal flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Operator */}
            {(vessel.affiliation || vessel.operator_name) && (
              <div className="border border-gray-100 rounded-2xl p-5">
                <h2 className="text-lg font-semibold text-navy mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Operator
                </h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  {[
                    ['Affiliation', vessel.affiliation],
                    ['Operator', vessel.operator_name],
                    ['Country', vessel.country],

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
                </div>
              </div>
            )}

            {/* Map */}
            {showMap && (
              <div>
                <h2 className="text-lg font-semibold text-navy mb-3">Location</h2>
                <VesselMap
                  vesselName={vessel.name}
                  homePort={hasCoords ? { lat: homeLat!, lng: homeLng! } : null}
                  lastPort={hasPortCall ? { lat: portCallLat!, lng: portCallLng!, name: lastPort?.port_city, date: lastPort?.arrived_at } : null}
                  operatingArea={operatingArea}
                  height={280}
                />
              </div>
            )}

            {/* Operating area */}
            {vessel.operating_area && (
              <div>
                <h2 className="text-lg font-semibold text-navy mb-1">Operating Area</h2>
                <p className="text-gray-600 text-sm">{vessel.operating_area}</p>
              </div>
            )}
          </div>

          {/* ── Right / Booking column ─────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              <div className="border border-gray-200 rounded-2xl shadow-card p-6">
                <div className="mb-5">
                  <h3 className="text-lg font-bold text-navy">Connect with this vessel</h3>
                  {activity && (
                    <p className="text-xs text-gray-400 mt-1 leading-snug line-clamp-2">{activity}</p>
                  )}
                </div>

                <RequestButton vesselId={vessel.id} vesselName={vessel.name} />

                <p className="text-center text-xs text-gray-400 mt-3">
                  Messages are handled through Greenwater — your contact details stay private until you both agree to connect.
                </p>

                <div className="mt-3 pt-3 border-t border-gray-100">
                  {!isClaimed && (
                    <>
                      <ClaimButton vesselId={vessel.id} vesselName={vessel.name} />
                      <p className="text-center text-xs text-gray-400 mt-2">
                        Are you the operator of this vessel?
                      </p>
                    </>
                  )}
                </div>

              </div>

              <div className="flex items-center justify-center gap-6">
                <ShareButton title={vessel.name} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

function IconPDF() {
  return (
    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 15.5h-.75v1.25H7v-3.5h1.5c.69 0 1.25.56 1.25 1.25S9.19 15.5 8.5 15.5zm3.75 1.25h-1.5v-3.5H12.25c.96 0 1.75.79 1.75 1.75s-.79 1.75-1.75 1.75zm4.25-2.5h-1v.75h.875v.75H15.5v.75H14.5v-3.5H17v.75h-1.5v.5z"/>
    </svg>
  )
}
