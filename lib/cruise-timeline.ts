/**
 * Adapter: timeline_entries (vessel occupancy) -> timeline resources/entries. The only
 * place the timeline component learns about cruises and vessels.
 */
import type { VesselTimelineEntry } from './cruises'
import { cruiseStage, STAGE_LABEL, fmtDateRange, projectCount, type CruiseStage } from './cruise-utils'
import type { TimelineEntry, TimelineResource } from './timeline/types'

export const CRUISE_PALETTE: Record<CruiseStage | 'default', string> = {
  default: 'bg-navy text-white',
  scheduled: 'bg-navy text-white',
  confirmed: 'bg-navy text-white',
  underway: 'bg-teal text-white',
  tentative: 'bg-gold-100 text-gold-700 border border-dashed border-gold-400',
  completed: 'bg-navy-100 text-navy-600',
  cancelled: 'bg-gray-100 text-gray-400 line-through',
}

type FleetVessel = { id: number; name: string; photo_urls: string[] | null; country: string | null; organization: { id: string; name: string; short_name: string | null } | null }

/** A fixed row per vessel, busy or not: that is what "available" looks like. */
export function fleetToResources(fleet: FleetVessel[]): TimelineResource[] {
  return fleet.map((v) => ({
    id: `vessel:${v.id}`, label: v.name, kind: 'vessel', href: `/vessels/${v.id}`,
    sublabel: v.organization?.name ?? undefined,
  }))
}

/** Rows = `fixed` plus any vessel that has an entry but is not in it; bars from the entries. */
export function vesselEntriesToTimeline(rows: VesselTimelineEntry[], fixed: TimelineResource[] = []): { resources: TimelineResource[]; entries: TimelineEntry[] } {
  const resources = new Map<number, TimelineResource>()
  for (const r of fixed) resources.set(Number(r.id.replace('vessel:', '')), r)
  const entries: TimelineEntry[] = []
  for (const e of rows) {
    if (!e.vessel) continue
    const rid = `vessel:${e.vessel.id}`
    const org = e.cruise?.organization ?? null
    const existing = resources.get(e.vessel.id)
    if (!existing) {
      resources.set(e.vessel.id, {
        id: rid,
        label: e.vessel.name,
        sublabel: org?.name ?? undefined,
        kind: 'vessel',
        href: `/vessels/${e.vessel.id}`,
      })
    } else if (!existing.sublabel && org) {
      existing.sublabel = org.name   // a block came first; a later cruise entry tells us the operator
    }
    if (e.cruise) {
      const c = e.cruise
      const stage = cruiseStage(c as any)
      const extra = projectCount(c) - 1
      entries.push({
        id: e.id, resourceId: rid, start: e.start_at, end: e.end_at, allDay: e.all_day,
        // What the bar says: the cruise's name, then where it is going. The operator's cruise
        // number means nothing to a researcher and is not shown.
        label: c.title + (extra ? ` +${extra}` : '') + (c.operating_area ? ` — ${c.operating_area}` : ''),
        kind: 'item', status: stage, href: `/cruises/${c.slug}`,
        detail: [
          c.title + (extra ? ` (+${extra} project${extra > 1 ? 's' : ''} aboard)` : ''),
          c.operating_area,
          `${fmtDateRange(c.departure_at, c.arrival_at)} · ${STAGE_LABEL[stage]}`,
        ].filter(Boolean).join('\n'),
        meta: {
          title: c.title, area: c.operating_area, dates: fmtDateRange(c.departure_at, c.arrival_at), stage, stageLabel: STAGE_LABEL[stage],
          departure: c.departure_at.slice(0, 10), arrival: c.arrival_at.slice(0, 10), projects: extra + 1,
          vesselId: e.vessel.id, vesselName: e.vessel.name, operator: org?.name ?? null, slug: c.slug, cruiseId: c.id,
        },
      })
    } else {
      entries.push({
        id: e.id, resourceId: rid, start: e.start_at, end: e.end_at, allDay: e.all_day,
        label: e.label ?? 'Unavailable', kind: 'block', detail: [e.label, e.notes].filter(Boolean).join('\n') || undefined,
        meta: { block: true, label: e.label, notes: e.notes, vesselId: e.vessel.id, vesselName: e.vessel.name, dates: fmtDateRange(e.start_at, e.end_at) },
      })
    }
  }
  const sorted = [...resources.values()].sort((a, b) => a.label.localeCompare(b.label))
  return { resources: sorted, entries }
}
