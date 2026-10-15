import Link from 'next/link'
import type { BrowseProject } from '@/lib/projects'
import type { CruiseListItem } from '@/lib/cruises'
import { cruiseStage, STAGE_LABEL, STAGE_CLASS, fmtDateRange, fmtDate, cruiseDays } from '@/lib/cruise-utils'
import { getPhotoUrl } from '@/lib/vessel-utils'

/**
 * One piece of research, as a card. A scheduled project reads where, when, vessel, photo and
 * status through its cruise; a proposed one uses its own request. The cruise is one line.
 */
export default function ProjectCard({ project: p, cruise: c, siblings = 0, showPhoto = true }: { project: BrowseProject; cruise: CruiseListItem | null; siblings?: number; showPhoto?: boolean }) {
  const stage = c ? cruiseStage(c as any) : null
  const status = stage ? STAGE_LABEL[stage] : 'Proposed'
  const statusCls = stage ? STAGE_CLASS[stage] : 'bg-gold-100 text-navy-800 border-gold-300'
  const photo = c?.vessel?.photo_urls?.length ? getPhotoUrl(c.vessel as any) : null
  const where = c?.operating_area ?? p.area_label ?? null
  const a = fmtDate(p.requested_start_earliest), b = fmtDate(p.requested_start_latest)
  const when = c ? fmtDateRange(c.departure_at, c.arrival_at) : a && b ? `${a} – ${b}` : a ? `${a} or later` : b ? `By ${b}` : 'Dates flexible'
  const days = c ? cruiseDays(c.departure_at, c.arrival_at) : p.requested_science_days
  const org = c?.organization?.short_name ?? c?.organization?.name ?? null

  return (
    <article className={`group relative w-full bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1 flex flex-col ${showPhoto ? 'h-[440px]' : 'h-[296px]'}`}>
      {/* Scheduled research opens the cruise it sails on (the sailing page holds every project aboard); proposed research opens the project. */}
      <Link href={c ? `/cruises/${c.slug}` : `/projects/${p.slug}`} className="absolute inset-0 z-10" aria-label={p.title} />
      {showPhoto ? <div className="relative h-36 bg-lightblue-100 overflow-hidden">
        {photo ? (
          <img src={photo} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full bg-[radial-gradient(ellipse_at_top_left,_#dbeaf3,_#b8d9e8)]" />
        )}
        <span className={`absolute top-2.5 right-2.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCls}`}>{status}</span>
        {/* Vessel over its photo; the operator in smaller type beside it. */}
        <div className={`absolute inset-x-0 bottom-0 px-3 pt-6 pb-2 ${photo ? 'bg-gradient-to-t from-navy/70 to-transparent text-white' : 'text-navy/70'}`}>
          <p className="text-sm font-medium truncate">
            {c ? <Link href={`/vessels/${c.vessel_id}`} className="relative z-20 hover:underline">{c.vessel?.name ?? 'Unknown vessel'}</Link> : 'No vessel yet'}
            {org && <span className={`text-xs font-normal ${photo ? 'text-white/80' : 'text-navy/50'}`}> · {org}</span>}
          </p>
        </div>
      </div> : (
        <span className={`absolute top-3 right-3 z-20 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCls}`}>{status}</span>
      )}
      <div className="p-4 flex flex-col gap-2 flex-1 min-h-0">
        <h3 className={`font-semibold text-navy leading-snug line-clamp-2 group-hover:text-teal transition-colors ${showPhoto ? '' : 'pr-20'}`}>{p.title}</h3>
        {p.lead && (
          <p className="text-xs text-gray-500 truncate">
            {p.lead.name}
            {p.lead.affiliation && <span className="text-gray-400"> · {p.lead.affiliation}</span>}
            {p.lead.role !== 'Principal investigator' && <span className="text-gray-400"> · {p.lead.role}</span>}
          </p>
        )}
        {/* Fills whatever height the title leaves, then fades: no clamp, so no stray blank line. */}
        {p.summary && (
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <p className="text-sm text-gray-600 leading-snug">{p.summary}</p>
            <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white to-transparent" />
          </div>
        )}
        <div className="mt-auto pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-0.5 shrink-0">
          <p className="text-gray-700 truncate">{when}{days ? <span className="text-gray-400"> · {days} d</span> : null}</p>
          {where && <p className="truncate">{where}</p>}
          {c ? (
            siblings > 0 && <p><Link href={`/cruises/${c.slug}`} className="relative z-20 text-teal hover:underline">Sails with {siblings} other project{siblings === 1 ? '' : 's'}</Link></p>
          ) : (
            <p>{p.party_size ? `${p.party_size} aboard · ` : ''}open for bids</p>
          )}
        </div>
      </div>
    </article>
  )
}
