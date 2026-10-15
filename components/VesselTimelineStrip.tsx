/**
 * One vessel's row of the timeline, scrolling both ways with more loading as you go, with an
 * optional cruise highlighted. Shared by the cruise page (opens around that cruise) and the
 * vessel page (opens around today). Hover cards included; the fleet timeline is a link.
 */
import Link from 'next/link'
import VesselStripClient from '@/components/VesselStripClient'
import { getVesselTimeline } from '@/lib/cruises'
import { fleetToResources } from '@/lib/cruise-timeline'
import { getViewerPreferences } from '@/lib/preferences'
import { todayIso } from '@/lib/timeline/time'

const iso = (d: Date) => d.toISOString().slice(0, 10)

export interface VesselTimelineStripProps {
  vesselId: number
  vesselName: string
  from: Date
  to: Date                        // exclusive
  highlightCruiseId?: string      // drawn in gold
  hideIfEmpty?: boolean           // render nothing when the vessel has no entries in the window
  linkLabel?: string | null       // caption link to the fleet timeline; null hides it
}

export default async function VesselTimelineStrip({ vesselId, vesselName, from, to, highlightCruiseId, hideIfEmpty = false, linkLabel = 'Open the fleet timeline' }: VesselTimelineStripProps) {
  const [rows, viewer] = await Promise.all([getVesselTimeline({ from, to, vesselId }), getViewerPreferences()])
  if (hideIfEmpty && rows.length === 0) return null
  const resources = fleetToResources([{ id: vesselId, name: vesselName, photo_urls: null, country: null, organization: null }])
  const today = todayIso(viewer.timeZone)
  return (
    <div>
      <VesselStripClient
        vesselId={vesselId} at={iso(from)} span={{ start: iso(from), end: iso(to) }}
        timeZone={viewer.timeZone} today={today}
        initialRows={rows} resources={resources} highlightCruiseId={highlightCruiseId}
      />
      {linkLabel && <p className="text-xs text-gray-400 mt-2"><Link href={`/cruises?view=timeline&scale=month&at=${iso(from)}`} className="text-teal hover:underline">{linkLabel}</Link></p>}
    </div>
  )
}
