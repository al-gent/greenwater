// Server-only: a user's fleet (their watch list of vessels) for the My fleet timeline.
import { supabaseAdmin } from './supabase-admin'

export interface FleetVesselRow { id: number; name: string; photo_urls: string[] | null; country: string | null; operator_name: string | null; affiliation: string | null; added_at: string }

export async function getMyFleet(userId: string): Promise<FleetVesselRow[]> {
  const { data: rows } = await supabaseAdmin.from('fleet_vessels').select('vessel_id, created_at').eq('user_id', userId).order('created_at')
  const ids = (rows ?? []).map((r) => r.vessel_id as number)
  if (!ids.length) return []
  const { data: vessels } = await supabaseAdmin.from('vessels').select('id, name, photo_urls, country, operator_name, affiliation').in('id', ids)
  const by = new Map((vessels ?? []).map((v: any) => [v.id, v]))
  return (rows ?? []).flatMap((r) => { const v = by.get(r.vessel_id); return v ? [{ ...v, added_at: r.created_at }] : [] })
}

export async function inMyFleet(userId: string, vesselId: number): Promise<boolean> {
  const { data } = await supabaseAdmin.from('fleet_vessels').select('vessel_id').eq('user_id', userId).eq('vessel_id', vesselId).maybeSingle()
  return !!data
}

/** Vessels by id, in the order given: the fixed rows for a shared `?vessels=` timeline link. */
export async function getVesselsByIds(ids: number[]): Promise<FleetVesselRow[]> {
  if (!ids.length) return []
  const { data } = await supabaseAdmin.from('vessels').select('id, name, photo_urls, country, operator_name, affiliation').in('id', ids)
  const by = new Map((data ?? []).map((v: any) => [v.id, v]))
  return ids.flatMap((id) => { const v = by.get(id); return v ? [{ ...v, added_at: '' }] : [] })
}
