import Link from 'next/link'
import { getUpcomingCruises, getPastCruises } from '@/lib/cruises'
import { listOpenProjects } from '@/lib/projects'
import { projectCardsForCruises, type ProjectCardData } from '@/lib/project-cards'
import FleetTimeline from '@/components/FleetTimeline'
import ProjectCard from '@/components/ProjectCard'
import PagedList from '@/components/PagedList'
import { getVesselsByIds } from '@/lib/fleet'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Research — VesselConnect',
  description: 'Research at sea: projects proposed, scheduled and completed across the U.S. Academic Research Fleet and VesselConnect operators.',
  robots: { index: false, follow: true },
}

type Tab = 'upcoming' | 'proposed' | 'past'
const TABS: { key: Tab; label: string }[] = [{ key: 'upcoming', label: 'Upcoming' }, { key: 'proposed', label: 'Proposed' }, { key: 'past', label: 'Past' }]
const PAST_PAGE = 24

// Projects are the unit here; a cruise is how several of them share a vessel. Cards for the
// scheduled ones read through their cruise. The timeline stays the vessel view.
export default async function ShipTimePage({ searchParams }: { searchParams: { tab?: string; page?: string; view?: string; scale?: string; at?: string; vessels?: string } }) {
  const view = searchParams.view === 'timeline' ? 'timeline' : 'cards'
  // A shared fleet link: ?vessels=1,2,3 pins the timeline to those rows.
  const pinnedIds = (searchParams.vessels ?? '').split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100)
  const pinned = view === 'timeline' && pinnedIds.length ? await getVesselsByIds(pinnedIds) : null
  const tab: Tab = (TABS.find((t) => t.key === searchParams.tab)?.key ?? 'upcoming')
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)

  let cards: ProjectCardData[] = []
  let total = 0
  if (view === 'cards') {
    if (tab === 'proposed') {
      const open = await listOpenProjects()
      cards = open.map((project) => ({ project, cruise: null, siblings: 0 }))
      total = cards.length
    } else {
      const { cruises, count } = tab === 'upcoming'
        ? await getUpcomingCruises().then((cruises) => ({ cruises, count: cruises.length }))
        : await getPastCruises({ page, limit: PAST_PAGE }).then(({ cruises, total }) => ({ cruises, count: total }))
      cards = await projectCardsForCruises(cruises)
      total = tab === 'upcoming' ? cards.length : count
    }
  }

  const tabHref = (t: Tab) => (t === 'upcoming' ? '/research' : `/research?tab=${t}`)
  const seg = (active: boolean) => `px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors ${active ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'}`
  const pastPages = Math.max(1, Math.ceil(total / PAST_PAGE))

  return (
    <div className="pt-[88px] bg-white min-h-screen">
      <div className={`${view === 'timeline' ? 'max-w-none' : 'max-w-7xl'} mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16`}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 max-w-7xl mx-auto">
          <h1 className="sr-only">Research</h1>
          <div className="flex items-center gap-2">
            {view === 'cards' && (
              <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50" role="tablist">
                {TABS.map((t) => <Link key={t.key} href={tabHref(t.key)} role="tab" aria-selected={tab === t.key} className={seg(tab === t.key)}>{t.label}</Link>)}
              </div>
            )}
            <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50" role="tablist" aria-label="View">
              <Link href={tabHref(tab)} role="tab" aria-selected={view === 'cards'} className={seg(view === 'cards')}>Projects</Link>
              <Link href="/research?view=timeline" role="tab" aria-selected={view === 'timeline'} className={seg(view === 'timeline')}>Timeline</Link>
            </div>
          </div>
        </div>

        {view === 'timeline' && pinned && pinned.length > 0 && (
          <p className="text-xs text-gray-500 mb-3">A shared fleet of {pinned.length} vessel{pinned.length === 1 ? '' : 's'}. <Link href="/research?view=timeline" className="text-teal hover:underline">See the whole fleet</Link></p>
        )}
        {view === 'timeline' && <FleetTimeline basePath="/research" baseParams={pinned?.length ? { view: 'timeline', vessels: pinnedIds.join(',') } : { view: 'timeline' }} scale={searchParams.scale} at={searchParams.at} vessels={pinned?.length ? pinned : undefined} />}

        {view === 'cards' && cards.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center">
            <p className="text-sm text-gray-500">{tab === 'proposed' ? 'No proposed projects right now.' : tab === 'upcoming' ? 'Nothing scheduled.' : 'No past projects.'}</p>
          </div>
        )}

        {view === 'cards' && cards.length > 0 && tab !== 'past' && (
          <PagedList noun="projects" pageSize={24} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            items={cards.map((x) => <li key={x.project.id} className="flex"><ProjectCard {...x} /></li>)} />
        )}

        {view === 'cards' && cards.length > 0 && tab === 'past' && (
          <>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {cards.map((x) => <li key={x.project.id} className="flex"><ProjectCard {...x} /></li>)}
            </ul>
            <div className="flex items-center justify-center gap-4 mt-8 text-sm">
              {page > 1 ? <Link href={`/research?tab=past&page=${page - 1}`} className="px-3 py-1.5 rounded-lg border border-gray-200 text-navy hover:border-navy/30">Newer</Link> : <span />}
              <span className="text-xs text-gray-400">Page {page} of {pastPages}</span>
              {page < pastPages ? <Link href={`/research?tab=past&page=${page + 1}`} className="px-3 py-1.5 rounded-lg border border-gray-200 text-navy hover:border-navy/30">Older</Link> : <span />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
