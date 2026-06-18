import { redirect } from 'next/navigation'

// Browse now lives on the homepage. Preserve old links (?country= → ?flag=).
export default function VesselsBrowseRedirect({
  searchParams,
}: {
  searchParams: { country?: string }
}) {
  const country = searchParams.country
  redirect(country ? `/?flag=${encodeURIComponent(country)}` : '/')
}
