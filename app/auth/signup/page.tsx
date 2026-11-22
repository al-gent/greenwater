import { permanentRedirect } from 'next/navigation'

export default function LegacySignupPage({ searchParams }: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach(item => query.append(name, item))
    else if (value !== undefined) query.set(name, value)
  }
  permanentRedirect(query.size ? `/get-started?${query}` : '/get-started')
}
