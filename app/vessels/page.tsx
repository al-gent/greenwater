import type { Metadata } from 'next'
import { getAllVessels, getUniqueCountries } from '@/lib/vessels'
import BrowseClient from '@/components/BrowseClient'

export const metadata: Metadata = {
  title: 'Browse research vessels — VesselConnect',
  description:
    'Browse the global fleet of research vessels. Filter by country, capacity, equipment, and ice capability to find the right ship for your expedition.',
}

export default async function VesselsBrowsePage({
  searchParams,
}: {
  searchParams: { country?: string }
}) {
  const [vessels, countries] = await Promise.all([
    getAllVessels(),
    getUniqueCountries(),
  ])

  const initialCountry = searchParams.country && countries.includes(searchParams.country)
    ? searchParams.country
    : ''

  return (
    <BrowseClient
      vessels={vessels}
      initialCountry={initialCountry}
    />
  )
}
