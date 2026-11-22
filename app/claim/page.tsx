import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import { getClaimVessels } from '@/lib/claim-vessels'
import ClaimSignupForm from './ClaimSignupForm'

export const metadata: Metadata = {
  title: 'Claim Your Vessel — Greenwater Foundation',
  description: 'Create an account and claim your research vessel listing in one step.',
}

// Queries live claim state (profiles) at request time — cannot be statically prerendered
export const dynamic = 'force-dynamic'

export default async function ClaimPage({ searchParams }: { searchParams: { vessel?: string } }) {
  if (await getServerUser()) {
    const vessel = searchParams.vessel
    redirect(vessel ? `/dashboard/listings/claim?vessel=${encodeURIComponent(vessel)}` : '/dashboard/listings/claim')
  }
  return <ClaimSignupForm vessels={await getClaimVessels()} />
}
