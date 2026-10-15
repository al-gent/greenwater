/**
 * Timeline service — the one place that writes timeline_entries.
 *
 * Server-only (service-role client). Semantic facts live on cruises (which vessel) and
 * cruise_people (who sits where); entries are the occupancy index derived from them,
 * and this module keeps the two in step. The database's only job is the guarantee:
 * exclusion constraints reject a second live vesselconnect entry on the same resource
 * and window (Postgres error 23P01), which we turn into a ConflictError listing what
 * collided. Nothing here hard-deletes; rows get deleted_at.
 *
 * See RESOURCE_TIMELINE_PLAN.md and supabase/migrations/20261002_timeline.sql.
 */
import { supabaseAdmin } from './supabase-admin'

const DAY_MS = 86_400_000

export type ResourceRef = { vesselId: number } | { personId: string } | { equipmentId: string }

export interface TimelineEntryRow {
  id: string
  vessel_id: number | null
  person_id: string | null
  equipment_id: string | null
  start_at: string
  end_at: string
  all_day: boolean
  tz: string
  cruise_id: string | null
  seat_id: string | null
  label: string | null
  notes: string | null
  source: 'vesselconnect' | 'unols_mfp'
  visibility: 'public' | 'operators' | 'private'
  created_by: string | null
  deleted_at: string | null
}

interface CruiseWindowFields {
  id: string
  vessel_id: number | null
  mobilization_at: string | null
  departure_at: string
  arrival_at: string
  demobilization_at: string | null
  published_at: string | null
  cancelled_at: string | null
  source: 'vesselconnect' | 'unols_mfp'
  created_by: string | null
}

interface SeatFields {
  id: string
  cruise_id: string
  person_id: string | null
  start_at: string | null
  end_at: string | null
  source: 'vesselconnect' | 'unols_mfp'
  deleted_at: string | null
}

export class ConflictError extends Error {
  constructor(public conflicts: TimelineEntryRow[]) {
    super(`Resource already booked: ${conflicts.length} overlapping entr${conflicts.length === 1 ? 'y' : 'ies'}`)
  }
}

const MAX_MOB_MS = 14 * DAY_MS

/**
 * When a cruise occupies its resources: mobilization (else departure) to demobilization
 * (else arrival). Mob/demob dates more than 14 days from the cruise are ignored — MFP has
 * records with a mobilization three years before departure (mfp-api/QUIRKS.md #17).
 * MFP dates are calendar days with arrival inclusive, so all-day windows end the next day.
 * A collapsed window is floored to one day. Mirrors the backfill SQL.
 */
export function cruiseOccupancy(c: CruiseWindowFields): { start: string; end: string; allDay: boolean } {
  const allDay = c.source === 'unols_mfp'
  const dep = new Date(c.departure_at), arr = new Date(c.arrival_at)
  const mob = c.mobilization_at ? new Date(c.mobilization_at) : null
  const demob = c.demobilization_at ? new Date(c.demobilization_at) : null
  const mobGap = mob ? dep.getTime() - mob.getTime() : -1
  const demobGap = demob ? demob.getTime() - arr.getTime() : -1
  const start = mob && mobGap >= 0 && mobGap <= MAX_MOB_MS ? mob : dep        // mob after departure = garbage
  let end = demob && demobGap >= 0 && demobGap <= MAX_MOB_MS ? demob : arr   // demob before arrival = garbage
  if (allDay) end = new Date(end.getTime() + DAY_MS)
  if (end.getTime() < start.getTime() + DAY_MS) end = new Date(start.getTime() + DAY_MS)
  return { start: start.toISOString(), end: end.toISOString(), allDay }
}

const clamp = (a: string, b: string, lo: string, hi: string) => ({
  start: new Date(Math.max(new Date(a).getTime(), new Date(lo).getTime())).toISOString(),
  end: new Date(Math.min(new Date(b).getTime(), new Date(hi).getTime())).toISOString(),
})

/** Live entries overlapping [start, end) on any of the given resources. */
export async function findConflicts(opts: {
  vesselIds?: number[]
  personIds?: string[]
  equipmentIds?: string[]
  start: string
  end: string
  ignoreCruiseId?: string | null
}): Promise<TimelineEntryRow[]> {
  const ors: string[] = []
  if (opts.vesselIds?.length) ors.push(`vessel_id.in.(${opts.vesselIds.join(',')})`)
  if (opts.personIds?.length) ors.push(`person_id.in.(${opts.personIds.join(',')})`)
  if (opts.equipmentIds?.length) ors.push(`equipment_id.in.(${opts.equipmentIds.join(',')})`)
  if (!ors.length) return []
  let q = supabaseAdmin
    .from('timeline_entries')
    .select('*')
    .is('deleted_at', null)
    .lt('start_at', opts.end)
    .gt('end_at', opts.start)
    .or(ors.join(','))
    .order('start_at')
  if (opts.ignoreCruiseId) q = q.or(`cruise_id.is.null,cruise_id.neq.${opts.ignoreCruiseId}`)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as TimelineEntryRow[]
}

