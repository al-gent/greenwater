import { Suspense } from 'react'
import { getAllVessels } from '@/lib/vessels'
import HomeClient from '@/components/HomeClient'

export default async function HomePage() {
  const allVessels = await getAllVessels()

  return (
    <Suspense fallback={<div className="pt-[88px] bg-white min-h-screen" />}>
      <HomeClient vessels={allVessels} />
    </Suspense>
  )
}
