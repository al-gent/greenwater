import { getAllVessels } from '@/lib/vessels'
import { getPhotoUrl } from '@/lib/vessel-utils'
import MapPageClient from '@/components/MapPageClient'

// no-store DB reads can't be statically prerendered (see app/page.tsx)
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Vessel Map — Greenwater Foundation',
  description: 'Browse research vessels on a map.',
}

export default async function MapPage() {
  const vessels = await getAllVessels()
  const withPhoto = vessels.map((v) => ({ ...v, photoUrl: getPhotoUrl(v) }))

  return (
    <div className="pt-[112px]">
      <div className="w-full" style={{ height: 'calc(100vh - 112px)' }}>
        <MapPageClient vessels={withPhoto} />
      </div>
    </div>
  )
}
