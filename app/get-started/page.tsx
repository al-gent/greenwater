import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import SignUpForm from './SignUpForm'

import { authDestination } from '@/lib/auth-navigation'

export default async function GetStartedPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = authDestination(searchParams.next)
  if (await getServerUser()) redirect(next)

  return (
    <Suspense>
      <SignUpForm next={next} />
    </Suspense>
  )
}
