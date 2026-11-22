import Link from 'next/link'
import HomePortOverview from '@/components/HomePortOverview'
import { redirect } from 'next/navigation'
import ProjectCard from '@/components/ProjectCard'
import VesselFeaturedCard from '@/components/VesselFeaturedCard'
import { getAllVessels } from '@/lib/vessels'
import { getPhotoUrl, isFeaturedVessel } from '@/lib/vessel-utils'
import { getUpcomingCruises } from '@/lib/cruises'
import { listOpenProjects } from '@/lib/projects'
import { projectCardsForCruises, type ProjectCardData } from '@/lib/project-cards'

export const dynamic = 'force-dynamic'

const title = 'VesselConnect | Vessels for marine research'
const description = 'Find vessels for marine fieldwork, connect with operators, and explore research projects at sea. A project of Greenwater Foundation.'
export const metadata = {
  title, description, alternates: { canonical: '/' },
  openGraph: { title, description, url: '/', images: ['/rv-cosmo.jpg'] },
  twitter: { card: 'summary_large_image', title, description, images: ['/rv-cosmo.jpg'] },
}

// Before the directory moved to /vessels, its filters lived on the root URL.
const directoryParams = new Set('view sort map mlat mlon mz name activity affiliation flag country hull minBerths endurance minLength maxLength maxDraft minSpeed builtAfter ice voo features lat lon loc bbox smode radius'.split(' '))

async function previewProjects(): Promise<ProjectCardData[]> {
  const scheduled = await projectCardsForCruises(await getUpcomingCruises({ limit: 6 }))
  if (scheduled.length >= 2) return scheduled.slice(0, 2)
  const proposed = await listOpenProjects()
  return [...scheduled, ...proposed.map(project => ({ project, cruise: null, siblings: 0 }))].slice(0, 2)
}

const sectionTitle = 'text-2xl sm:text-3xl font-bold tracking-tight text-navy'
const textLink = 'text-sm font-semibold text-teal hover:underline underline-offset-4'

export default async function HomePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  if (!searchParams.code && Object.keys(searchParams).some(key => directoryParams.has(key))) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (Array.isArray(value)) value.forEach(item => query.append(key, item))
      else if (value !== undefined) query.set(key, value)
    }
    redirect(`/vessels?${query}`)
  }

  const [fleet, research] = await Promise.allSettled([getAllVessels(), previewProjects()])
  const vessels = fleet.status === 'fulfilled' ? fleet.value : []
  const projects = research.status === 'fulfilled' ? research.value : []
  const featured = vessels
    .filter(v => isFeaturedVessel(v) && v.length != null && v.length > 0 && v.length <= 20
      && v.last_port_city && v.last_port_lat != null && Math.abs(v.last_port_lat) <= 90
      && v.last_port_lon != null && Math.abs(v.last_port_lon) <= 180 && v.last_port_date)
    .sort((a, b) => Date.parse(b.last_port_date!) - Date.parse(a.last_port_date!) || a.id - b.id)
    .slice(0, 3)
  const ports = new Map<string, [number, number]>()
  for (const vessel of vessels) {
    const lat = parseFloat(vessel.primary_latitude ?? '')
    const lon = parseFloat(vessel.primary_longitude ?? '')
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) ports.set(`${lat},${lon}`, [lat, lon])
  }

  return (
    <div className="pt-16">
      <header className="bg-teal-50 border-b border-teal-100">
        <div className="page-gutter grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
          <div>
            <p className="mb-4 text-5xl font-bold leading-none tracking-tight text-navy sm:text-6xl lg:text-7xl">Vessel<span className="text-teal">Connect</span></p>
            <h1 className="max-w-xl text-4xl font-bold tracking-tight leading-tight text-navy sm:text-5xl">Connecting marine researchers and vessel operators</h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-gray-600 sm:text-lg">Our mission is to make fieldwork at sea more accessible. Through VesselConnect, Greenwater Foundation helps researchers find boats of all sizes and gives operators a way to take part in marine science.</p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link href="/vessels" className="btn-primary">Find a vessel</Link>
              <Link href="/operators" className="btn-secondary">List your vessel</Link>
            </div>
          </div>
          <Link href="/map" aria-label="Explore vessel home ports on the full map" className="block rounded-lg focus-visible:ring-2 focus-visible:ring-teal">
            <HomePortOverview ports={[...ports.values()]} />
          </Link>
        </div>
      </header>
      <div className="page-gutter">
        <section aria-labelledby="home-vessels" className="py-9 sm:py-12">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 id="home-vessels" className={sectionTitle}>Find the right vessel for your research</h2>
            <Link className={textLink} href="/vessels">Browse all vessels <span aria-hidden="true">→</span></Link>
          </div>
          <p className="mb-5 max-w-2xl text-gray-600">Search by location, equipment, availability, or berths.<br />Easily communicate with vessel operators.</p>
          {featured.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {featured.map(vessel => <VesselFeaturedCard key={vessel.id} vessel={vessel} photoUrl={getPhotoUrl(vessel)} />)}
            </div>
          ) : <p className="text-sm text-gray-500">Vessel previews are currently unavailable.</p>}
        </section>
        <section aria-labelledby="home-projects" className="border-t border-gray-200 py-9 sm:py-12">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 id="home-projects" className={sectionTitle}>Research projects</h2>
            <Link className={textLink} href="/research">Browse all research <span aria-hidden="true">→</span></Link>
          </div>
          <p className="mb-4 max-w-2xl text-gray-600">Share your research goals.<br />Work with operators to solve logistical challenges.</p>
          {projects.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {projects.map(card => (
                <li key={card.project.id} className="flex min-w-0"><ProjectCard {...card} /></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">{research.status === 'rejected' ? 'Project previews are currently unavailable.' : 'There are no upcoming or proposed projects to show here yet.'}</p>
          )}
        </section>
      </div>
    </div>
  )
}
