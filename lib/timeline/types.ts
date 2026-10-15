/**
 * Resource timeline contract. Deliberately knows nothing about cruises, vessels or people:
 * a resource is a row, an entry is a span of time on that row. See RESOURCE_TIMELINE_PLAN.md.
 */

export interface TimelineResource {
  id: string                 // opaque: 'vessel:123', 'person:uuid'
  label: string
  sublabel?: string          // 'SIO', '56 ft'
  group?: string             // row-group header: operator / institution
  kind?: string              // 'vessel' | 'person' | anything; drives the row avatar
  href?: string
  imageUrl?: string
}

export interface TimelineEntry {
  id: string
  resourceId: string
  start: string              // ISO timestamptz
  end: string                // ISO timestamptz, exclusive
  allDay?: boolean           // treat start/end as dates: snap to day boundaries in the display zone
  label: string
  kind: 'item' | 'block'     // block = unavailable: hatched, no link
  status?: string            // caller-defined; looked up in the palette
  href?: string
  detail?: string            // plain-text fallback (title attribute)
  meta?: Record<string, any> // whatever a hover card renderer needs; the timeline ignores it
}

export interface TimelineWindow {
  start: string              // ISO date (YYYY-MM-DD) in the display zone; first visible day
  end: string                // ISO date, exclusive
  pxPerDay: number           // 4 for a year of cruises, 36 for a month of day trips
}

export interface ResourceTimelineProps {
  resources: TimelineResource[]
  entries: TimelineEntry[]
  window: TimelineWindow
  timeZone?: string          // IANA; all day-boundary math happens here. Default 'UTC'.
  today?: string             // ISO date in the display zone; default: now
  palette?: Record<string, string>   // status -> tailwind classes for the bar
  emptyRowText?: string
  density?: 'compact' | 'comfortable' | 'spacious'   // row height; default comfortable
}
