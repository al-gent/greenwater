import { Suspense } from 'react'
import { getAllVessels, stripHtml } from '@/lib/vessels'
import HomeClient from '@/components/HomeClient'

export default async function HomePage() {
  const allVessels = await getAllVessels()

  const vesselCountries = Array.from(
    new Set(allVessels.map((v) => v.country).filter(Boolean) as string[])
  ).sort()

  const vesselActivities = Array.from(
    new Set(
      allVessels
        .map((v) => stripHtml(v.main_activity))
        .filter((a) => a.length > 0 && a.length <= 80)
    )
  ).sort()

  return (
    <Suspense fallback={<div className="pt-[88px] bg-white min-h-screen" />}>
      <HomeClient
        vessels={allVessels}
        countries={vesselCountries}
        activities={vesselActivities}
      />
    </Suspense>
  )
}
