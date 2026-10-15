import { redirect } from 'next/navigation'

// The list moved to /research; single cruises stay at /cruises/[slug].
export default function CruisesIndexRedirect({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const qs = new URLSearchParams(Object.entries(searchParams).filter((e): e is [string, string] => typeof e[1] === 'string')).toString()
  redirect(qs ? `/research?${qs}` : '/research')
}