// Turn the exclusion-constraint rejection into a ConflictError with the colliding rows.
async function guard<T>(write: () => PromiseLike<{ data: T; error: any }>, lookup: () => Promise<TimelineEntryRow[]>): Promise<T> {
  const { data, error } = await write()
  if (!error) return data
  if (error.code === '23P01') throw new ConflictError(await lookup())
  throw error
}

/**
 * Bring a cruise's vessel entry (and its seats' entries) in line with the cruise row.
 * Call after any create/update of vessel, dates, published or cancelled state.
 * Cancelled or vessel-less cruises get their entries soft-deleted.
 */
export async function syncCruiseEntries(cruiseId: string): Promise<void> {
  const { data: c, error } = await supabaseAdmin.from('cruises').select('id, vessel_id, mobilization_at, departure_at, arrival_at, demobilization_at, published_at, cancelled_at, source, created_by').eq('id', cruiseId).single()
  if (error) throw error
  const cruise = c as CruiseWindowFields
  const now = new Date().toISOString()

  if (cruise.cancelled_at || !cruise.vessel_id) {
    await supabaseAdmin.from('timeline_entries').update({ deleted_at: now }).eq('cruise_id', cruiseId).is('deleted_at', null)
    return
  }

  const w = cruiseOccupancy(cruise)
  const visibility = cruise.published_at ? 'public' : 'operators'
  const { data: existing } = await supabaseAdmin.from('timeline_entries').select('id').eq('cruise_id', cruiseId).not('vessel_id', 'is', null).is('deleted_at', null).maybeSingle()
  const vesselRow = { vessel_id: cruise.vessel_id, start_at: w.start, end_at: w.end, all_day: w.allDay, tz: 'UTC', cruise_id: cruiseId, source: cruise.source, visibility, created_by: cruise.created_by }
  const conflictsFor = () => findConflicts({ vesselIds: [cruise.vessel_id!], start: w.start, end: w.end, ignoreCruiseId: cruiseId })
  if (existing) await guard(() => supabaseAdmin.from('timeline_entries').update(vesselRow).eq('id', existing.id), conflictsFor)
  else await guard(() => supabaseAdmin.from('timeline_entries').insert(vesselRow), conflictsFor)

  // Crew seats: whole-cruise seats follow the cruise; explicit windows are clamped to it.
  const { data: seats } = await supabaseAdmin.from('cruise_people').select('id, cruise_id, person_id, start_at, end_at, source, deleted_at').eq('cruise_id', cruiseId).is('deleted_at', null).not('person_id', 'is', null)
  for (const seat of (seats ?? []) as SeatFields[]) await syncSeatEntry(seat, w)
  // Science party: everyone on a project attached to this cruise, for the whole window.
  await syncProjectPeopleEntries(cruiseId, w, cruise.source)
}

/**
 * One entry per linked person on each project scheduled on this cruise; entries for people
 * no longer on those projects are soft-deleted. Called from syncCruiseEntries and after a
 * scheduled project's people change.
 */
export async function syncProjectPeopleEntries(cruiseId: string, w?: { start: string; end: string; allDay: boolean }, source: 'vesselconnect' | 'unols_mfp' = 'vesselconnect'): Promise<void> {
  const now = new Date().toISOString()
  if (!w) {
    const { data: c } = await supabaseAdmin.from('cruises').select('id, vessel_id, mobilization_at, departure_at, arrival_at, demobilization_at, published_at, cancelled_at, source, created_by').eq('id', cruiseId).single()
    if (!c || (c as CruiseWindowFields).cancelled_at) { await supabaseAdmin.from('timeline_entries').update({ deleted_at: now }).eq('cruise_id', cruiseId).not('project_person_id', 'is', null).is('deleted_at', null); return }
    w = cruiseOccupancy(c as CruiseWindowFields); source = (c as CruiseWindowFields).source
  }
  const { data: projects } = await supabaseAdmin.from('projects').select('id').eq('cruise_id', cruiseId).is('deleted_at', null)
  const projectIds = (projects ?? []).map((p) => p.id)
  const { data: people } = projectIds.length ? await supabaseAdmin.from('project_people').select('id, person_id').in('project_id', projectIds).not('person_id', 'is', null) : { data: [] as any[] }
  const wanted = new Map((people ?? []).map((r: any) => [r.id as string, r.person_id as string]))
  const { data: existing } = await supabaseAdmin.from('timeline_entries').select('id, project_person_id, person_id, start_at, end_at').eq('cruise_id', cruiseId).not('project_person_id', 'is', null).is('deleted_at', null)
  const have = new Map((existing ?? []).map((e: any) => [e.project_person_id as string, e]))
  for (const [ppId, e] of have) if (!wanted.has(ppId)) await supabaseAdmin.from('timeline_entries').update({ deleted_at: now }).eq('id', e.id)
  for (const [ppId, personId] of wanted) {
    const row = { person_id: personId, start_at: w.start, end_at: w.end, all_day: w.allDay, tz: 'UTC', cruise_id: cruiseId, project_person_id: ppId, source, visibility: 'operators' }
    const conflictsFor = () => findConflicts({ personIds: [personId], start: w!.start, end: w!.end, ignoreCruiseId: cruiseId })
    const e = have.get(ppId)
    if (e) { if (e.person_id !== personId || e.start_at !== w.start || e.end_at !== w.end) await guard(() => supabaseAdmin.from('timeline_entries').update(row).eq('id', e.id), conflictsFor) }
    else await guard(() => supabaseAdmin.from('timeline_entries').insert(row), conflictsFor)
  }
}

