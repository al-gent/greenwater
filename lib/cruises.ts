/**
 * Server-only cruise loading via Supabase. Do NOT import from client components;
 * types and helpers are in @/lib/cruise-utils.
 *
 * Uses the anon client, so RLS applies: only published cruises come back.
 * Operator/admin views of unpublished cruises will need supabaseAdmin + a check.
 */
import { cache } from 'react'
import { supabase } from './supabase'
import type { Cruise, CruiseDetail, CruiseEquipmentLine, CruiseLeg, CruiseOrganization, CruiseProject, CruiseProjectDetail, CruiseSeat, CruiseVessel } from './cruise-utils'

export * from './cruise-utils'

const VESSEL_COLS = 'id, name, photo_urls, country, operator_name, scientists, status'
const ORG_COLS = 'id, name, short_name, website'

// PostgREST returns a to-one join as an object, or as a one-element array through some relations.
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

async function hydrate(cruise: Cruise): Promise<CruiseDetail> {
  const id = cruise.id

  const [{ data: legs }, { data: vessel }, { data: organization }, { data: projects }, { data: equipment }, { data: seats }] = await Promise.all([
    supabase.from('cruise_legs').select('*').eq('cruise_id', id).order('seq'),
    supabase.from('vessels').select(VESSEL_COLS).eq('id', cruise.vessel_id).maybeSingle(),
    supabase.from('organizations').select(ORG_COLS).eq('id', cruise.organization_id).maybeSingle(),
    supabase.from('projects').select('*').eq('cruise_id', id).order('created_at'),
    supabase.from('cruise_equipment').select('id, label, provided_by, quantity, notes, type:equipment_types(name, category)').eq('cruise_id', id).order('label'),
    supabase.from('cruise_people').select('id, name, start_at, end_at, notes, role:cruise_roles(slug, label), person:people(id, name, affiliation, organization_id)').eq('cruise_id', id).is('deleted_at', null),
  ])

  // People and gear live on the projects; a confirmed bid's answers annotate the gear.
  const projectIds = ((projects ?? []) as CruiseProject[]).map((p) => p.id)
  const [{ data: people }, { data: gear }, { data: answers }] = projectIds.length
    ? await Promise.all([
        supabase.from('project_people').select('id, project_id, name, role:cruise_roles(slug, label)').in('project_id', projectIds).order('created_at'),
        supabase.from('project_gear').select('id, project_id, label, quantity, notes').in('project_id', projectIds).order('created_at'),
        supabase.from('bid_gear').select('project_gear_id, answer, bid:project_bids!inner(confirmed_at, cruise_id)').in('project_id', projectIds).eq('bid.cruise_id', id),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]
  const answerFor = new Map(((answers ?? []) as any[]).map((a) => [a.project_gear_id, a.answer]))
  const detailed: CruiseProjectDetail[] = ((projects ?? []) as CruiseProject[]).map((p) => ({
    ...p,
    people: ((people ?? []) as any[]).filter((r) => r.project_id === p.id).map((r) => ({ id: r.id, name: r.name, role: one(r.role) })),
    gear: ((gear ?? []) as any[]).filter((g) => g.project_id === p.id).map((g) => ({ id: g.id, label: g.label, quantity: g.quantity, notes: g.notes, answer: answerFor.get(g.id) ?? null })),
  }))

  return {
    ...cruise,
    legs: (legs ?? []) as CruiseLeg[],
    vessel: (vessel as CruiseVessel | null) ?? null,
    organization: (organization as CruiseOrganization | null) ?? null,
    projects: detailed,
    equipment: ((equipment ?? []) as any[]).map((e) => ({ ...e, type: one(e.type) })) as CruiseEquipmentLine[],
    seats: ((seats ?? []) as any[]).map((s) => ({ ...s, role: one(s.role), person: one(s.person) })) as CruiseSeat[],
  }
}

// React cache() dedupes between generateMetadata and the page within one request.
// Routes use the slug; the uuid lookup exists so old /cruises/<uuid> links can redirect.
export const getCruiseBySlug = cache(async (slug: string): Promise<CruiseDetail | null> => {
  const { data } = await supabase.from('cruises').select('*').eq('slug', slug).maybeSingle()
  return data ? hydrate(data as Cruise) : null
})

export const getCruiseById = cache(async (id: string): Promise<CruiseDetail | null> => {
  if (!isUuid(id)) return null
  const { data } = await supabase.from('cruises').select('*').eq('id', id).maybeSingle()
  return data ? hydrate(data as Cruise) : null
})

// Listing rows: no geojson/raw (20 MB across the table), just what the list shows.
const LIST_COLS = 'id, slug, title, cruise_code, vessel_id, organization_id, departure_at, arrival_at, operating_area, science_party_size, berths_total, berths_open, confirmed_at, cancelled_at, published_at, actual_departure_at, actual_arrival_at, external_refs, source, created_at, updated_at'

export interface CruiseListItem extends Omit<Cruise, 'operating_area_geojson' | 'mobilization_at' | 'demobilization_at'> {
  vessel: { id: number; name: string; photo_urls: string[] | null; country: string | null } | null
  organization: { id: string; name: string; short_name: string | null } | null
}

/** Published cruises departing on/after `from` (default now), soonest first. */
export const getUpcomingCruises = cache(async (opts: { from?: Date; vesselId?: number; limit?: number } = {}): Promise<CruiseListItem[]> => {
  const from = (opts.from ?? new Date()).toISOString()
  let q = supabase.from('cruises').select(LIST_COLS).is('cancelled_at', null).gte('arrival_at', from).order('departure_at').limit(opts.limit ?? 500)
  if (opts.vesselId) q = q.eq('vessel_id', opts.vesselId)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []) as any[]
  const vesselIds = [...new Set(rows.map((r) => r.vessel_id))]
  const orgIds = [...new Set(rows.map((r) => r.organization_id))]
  const [{ data: vessels }, { data: orgs }] = await Promise.all([
    vesselIds.length ? supabase.from('vessels').select('id, name, photo_urls, country').in('id', vesselIds) : Promise.resolve({ data: [] as any[] }),
    orgIds.length ? supabase.from('organizations').select('id, name, short_name').in('id', orgIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const vById = new Map((vessels ?? []).map((v: any) => [v.id, v]))
  const oById = new Map((orgs ?? []).map((o: any) => [o.id, o]))
  return rows.map((r) => ({ ...r, vessel: vById.get(r.vessel_id) ?? null, organization: oById.get(r.organization_id) ?? null }))
})

// ── timeline ──────────────────────────────────────────────────────────────────
// Public vessel occupancy overlapping [from, to): cruise assignments (joined to their
// published cruise) and blocks (label only). RLS hides drafts and people from anon.
const ENTRY_COLS = `id, vessel_id, start_at, end_at, all_day, tz, label, notes,
  cruise:cruises(id, slug, title, cruise_code, operating_area, departure_at, arrival_at, confirmed_at, cancelled_at, published_at, actual_departure_at, actual_arrival_at, external_refs, source,
    organization:organizations(id, name, short_name)),
  vessel:vessels(id, name, photo_urls, country)`

export interface VesselTimelineEntry {
  id: string
  vessel_id: number
  start_at: string
  end_at: string
  all_day: boolean
  tz: string
  label: string | null
  notes: string | null
  cruise: (Pick<Cruise, 'id' | 'slug' | 'title' | 'cruise_code' | 'operating_area' | 'departure_at' | 'arrival_at' | 'confirmed_at' | 'cancelled_at' | 'published_at' | 'actual_departure_at' | 'actual_arrival_at' | 'external_refs' | 'source'> & { organization: { id: string; name: string; short_name: string | null } | null }) | null
  vessel: { id: number; name: string; photo_urls: string[] | null; country: string | null } | null
}

export const getVesselTimeline = cache(async (opts: { from: Date; to: Date; vesselId?: number }): Promise<VesselTimelineEntry[]> => {
  let q = supabase.from('timeline_entries').select(ENTRY_COLS)
    .not('vessel_id', 'is', null).is('deleted_at', null)
    .lt('start_at', opts.to.toISOString()).gt('end_at', opts.from.toISOString())
    .order('start_at').limit(2000)
  if (opts.vesselId) q = q.eq('vessel_id', opts.vesselId)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as any[])
    .map((e) => ({ ...e, cruise: one(e.cruise), vessel: one(e.vessel) }))
    .map((e) => ({ ...e, cruise: e.cruise ? { ...e.cruise, organization: one(e.cruise.organization) } : null })) as VesselTimelineEntry[]
})

/** Vessels operated by the MFP-synced organizations: the fixed row set for the fleet timeline
 *  (a vessel with nothing in the window still gets a row — that is what "available" looks like). */
export const getArfFleet = cache(async (): Promise<{ id: number; name: string; photo_urls: string[] | null; country: string | null; organization: { id: string; name: string; short_name: string | null } | null }[]> => {
  const { data: orgs } = await supabase.from('organizations').select('id, name, short_name').not('mfp_organisation_id', 'is', null)
  const ids = (orgs ?? []).map((o: any) => o.id)
  if (!ids.length) return []
  const { data } = await supabase.from('vessels').select('id, name, photo_urls, country, organization_id').in('organization_id', ids).eq('status', 'active').order('name')
  const byId = new Map((orgs ?? []).map((o: any) => [o.id, o]))
  return ((data ?? []) as any[]).map((v) => ({ id: v.id, name: v.name, photo_urls: v.photo_urls, country: v.country, organization: byId.get(v.organization_id) ?? null }))
})
