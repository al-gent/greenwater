import { getAllVessels } from '@/lib/vessels'

// getAllVessels() is already backed by unstable_cache; its inner no-store fetch
// can't be prerendered at build time, so serve this dynamically and let the CDN
// hold the small id/name payload instead.
export const dynamic = 'force-dynamic'

export async function GET() {
  const vessels = await getAllVessels()
  return Response.json(vessels.map(({ id, name }) => ({ id, name })), {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
