/**
 * The fleet timeline as one drop-in block: toolbar (Today, scale, row height), the
 * lazy-loading timeline, and the legend. Server component; reads the viewer's zone and
 * preferences, loads the fleet and the first span. State lives in the URL (?scale, ?at,
 * ?rows) on top of `basePath` + `baseParams`, so it works on any page.
 */
import Link from 'next/link'
import CruiseTimeline from '@/components/CruiseTimeline'
import GotoDateButton from '@/components/timeline/GotoDateButton'
import { getVesselTimeline, getArfFleet } from '@/lib/cruises'
import { fleetToResources } from '@/lib/cruise-timeline'
import { todayIso, indexToDate, isoDateIndex } from '@/lib/timeline/time'
import { isScale, initialSpan, SCALES, SCALE_LABEL, type TimelineScale } from '@/lib/timeline/scale'
import { getViewerPreferences, timeZoneLabel } from '@/lib/preferences'

interface Props {
  basePath: string                           // '/research'
  baseParams?: Record<string, string>        // params to keep on every link, e.g. { view: 'timeline' }
  scale?: string                             // from the page's searchParams
  at?: string
  toolbarStart?: React.ReactNode             // extra controls on the left of the toolbar (e.g. a view toggle)
  vessels?: { id: number; name: string; operator_name?: string | null; affiliation?: string | null }[]   // fixed rows instead of the ARF fleet (My fleet, shared links)
}

export default async function FleetTimeline({ basePath, baseParams = {}, scale: scaleParam, at: atParam, toolbarStart, vessels }: Props) {
  const viewer = await getViewerPreferences()
  const timeZone = viewer.timeZone
  const today = todayIso(timeZone)
  const scale: TimelineScale = isScale(scaleParam) ? scaleParam : viewer.timelineScale ?? 'year'
  const at = /^\d{4}-\d{2}-\d{2}$/.test(atParam ?? '') ? atParam! : today
  const span = initialSpan(scale, at)
  const vesselIds = vessels?.map((v) => v.id)
  const [entries, fleet] = await Promise.all([
    getVesselTimeline({ from: indexToDate(isoDateIndex(span.start)), to: indexToDate(isoDateIndex(span.end)), vesselIds }),
    vessels ? Promise.resolve(null) : getArfFleet(),
  ])
  const resources = fleet ? fleetToResources(fleet) : (vessels ?? []).map((v) => ({ id: `vessel:${v.id}`, label: v.name, kind: 'vessel' as const, href: `/vessels/${v.id}`, sublabel: v.operator_name ?? v.affiliation ?? undefined }))

  const href = (q: { scale?: TimelineScale; at?: string }) => {
    const p = new URLSearchParams(baseParams)
    const sc = q.scale ?? scale, a = q.at ?? at
    if (sc !== (viewer.timelineScale ?? 'year')) p.set('scale', sc)
    if (a !== today) p.set('at', a)
    const qs = p.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }
  const seg = (active: boolean) => `px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors ${active ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'}`

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {toolbarStart}
          <GotoDateButton date={today} href={href({ at: today })} className="px-3 h-8 rounded-lg border border-gray-200 text-sm flex items-center text-gray-600 hover:text-navy hover:border-navy/30">Today</GotoDateButton>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50" role="tablist" aria-label="Scale">
            {SCALES.map((sc) => (
              <Link key={sc} href={href({ scale: sc })} role="tab" aria-selected={scale === sc} className={seg(scale === sc)}>{SCALE_LABEL[sc]}</Link>
            ))}
          </div>
        </div>
      </div>

      <CruiseTimeline
        key={`${scale}|${at}`}
        scale={scale}
        at={at}
        span={span}
        timeZone={timeZone}
        today={today}
        initialRows={entries}
        resources={resources}
        vesselIds={vesselIds}
        emptyRowText={scale === 'year' ? undefined : 'Nothing scheduled'}
        density="spacious"
      />

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-navy" /> Scheduled</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gold-100 border border-dashed border-gold-400" /> Tentative</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-teal" /> Underway</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-navy-100" /> Completed</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-gray-200 bg-[repeating-linear-gradient(135deg,#e5e7eb_0_3px,#f3f4f6_3px_6px)]" /> Unavailable</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3 bg-gold" /> Today</span>
        <span className="text-gray-400">Times in {timeZoneLabel(timeZone)}{viewer.source === 'browser' ? ' (your browser)' : viewer.source === 'saved' ? ' (your preference)' : ''}. Scroll sideways; more loads as you go.</span>
      </div>
    </div>
  )
}
