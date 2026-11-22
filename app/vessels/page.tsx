import { Suspense } from 'react'
import { getAllVessels } from '@/lib/vessels'
import HomeClient from '@/components/HomeClient'

// The supabase clients fetch with no-store (fresh DB reads), which cannot be
// statically prerendered. Vessel data is still served from the 1-hour
// unstable_cache in getAllVessels, so per-request rendering stays cheap.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Browse vessels | Vessel Connect',
  description: 'Find vessels for marine research by location, equipment, and room for your team.',
  alternates: { canonical: '/vessels' },
}

export default async function VesselDirectoryPage() {
  const allVessels = await getAllVessels()

  return (
    <Suspense fallback={<div className="pt-16 bg-white min-h-screen" />}>
      <HomeClient vessels={allVessels} />
    </Suspense>
  )
}
