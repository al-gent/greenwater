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
        .map((v) => stripHtml(v.Main_Activity))
        .filter((a) => a.length > 0 && a.length <= 80)
    )
  ).sort()

  return (
    <HomeClient
      vessels={allVessels}
      countries={vesselCountries}
      activities={vesselActivities}
    />
  )
}
