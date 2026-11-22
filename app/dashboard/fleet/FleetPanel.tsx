import Link from 'next/link'
import { getMyFleet } from '@/lib/fleet'
import FleetTimeline from '@/components/FleetTimeline'
import CopyLinkButton from '@/components/CopyLinkButton'

export default async function FleetPanel({ userId, scale, at }: { userId: string; scale?: string; at?: string }) {
  const fleet = await getMyFleet(userId)
  const shareHref = `/research?view=timeline&vessels=${fleet.map((v) => v.id).join(',')}`

  return (
    <section className="rounded-2xl bg-white p-4 sm:p-6 shadow-card">
      <h1 className="text-xl font-bold text-navy">Vessel Watchlist</h1>
      <p className="mt-1 mb-5 text-sm text-gray-600">Keep an eye on the schedules of vessels you’ve saved.</p>
      {fleet.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-14 text-center">
          <p className="text-sm text-gray-600">Your watchlist is empty.</p>
          <p className="text-xs text-gray-400 mt-1">Open any vessel and press <span className="font-medium text-navy">Add to watchlist</span>. Its schedule shows up here.</p>
          <Link href="/vessels" className="inline-block mt-4 bg-navy text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-navy-600">Browse vessels</Link>
        </div>
      ) : (
        <FleetTimeline basePath="/dashboard/fleet" scale={scale} at={at} vessels={fleet}
          toolbarStart={<CopyLinkButton path={shareHref} className="px-3 h-8 rounded-lg border border-gray-200 text-sm flex items-center text-gray-600 hover:text-navy hover:border-navy/30">Share schedule</CopyLinkButton>} />
      )}
    </section>
  )
}
