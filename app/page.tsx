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

const howItWorks = [
  {
    audience: 'For researchers', title: 'Find a vessel for your fieldwork', href: '/researchers',
    // Heroicons v1 outline "beaker"
    icon: ['M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z'],
    description: 'Search near your study site, compare deck space, equipment, and berths, then message operators directly about dates and costs.',
  },
  {
    audience: 'For vessel operators', title: 'Put your vessel to work', href: '/operators',
    // Lucide "anchor" (ISC); ring drawn as a path so it renders like the other icons
    icon: ['M15 5a3 3 0 11-6 0 3 3 0 016 0z', 'M12 22V8', 'M5 12H2a10 10 0 0020 0h-3'],
    description: 'List where you operate and when you’re available so research teams can contact you about paid work in your area.',
  },
  {
    audience: 'For research fleets', title: 'Plan ship time across your fleet', href: '/cruise-planning',
    // Heroicons v1 outline "calendar"
    icon: ['M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'],
    description: 'Bring several organizations’ vessels into one calendar to see who’s sailing where, and where another project could join.',
  },
]

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
        <div className="page-gutter grid items-center gap-6 py-8 sm:py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
          <div className="text-center lg:text-left">
            <p className="mb-4 text-5xl font-bold leading-none tracking-tight text-navy sm:text-6xl lg:text-7xl">Vessel<span className="text-teal">Connect</span></p>
            <h1 className="lg:max-w-xl text-4xl font-bold tracking-tight leading-tight text-navy sm:text-5xl">Connecting marine researchers and vessel operators</h1>
            <p className="mt-4 lg:max-w-lg text-base leading-relaxed text-gray-600 sm:text-lg">Our mission is to make fieldwork at sea more accessible. Through VesselConnect, Greenwater Foundation helps researchers find boats of all sizes and gives operators a way to take part in marine science.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
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
        <section aria-labelledby="home-how" className="border-t border-gray-200 py-9 sm:py-12">
          <h2 id="home-how" className={sectionTitle}>How it works</h2>
          <p className="mt-2 mb-5 max-w-2xl text-gray-600">VesselConnect brings researchers, vessel operators, and research fleets together. Choose where you fit.</p>
          <ul className="grid gap-4 md:grid-cols-3">
            {howItWorks.map(({ audience, title, description, href, icon }) => (
              <li key={href} className="flex">
                <Link href={href} className="flex w-full flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-teal-100 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-teal sm:p-6">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal">
                    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {icon.map(d => <path key={d} d={d} strokeLinecap="round" strokeLinejoin="round" />)}
                    </svg>
                  </span>
                  <p className="text-xs font-semibold uppercase tracking-widest text-teal">{audience}</p>
                  <h3 className="mt-2 text-xl font-bold text-navy">{title}</h3>
                  <p className="mt-2 leading-relaxed text-gray-600">{description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
