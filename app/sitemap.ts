import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

// Auto-generated /sitemap.xml — the homepage only surfaces a fraction of the
// fleet to crawlers; this lists every active vessel page for discovery.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.vesselconnect.org').replace(/\/$/, '')

  const { data: vessels } = await supabase
    .from('vessels')
    .select('id, last_updated')
    .eq('status', 'active')
    .order('id')

  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/map`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/list-your-vessel`, changeFrequency: 'monthly', priority: 0.5 },
    ...(vessels ?? []).map((v) => ({
      url: `${base}/vessels/${v.id}`,
      lastModified: v.last_updated ? new Date(v.last_updated) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