/**
 * Bring one seat's person entry in line with the seat: present iff the seat has a person
 * and its cruise is live; window = seat window ∩ cruise window.
 */
export async function syncSeatEntry(seatOrId: SeatFields | string, cruiseWindow?: { start: string; end: string; allDay: boolean }): Promise<void> {
  const seat: SeatFields = typeof seatOrId === 'string'
    ? ((await supabaseAdmin.from('cruise_people').select('id, cruise_id, person_id, start_at, end_at, source, deleted_at').eq('id', seatOrId).single()).data as SeatFields)
    : seatOrId
  const now = new Date().toISOString()
  const dropEntry = () => supabaseAdmin.from('timeline_entries').update({ deleted_at: now }).eq('seat_id', seat.id).is('deleted_at', null)

  if (!seat.person_id || seat.deleted_at) { await dropEntry(); return }

  let w = cruiseWindow
  if (!w) {
    const { data: c } = await supabaseAdmin.from('cruises').select('id, vessel_id, mobilization_at, departure_at, arrival_at, demobilization_at, published_at, cancelled_at, source, created_by').eq('id', seat.cruise_id).single()
    if (!c || (c as CruiseWindowFields).cancelled_at) { await dropEntry(); return }
    w = cruiseOccupancy(c as CruiseWindowFields)
  }
  const { start, end } = clamp(seat.start_at ?? w.start, seat.end_at ?? w.end, w.start, w.end)
  const row = { person_id: seat.person_id, start_at: start, end_at: end, all_day: w.allDay && !seat.start_at, tz: 'UTC', cruise_id: seat.cruise_id, seat_id: seat.id, source: seat.source, visibility: 'operators' }
  const conflictsFor = () => findConflicts({ personIds: [seat.person_id!], start, end, ignoreCruiseId: seat.cruise_id })
  const { data: existing } = await supabaseAdmin.from('timeline_entries').select('id').eq('seat_id', seat.id).is('deleted_at', null).maybeSingle()
  if (existing) await guard(() => supabaseAdmin.from('timeline_entries').update(row).eq('id', existing.id), conflictsFor)
  else await guard(() => supabaseAdmin.from('timeline_entries').insert(row), conflictsFor)
}

/** Fill (or clear) a seat, then sync its entry. Throws ConflictError if the person is busy. */
export async function setSeatPerson(seatId: string, personId: string | null): Promise<void> {
  const { error } = await supabaseAdmin.from('cruise_people').update({ person_id: personId }).eq('id', seatId)
  if (error) throw error
  await syncSeatEntry(seatId)
}

/** Mark a resource unavailable: a labelled entry with no cruise. */
export async function blockResource(opts: {
  resource: ResourceRef
  start: string
  end: string
  tz: string
  allDay?: boolean
  label: string
  notes?: string
  visibility?: 'public' | 'operators' | 'private'
  createdBy?: string
}): Promise<TimelineEntryRow> {
  const r = opts.resource
  const row = {
    vessel_id: 'vesselId' in r ? r.vesselId : null,
    person_id: 'personId' in r ? r.personId : null,
    equipment_id: 'equipmentId' in r ? r.equipmentId : null,
    start_at: opts.start, end_at: opts.end, all_day: opts.allDay ?? false, tz: opts.tz,
    label: opts.label, notes: opts.notes ?? null, source: 'vesselconnect' as const,
    visibility: opts.visibility ?? ('vesselId' in r ? 'public' : 'operators'),
    created_by: opts.createdBy ?? null,
  }
  const lookup = () => findConflicts({
    vesselIds: row.vessel_id ? [row.vessel_id] : [], personIds: row.person_id ? [row.person_id] : [], equipmentIds: row.equipment_id ? [row.equipment_id] : [],
    start: opts.start, end: opts.end,
  })
  return guard(async () => {
    const res = await supabaseAdmin.from('timeline_entries').insert(row).select('*').single()
    return { data: res.data as TimelineEntryRow, error: res.error }
  }, lookup)
}

/** Soft-delete an entry (a block, or an orphaned assignment). */
export async function removeEntry(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('timeline_entries').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
