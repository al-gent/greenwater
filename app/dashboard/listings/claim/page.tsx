import DashboardContent from '../../DashboardContent'
import { claimVessel } from '@/lib/dashboard-navigation'
import { redirect } from 'next/navigation'
import { getClaimVessels } from '@/lib/claim-vessels'
import { getServerUser } from '@/lib/supabase-server'
import ClaimListingForm from './ClaimListingForm'

export const metadata = { title: 'Claim your vessel | VesselConnect' }

export default async function ClaimListingPage({ searchParams }: { searchParams: { vessel?: string } }) {
  const href = searchParams.vessel ? `${claimVessel.href}?vessel=${encodeURIComponent(searchParams.vessel)}` : claimVessel.href
  const user = await getServerUser()
  if (!user) redirect(`/auth/signin?next=${encodeURIComponent(href)}`)
  return (
    <DashboardContent section="listings" currentPage={{ ...claimVessel, href }}>
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold text-navy">Claim your vessel</h1>
        <p className="mt-2 mb-6 text-gray-600">Find your vessel’s existing listing and tell us how you’re involved in its operations.</p>
        <ClaimListingForm vessels={await getClaimVessels()} selectedId={Number(searchParams.vessel)} />
      </div>
    </DashboardContent>
  )
}
