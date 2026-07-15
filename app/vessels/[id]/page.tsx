import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getVesselById, fmt, fmtDailyRate, stripHtml } from '@/lib/vessels'
import { getTrackWindow } from '@/lib/track'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerUser } from '@/lib/supabase-server'
import RequestButton from '@/components/RequestButton'
import ClaimButton from '@/components/ClaimButton'
import VesselPhotoGallery from '@/components/VesselPhotoGallery'
import VesselDetailSpecs from '@/components/VesselDetailSpecs'
import VesselTrackSection from '@/components/VesselTrackSection'
import SignupNudge from '@/components/SignupNudge'
import BackButton from '@/components/BackButton'
import ShareButton from '@/components/ShareButton'

// Per-vessel share cards: link previews show the vessel's name, its activity,
// and its own photo instead of the generic site card.
export async function generateMetadata({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const vessel = isNaN(id) ? null : await getVesselById(id)
  if (!vessel || vessel.status === 'deleted') return {}

  const title = `${vessel.name} — VesselConnect`
  const activity = stripHtml(vessel.main_activity ?? '').trim()
  const description = activity
    ? (activity.length > 160 ? activity.slice(0, 157) + '…' : activity)
    : `Research vessel${vessel.country ? ` from ${vessel.country}` : ''} on VesselConnect — connecting marine scientists with research vessels worldwide.`
  const photo = vessel.photo_urls?.[0]
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.vesselconnect.org'}/vessels/${id}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url,
      siteName: 'VesselConnect',
      ...(photo ? { images: [{ url: photo, alt: vessel.name }] } : {}),
    },
    twitter: {
      card: photo ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(photo ? { images: [photo] } : {}),
    },
  }
}

export default async function VesselDetailPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const vessel = await getVesselById(id)
  if (!vessel) notFound()
  if (vessel.status === 'deleted') notFound()

  const [{ data: claimant }, { data: lastPort }, yearWindow, user] = await Promise.all([
    supabaseAdmin.from('profiles').select('id').eq('vessel_id', id).maybeSingle(),
    supabaseAdmin.from('vessel_last_port').select('port_city, port_state, port_country, lat, lon, arrived_at').eq('vessel_id', id).maybeSingle(),
    getTrackWindow(supabaseAdmin, id, 365),
    getServerUser(),
  ])

  // Default the track to the last year; fall back to all-time for vessels
  // whose activity is older (so the map never opens empty when data exists).
  let initialDays: number | null = 365
  let initialWindow = yearWindow
  if (yearWindow.events.length < 5) {
    const allTime = await getTrackWindow(supabaseAdmin, id, null)
    if (allTime.events.length > yearWindow.events.length) {
      initialDays = null
      initialWindow = allTime
    }
  }
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
  const showMap = hasCoords || hasPortCall || hasArea || initialWindow.events.length > 0

  // Schema.org structured data for rich search results
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Vehicle',
    name: vessel.name,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.vesselconnect.org'}/vessels/${id}`,
    ...(photos.length ? { image: photos } : {}),
    ...(activity ? { description: activity } : {}),
    ...(vessel.year_built ? { modelDate: String(vessel.year_built) } : {}),
    ...(vessel.operator_name || vessel.affiliation
      ? { brand: { '@type': 'Organization', name: vessel.operator_name ?? vessel.affiliation } }
      : {}),
  }

  return (
    <div className="pt-[88px] bg-white min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
        <div className="space-y-6">

            {/* Title + actions + quick badges */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <h1 className="text-3xl font-bold text-navy leading-tight min-w-0">{vessel.name}</h1>
                <div className="flex items-center gap-5 flex-shrink-0">
                  <ShareButton title={vessel.name} />
                  <RequestButton vesselId={vessel.id} vesselName={vessel.name} compact />
                </div>
              </div>
              {(vessel.affiliation || vessel.operator_name) && (
                <p className="text-sm text-gray-500 mt-1">
                  {[...new Set([vessel.affiliation, vessel.operator_name].filter(Boolean))].join(' · ')}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {vessel.vessel_of_opportunity === true && (
                  <span
                    className="bg-amber-50 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-amber-200"
                    title="A pleasure craft, fishing, or working vessel that can also be used to perform research"
                  >
                    Vessel of opportunity
                  </span>
                )}
                {vessel.daily_rate != null && (
                  <span className="bg-navy-50 text-navy text-xs font-semibold px-2.5 py-1 rounded-full border border-navy/10">
                    Est. {fmtDailyRate(vessel.daily_rate, vessel.daily_rate_currency)}/day
                  </span>
                )}
              </div>
            </div>

            {/* Hero photo + map, side by side on wide viewports */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <div className={showMap ? '' : 'lg:col-span-2'}>
                <VesselPhotoGallery photos={photos} vesselName={vessel.name} country={vessel.country} />
                {activity && (
                  <p className="text-gray-600 text-sm leading-relaxed mt-3">{activity}</p>
                )}
              </div>
              {showMap && (
                <div>
                  <VesselTrackSection
                    vesselId={id}
                    vesselName={vessel.name}
                    homePort={hasCoords ? { lat: homeLat!, lng: homeLng! } : null}
                    lastPort={hasPortCall ? { lat: portCallLat!, lng: portCallLng!, name: lastPort?.port_city, date: lastPort?.arrived_at } : null}
                    operatingArea={operatingArea}
                    initialDays={initialDays}
                    initialWindow={initialWindow}
                  />
                  {vessel.operating_area && (
                    <p className="text-sm text-gray-600 mt-1.5">
                      <span className="font-medium text-navy">Operating area:</span> {vessel.operating_area}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Specs */}
            <VesselDetailSpecs vessel={vessel} />

            {/* Divider */}
            <hr className="border-gray-100" />

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

            {/* Operating area (fallback placement for vessels with no map) */}
            {vessel.operating_area && !showMap && (
              <div>
                <h2 className="text-lg font-semibold text-navy mb-1">Operating Area</h2>
                <p className="text-gray-600 text-sm">{vessel.operating_area}</p>
              </div>
            )}

            {/* Claim */}
            {!isClaimed && (
              <div className="border-t border-gray-100 pt-6 flex flex-col items-center gap-3">
                <p className="text-sm text-gray-400">Are you the operator of this vessel?</p>
                <div className="w-full max-w-xs">
                  <ClaimButton vesselId={vessel.id} vesselName={vessel.name} />
                </div>
              </div>
            )}
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
