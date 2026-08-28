import { supabaseAdmin } from '@/lib/supabase-admin'

// Operator relationships live in vessel_operators (many-to-many), not on
// profiles — see VESSEL_OPERATORS_PLAN.md. profiles.role is permission tier
// only. Server-side helpers; all reads go through the service role.

/** Vessel ids the user operates (ACTIVE memberships only — pending claims and
 *  suspended operators get nothing; no admin override). */
export async function getOperatedVesselIds(userId: string): Promise<number[]> {
  const { data } = await supabaseAdmin
    .from('vessel_operators')
    .select('vessel_id')
    .eq('user_id', userId)
    .eq('status', 'active')
  return (data ?? []).map((r) => r.vessel_id as number)
}

/** Authorization check: ACTIVE membership row exists, or the user is an admin.
 *  Use for API writes; use getOperatedVesselIds for UI listings. */
export async function canOperateVessel(userId: string, vesselId: number): Promise<boolean> {
  const { data: membership } = await supabaseAdmin
    .from('vessel_operators')
    .select('vessel_id')
    .eq('user_id', userId)
    .eq('vessel_id', vesselId)
    .eq('status', 'active')
    .maybeSingle()
  if (membership) return true
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single()
  return profile?.is_admin === true
}

export interface VesselOperator {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  notification_prefs: unknown
}

/** All ACTIVE operators of a vessel with contact fields — for notification fan-out. */
export async function getVesselOperators(vesselId: number): Promise<VesselOperator[]> {
  const { data: memberships } = await supabaseAdmin
    .from('vessel_operators')
    .select('user_id')
    .eq('vessel_id', vesselId)
    .eq('status', 'active')
  const ids = (memberships ?? []).map((m) => m.user_id as string)
  if (ids.length === 0) return []
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, email, first_name, last_name, notification_prefs')
    .in('id', ids)
  return (profiles ?? []) as VesselOperator[]
}
