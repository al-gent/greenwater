import { getAllVessels } from '@/lib/vessels'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function getClaimVessels() {
  const [vessels, { data: memberships }] = await Promise.all([
    getAllVessels(),
    // Match the server's rule (handle_new_user, /api/vessel-claims): any existing
    // membership row, pending included, means a new claim needs admin review.
    supabaseAdmin.from('vessel_operators').select('vessel_id'),
  ])

  const claimedIds = new Set((memberships ?? []).map((m) => m.vessel_id as number))

  return vessels.map((v) => ({
    id: v.id,
    name: v.name,
    country: v.country ?? null,
    port_city: v.port_city ?? null,
    claimed: claimedIds.has(v.id),
  }))
}
