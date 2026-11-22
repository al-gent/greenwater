// Carry a local destination through signup, confirmation, and sign-in.
export function authDestination(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return '/dashboard'
  const url = new URL(value, 'https://vesselconnect.invalid')
  if (url.pathname.startsWith('//') || /^\/(auth|get-started|api)(\/|$)/.test(url.pathname)) return '/dashboard'
  if (url.pathname === '/projects/new') url.pathname = '/dashboard/projects/new'
  return url.pathname + url.search + url.hash
}

export function authLink(path: '/get-started' | '/auth/signin' | '/auth/callback', next: string) {
  return `${path}?next=${encodeURIComponent(authDestination(next))}`
}

export function destinationFromPage(path: string, query: URLSearchParams) {
  if (path === '/cruise-planning') return '/dashboard/fleet'
  if (path === '/operators') return '/dashboard/listings'
  if (path === '/researchers') return '/dashboard/projects/new'
  if (path === '/claim') {
    const vessel = query.get('vessel')
    return vessel ? `/dashboard/listings/claim?vessel=${encodeURIComponent(vessel)}` : '/dashboard/listings/claim'
  }
  if (path === '/get-started' || path.startsWith('/auth/')) return authDestination(query.get('next'))
  if (path === '/' || /^\/(vessels|cruises|projects|research|explore|map)(\/|$)/.test(path)) {
    query.delete('code')
    return authDestination(path + (query.size ? `?${query}` : ''))
  }
  return '/dashboard'
}
