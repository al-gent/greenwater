// Server-only: a user's fleet (their watch list of vessels) for the My fleet timeline.
import { supabaseAdmin } from './supabase-admin'
import { isCurrentLink, primaryOrganization, type OrganizationRole } from './vessel-utils'

export interface FleetVesselRow { id: number; name: string; photo_urls: string[] | null; country: string | null; institution: string | null; added_at: string }

const FLEET_COLS = 'id, name, photo_urls, country, vessel_organizations(role, starts_on, ends_on, organization:organizations(id, name, short_name, display_name))'
type LinkRow = { role: OrganizationRole; starts_on: string | null; ends_on: string | null; organization: { id: string; name: string; short_name: string | null; display_name: string | null } | null }

// Timeline rows show what the site shows on cards: display_name, else the full name.
function toRow(v: any, added_at: string): FleetVesselRow {
  const organizations = ((v.vessel_organizations ?? []) as LinkRow[]).filter(l => l.organization && isCurrentLink(l)).map(l => ({ ...l.organization!, role: l.role }))
  const org = primaryOrganization({ organizations })
  return { id: v.id, name: v.name, photo_urls: v.photo_urls, country: v.country, institution: org ? org.display_name ?? org.name : null, added_at }
}

export async function getMyFleet(userId: string): Promise<FleetVesselRow[]> {
  const { data: rows } = await supabaseAdmin.from('fleet_vessels').select('vessel_id, created_at').eq('user_id', userId).order('created_at')
  const ids = (rows ?? []).map((r) => r.vessel_id as number)
  if (!ids.length) return []
  const { data: vessels } = await supabaseAdmin.from('vessels').select(FLEET_COLS).in('id', ids)
  const by = new Map((vessels ?? []).map((v: any) => [v.id, v]))
  return (rows ?? []).flatMap((r) => { const v = by.get(r.vessel_id); return v ? [toRow(v, r.created_at)] : [] })
}

export async function inMyFleet(userId: string, vesselId: number): Promise<boolean> {
  const { data } = await supabaseAdmin.from('fleet_vessels').select('vessel_id').eq('user_id', userId).eq('vessel_id', vesselId).maybeSingle()
  return !!data
}

/** Vessels by id, in the order given: the fixed rows for a shared `?vessels=` timeline link. */
export async function getVesselsByIds(ids: number[]): Promise<FleetVesselRow[]> {
  if (!ids.length) return []
  const { data } = await supabaseAdmin.from('vessels').select(FLEET_COLS).in('id', ids)
  const by = new Map((data ?? []).map((v: any) => [v.id, v]))
  return ids.flatMap((id) => { const v = by.get(id); return v ? [toRow(v, '')] : [] })
}
