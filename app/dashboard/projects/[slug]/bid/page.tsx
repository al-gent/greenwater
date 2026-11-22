import DashboardContent from '../../../DashboardContent'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getOperatedVesselIds } from '@/lib/operators'
import { getProject, getProjectGear, getProjectBids } from '@/lib/projects'
import BidForm, { type BidVessel } from '@/components/BidForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Bid on a project — VesselConnect', robots: { index: false, follow: false } }

async function BidPage({ params }: { params: { slug: string } }) {
  const user = await getServerUser()
  if (!user) redirect(`/auth/signin?next=/dashboard/projects/${params.slug}/bid`)
  const project = await getProject(params.slug)
  if (!project || !project.published_at || project.source === 'demo') notFound()
  const vesselIds = await getOperatedVesselIds(user.id)
  if (!vesselIds.length) {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl bg-white p-4 shadow-card sm:p-6">
        <h1 className="text-2xl font-bold text-navy">Bidding needs a vessel</h1>
        <p className="text-sm text-gray-600 mt-2">Only operators of a vessel on VesselConnect can bid. <Link href="/dashboard/listings/new" className="text-teal font-medium hover:underline">List your vessel</Link> or claim one you operate, then come back.</p>
      </section>
    )
  }
  const [{ data: vessels }, gear, bids] = await Promise.all([
    supabaseAdmin.from('vessels').select('id, name, scientists, daily_rate, daily_rate_currency').in('id', vesselIds).order('name'),
    getProjectGear(project.id),
    getProjectBids(project.id, { vesselIds }),
  ])
  const open = bids.find((b) => !b.accepted_at && !b.confirmed_at && !b.declined_at && !b.withdrawn_at) ?? null
  return (
    <section className="mx-auto max-w-3xl rounded-2xl bg-white p-4 shadow-card sm:p-6">
        <h1 className="text-3xl font-bold text-navy leading-tight">{open ? 'Update your bid' : 'Bid on this project'}</h1>
        <p className="text-sm text-gray-500 mt-1 mb-8">{project.cruise_id ? 'This project is already scheduled.' : 'Say when you could run it, what it would cost, and which gear you can cover. The researcher accepts one bid; you then confirm and the cruise goes on your schedule.'}</p>
        {project.cruise_id ? null : <BidForm project={project} gear={gear} vessels={(vessels ?? []) as BidVessel[]} bid={open} />}
    </section>
  )
}

export default function Page({ params }: { params: { slug: string } }) {
  const href = `/dashboard/projects/${encodeURIComponent(params.slug)}/bid`
  return (
    <DashboardContent section="projects" currentPage={{ label: 'Project bid', href }}>
      <BidPage params={params} />
    </DashboardContent>
  )
}
