import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import { getMyFleet } from '@/lib/fleet'
import FleetTimeline from '@/components/FleetTimeline'
import CopyLinkButton from '@/components/CopyLinkButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My Fleet — VesselConnect', robots: { index: false, follow: false } }

// The vessels you watch, on one resource timeline. Build the list from vessel pages.
export default async function FleetPage({ searchParams }: { searchParams: { scale?: string; at?: string } }) {
  const user = await getServerUser()
  if (!user) redirect('/auth/signin?next=/fleet')
  const fleet = await getMyFleet(user.id)
  const shareHref = `/research?view=timeline&vessels=${fleet.map((v) => v.id).join(',')}`

  return (
    <div className="pt-[88px] bg-white min-h-screen">
      <div className="max-w-none mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <h1 className="sr-only">My fleet</h1>
        {fleet.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-14 text-center">
            <p className="text-sm text-gray-600">Nothing here yet.</p>
            <p className="text-xs text-gray-400 mt-1">Open any vessel and press <span className="font-medium text-navy">Add to my fleet</span>. Its schedule shows up here.</p>
            <Link href="/" className="inline-block mt-4 bg-navy text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-navy-600">Browse vessels</Link>
          </div>
        ) : (
          <FleetTimeline basePath="/fleet" scale={searchParams.scale} at={searchParams.at} vessels={fleet}
            toolbarStart={<CopyLinkButton path={shareHref} className="px-3 h-8 rounded-lg border border-gray-200 text-sm flex items-center text-gray-600 hover:text-navy hover:border-navy/30">Share schedule</CopyLinkButton>} />
        )}
      </div>
    </div>
  )
}
