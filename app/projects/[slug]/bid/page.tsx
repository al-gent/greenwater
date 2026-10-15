import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getOperatedVesselIds } from '@/lib/operators'
import { getProject, getProjectGear, getProjectBids } from '@/lib/projects'
import BidForm, { type BidVessel } from '@/components/BidForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Bid on a project — VesselConnect', robots: { index: false, follow: false } }

export default async function BidPage({ params }: { params: { slug: string } }) {
  const user = await getServerUser()
  if (!user) redirect(`/auth/signin?next=/projects/${params.slug}/bid`)
  const project = await getProject(params.slug)
  if (!project || !project.published_at) notFound()
  const vesselIds = await getOperatedVesselIds(user.id)
  if (!vesselIds.length) {
    return (
      <div className="pt-[88px] bg-white min-h-screen"><div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <h1 className="text-2xl font-bold text-navy">Bidding needs a vessel</h1>
        <p className="text-sm text-gray-600 mt-2">Only operators of a vessel on VesselConnect can bid. <Link href="/list-your-vessel" className="text-teal font-medium hover:underline">List your vessel</Link> or claim one you operate, then come back.</p>
        <p className="text-sm mt-4"><Link href={`/projects/${project.slug}`} className="text-gray-500 hover:text-navy">← Back to the project</Link></p>
      </div></div>
    )
  }
  const [{ data: vessels }, gear, bids] = await Promise.all([
    supabaseAdmin.from('vessels').select('id, name, scientists, daily_rate, daily_rate_currency').in('id', vesselIds).order('name'),
    getProjectGear(project.id),
    getProjectBids(project.id, { vesselIds }),
  ])
  const open = bids.find((b) => !b.accepted_at && !b.confirmed_at && !b.declined_at && !b.withdrawn_at) ?? null
  return (
    <div className="pt-[88px] bg-white min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <p className="text-sm text-gray-400 mb-2"><Link href={`/projects/${project.slug}`} className="hover:text-navy">← {project.title}</Link></p>
        <h1 className="text-3xl font-bold text-navy leading-tight">{open ? 'Update your bid' : 'Bid on this project'}</h1>
        <p className="text-sm text-gray-500 mt-1 mb-8">{project.cruise_id ? 'This project is already scheduled.' : 'Say when you could run it, what it would cost, and which gear you can cover. The researcher accepts one bid; you then confirm and the cruise goes on your schedule.'}</p>
        {project.cruise_id ? null : <BidForm project={project} gear={gear} vessels={(vessels ?? []) as BidVessel[]} bid={open} />}
      </div>
    </div>
  )
}
