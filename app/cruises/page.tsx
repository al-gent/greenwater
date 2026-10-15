import Link from 'next/link'
import { getUpcomingCruises, cruiseStage, STAGE_LABEL, STAGE_CLASS, fmtDateRange, cruiseDays, projectCount } from '@/lib/cruises'
import { getPhotoUrl } from '@/lib/vessel-utils'
import FleetTimeline from '@/components/FleetTimeline'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Research Cruises — VesselConnect',
  description: 'Scheduled research cruises across the U.S. Academic Research Fleet and VesselConnect operators.',
  robots: { index: false, follow: true },
}

const monthKey = (iso: string) => iso.slice(0, 7)
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function CruisesPage({ searchParams }: { searchParams: { view?: string; scale?: string; at?: string } }) {
  const view = searchParams.view === 'timeline' ? 'timeline' : 'list'
  const cruises = view === 'list' ? await getUpcomingCruises() : []

  const byMonth = new Map<string, typeof cruises>()
  for (const c of cruises) {
    const k = monthKey(c.departure_at)
    if (!byMonth.has(k)) byMonth.set(k, [])
    byMonth.get(k)!.push(c)
  }

  const viewToggle = (
    <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50 text-sm" role="tablist" aria-label="View">
      {(['list', 'timeline'] as const).map((v) => (
        <Link key={v} href={v === 'timeline' ? '/cruises?view=timeline' : '/cruises'} role="tab" aria-selected={view === v}
          className={`px-3 py-1.5 rounded-[10px] font-medium transition-colors ${view === v ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'}`}>
          {v === 'list' ? 'List' : 'Timeline'}
        </Link>
      ))}
    </div>
  )

  return (
    <div className="pt-[88px] bg-white min-h-screen">
      <div className={`${view === 'timeline' ? 'max-w-none' : 'max-w-7xl'} mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16`}>
        {view === 'list' && <div className="mb-4">{viewToggle}</div>}

        {view === 'timeline' && (
          <FleetTimeline basePath="/cruises" baseParams={{ view: 'timeline' }} scale={searchParams.scale} at={searchParams.at} toolbarStart={viewToggle} />
        )}

        {view === 'list' && cruises.length === 0 && <p className="text-gray-400 text-sm">No upcoming cruises.</p>}

        {view === 'list' && <div className="space-y-8">
          {[...byMonth.entries()].map(([k, list]) => (
            <section key={k}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3 sticky top-[88px] bg-white py-1">{monthLabel(k)}</h2>
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">
                {list.map((c) => {
                  const stage = cruiseStage(c as any)
                  const days = cruiseDays(c.departure_at, c.arrival_at)
                  return (
                    <li key={c.id}>
                      <Link href={`/cruises/${c.slug}`} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors group">
                        <div className="w-16 h-12 rounded-lg overflow-hidden bg-lightblue-100 flex-shrink-0 hidden sm:block">
                          {c.vessel && <img src={getPhotoUrl(c.vessel as any)} alt="" loading="lazy" className="w-full h-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="text-sm font-semibold text-navy truncate group-hover:text-teal transition-colors">{c.title}</p>
                            {projectCount(c) > 1 && <span className="text-[11px] font-medium text-teal bg-teal/10 rounded-full px-1.5 py-px" title={`${projectCount(c)} projects share this sailing`}>+{projectCount(c) - 1}</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            <span className="font-medium text-gray-700">{c.vessel?.name ?? 'Unknown vessel'}</span>
                            {c.organization && <> · {c.organization.short_name ?? c.organization.name}</>}
                            {c.operating_area && <> · {c.operating_area}</>}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-medium text-navy">{fmtDateRange(c.departure_at, c.arrival_at)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {days} d
                            {c.berths_open != null && <> · <span className="text-teal font-medium">{c.berths_open} berth{c.berths_open === 1 ? '' : 's'} open</span></>}
                          </p>
                        </div>
                        <span className={`hidden md:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${STAGE_CLASS[stage]}`}>{STAGE_LABEL[stage]}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>}
      </div>
    </div>
  )
}
