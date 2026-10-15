import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getOperatedVesselIds } from '@/lib/operators'
import { getProject, getProjectAsAdmin, getProjectGear, getProjectPeople, getProjectBids } from '@/lib/projects'
import { fmtDate } from '@/lib/cruise-utils'
import { isUuid } from '@/lib/project-utils'
import ProjectAreaMap from '@/components/ProjectAreaMap'
import ProjectBids from '@/components/ProjectBids'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const p = await getProject(params.slug)
  return { title: p ? `${p.title} — VesselConnect` : 'Project — VesselConnect', robots: { index: false, follow: true } }
}

// One page, three views: anyone sees a published project; the author (or an admin) also
// gets Edit and the bids with Accept/Decline; an operator gets "Bid" and their own bids.
export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const user = await getServerUser()
  let project = await getProject(params.slug)
  let isAuthor = false, isAdmin = false, operatedVessels: number[] = []
  if (user) {
    const [mine, { data: profile }, vesselIds] = await Promise.all([
      getProjectAsAdmin(params.slug),
      supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single(),
      getOperatedVesselIds(user.id),
    ])
    isAdmin = profile?.is_admin === true
    isAuthor = !!mine && mine.created_by === user.id
    operatedVessels = vesselIds
    if (mine && (isAuthor || isAdmin)) project = mine
  }
  if (!project) notFound()
  if (isUuid(params.slug)) permanentRedirect(`/projects/${project.slug}`)
  const canDecide = isAuthor || isAdmin
  const isOperator = operatedVessels.length > 0
  const [gear, people, bids] = await Promise.all([
    getProjectGear(project.id, canDecide),
    getProjectPeople(project.id, canDecide),
    canDecide ? getProjectBids(project.id) : isOperator ? getProjectBids(project.id, { vesselIds: operatedVessels }) : Promise.resolve([]),
  ])
  const earliest = fmtDate(project.requested_start_earliest), latest = fmtDate(project.requested_start_latest)
  const targetStart = earliest && latest ? `${earliest} – ${latest}` : earliest ? `${earliest} or later` : latest ? `By ${latest}` : 'Flexible'
  const status = project.cruise_id ? 'Scheduled' : project.published_at ? 'Open for bids' : 'Draft'
  const hasArea = !!project.area_geojson?.features?.length
  const myOpenBid = bids.find((b) => !b.confirmed_at && !b.declined_at && !b.withdrawn_at && operatedVessels.includes(b.vessel_id))

  return (
    <div className="pt-[88px] bg-white min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16 space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-navy leading-tight">{project.title}</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${project.cruise_id ? 'bg-teal/10 text-teal border-teal/30' : project.published_at ? 'bg-navy-50 text-navy border-navy/10' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>{status}</span>
          </div>
          <div className="flex items-center gap-2">
            {canDecide && <Link href={`/projects/${project.slug}/edit`} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-navy hover:border-navy/30">Edit</Link>}
            {/* Anyone who operates a vessel can bid, including the author scheduling it on their own boat. */}
            {project.published_at && !project.cruise_id && (
              isOperator
                ? <Link href={`/projects/${project.slug}/bid`} className="px-4 py-2 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-600">{myOpenBid ? 'Update your bid' : 'Bid on this project'}</Link>
                : !user && <Link href={`/auth/signin?next=/projects/${project.slug}`} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-navy hover:border-navy/30">Sign in to bid</Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            {project.summary ? <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{project.summary}</p> : <p className="text-sm text-gray-400">No description yet.</p>}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div>
                <dt className="text-gray-500">Target start date</dt>
                <dd className="text-navy">{targetStart}{project.dates_notes ? <span className="block text-gray-500 text-xs mt-0.5">{project.dates_notes}</span> : null}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Science days</dt>
                <dd className="text-navy">{project.requested_science_days ?? 'Not stated'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Where</dt>
                <dd className="text-navy">{project.area_label ?? (hasArea ? 'Area drawn on the map' : 'Not stated')}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Funding</dt>
                <dd className="text-navy">{[project.funding_status && project.funding_status[0].toUpperCase() + project.funding_status.slice(1), project.funding_source, project.grant_number].filter(Boolean).join(' · ') || 'Not stated'}{project.funding_notes ? <span className="block text-gray-500 text-xs mt-0.5">{project.funding_notes}</span> : null}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Science personnel</dt>
                <dd className="text-navy">
                  {people.map((r) => <span key={r.id} className="block">{r.name}{r.role && <span className="text-gray-500"> · {r.role.label}</span>}</span>)}
                  {project.party_size != null ? <span className="block text-gray-500">{project.party_size} total</span> : people.length === 0 ? 'Not stated' : null}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Gear requested</dt>
                <dd>{gear.length ? <ul className="flex flex-wrap gap-1.5 mt-0.5">{gear.map((g) => <li key={g.id} className="text-xs text-navy bg-navy-50 rounded-full px-2.5 py-1">{g.label}{g.quantity && g.quantity > 1 ? ` ×${g.quantity}` : ''}</li>)}</ul> : <span className="text-navy">Nothing listed</span>}</dd>
              </div>
            </dl>
          </div>
          <div>
            {hasArea ? <ProjectAreaMap area={project.area_geojson!} /> : (
              <div className="rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-sm text-gray-400" style={{ height: 300 }}>No area drawn</div>
            )}
          </div>
        </div>

        {(canDecide || isOperator) && (
          <div>
            <h2 className="text-lg font-semibold text-navy mb-1">{canDecide ? 'Bids' : 'Your bids'}</h2>
            <p className="text-xs text-gray-400 mb-3">
              {canDecide ? 'Operators who can run this project. Accept one and the operator confirms the cruise.' : 'Bids from vessels you operate.'}
            </p>
            <ProjectBids projectId={project.id} bids={bids} gear={gear} canDecide={canDecide && !project.cruise_id} />
          </div>
        )}

        {project.cruise_id && <p className="text-sm"><Link href={`/cruises/${project.cruise_id}`} className="text-teal font-medium hover:underline">View the cruise this is scheduled on →</Link></p>}
      </div>
    </div>
  )
}
