import type { Metadata } from 'next'
import { getAllVessels } from '@/lib/vessels'
import { supabaseAdmin } from '@/lib/supabase-admin'
import ClaimSignupForm from './ClaimSignupForm'

export const metadata: Metadata = {
  title: 'Claim Your Vessel — Greenwater Foundation',
  description: 'Create an account and claim your research vessel listing in one step.',
}

// Queries live claim state (profiles) at request time — cannot be statically prerendered
export const dynamic = 'force-dynamic'

export default async function ClaimPage() {
  // "claimed" in the picker = someone actively operates it (pending claims
  // don't block a vessel from being claimed)
  const [vessels, { data: memberships }] = await Promise.all([
    getAllVessels(),
    supabaseAdmin.from('vessel_operators').select('vessel_id').eq('status', 'active'),
  ])

  const claimedIds = new Set((memberships ?? []).map((m) => m.vessel_id as number))

  const options = vessels.map((v) => ({
    id: v.id,
    name: v.name,
    country: v.country ?? null,
    port_city: v.port_city ?? null,
    claimed: claimedIds.has(v.id),
  }))

  return <ClaimSignupForm vessels={options} />
}
