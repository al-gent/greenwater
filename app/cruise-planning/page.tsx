import type { Metadata } from 'next'
import Link from 'next/link'
import LandingPageFaq from '@/components/LandingPageFaq'
import { authLink } from '@/lib/auth-navigation'

const title = 'Cruise planning for research fleets and consortia | VesselConnect'
const description = 'Coordinate marine fieldwork across organizations. Compare vessel schedules, see the research planned aboard each cruise, and find opportunities to share ship time.'

export const metadata: Metadata = {
  title, description,
  alternates: { canonical: '/cruise-planning' },
  openGraph: { title, description, url: '/cruise-planning', type: 'website' },
}

const timeline = '/research?view=timeline'
const watchlist = authLink('/get-started', '/dashboard/fleet')
const questions = [
  {
    question: 'Can we follow vessels operated by another organization?',
    answer: 'Yes. Each person can add vessels from any partner organization to their Vessel Watchlist. The operators manage their own listings and schedules. Use Share schedule to send colleagues a link showing the same vessels together.',
  },
  {
    question: 'How do we put research dates on a vessel’s calendar?',
    answer: 'Create and publish a project with your study area, date window, team, and equipment needs. An operator proposes a vessel and dates. Once the researcher accepts and the operator confirms, the cruise appears on the schedule. Operators can also use Update availability to mark time away for maintenance or other commitments.',
  },
  {
    question: 'Can my project join a cruise that’s already scheduled?',
    answer: 'Open the cruise and choose Message the operator. Include your project link, the leg you want to join, how many places you need, and what you’ll bring aboard. You can also use your usual email or phone contact. The operator can confirm whether your work fits the trip.',
  },
]

export default function CruisePlanningPage() {
  return (
    <article className="pt-16">
      <header className="border-b border-teal-100 bg-teal-50">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-12">
          <div>
            <p className="mb-3 text-sm font-semibold text-teal">Cruise planning</p>
            <h1 className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">Plan ship time across your research fleet</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600">When five organizations operate their own boats, a team looking for a ride can miss a cruise already headed to its study site. Bring your vessels into one calendar to see who’s going where, when they sail, and where another project could fit.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={timeline} className="btn-primary">Explore the fleet timeline</Link>
              <Link href={watchlist} className="btn-secondary">Set up your watchlist</Link>
            </div>
          </div>
          <figure className="rounded-2xl border border-teal-100 bg-white p-5 shadow-card sm:p-7">
            <figcaption className="text-sm font-semibold text-teal">Example cruise · Monterey Bay</figcaption>
            <h2 className="mt-2 text-2xl font-bold text-navy">One trip out of Moss Landing</h2>
            <dl className="mt-5 divide-y divide-gray-200 border-y border-gray-200 text-sm">
              <div className="grid grid-cols-[6rem_1fr] gap-3 py-3">
                <dt className="font-semibold text-navy">June 8–9</dt>
                <dd className="text-gray-600">A team samples nearshore kelp beds and brings its dive gear ashore on June 9.</dd>
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-3 py-3">
                <dt className="font-semibold text-navy">June 10–12</dt>
                <dd className="text-gray-600">The vessel heads to Monterey Canyon with a water sampler aboard and three science berths open.</dd>
              </div>
            </dl>
            <p className="mt-4 leading-relaxed text-gray-600">A partner lab needs water from the canyon. Its coordinator can ask, “Could our three researchers join the second leg and use your sampler?”</p>
          </figure>
        </div>
      </header>

      <section aria-labelledby="setup" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="setup" className="text-3xl font-bold text-navy">Set up your consortium’s calendar</h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3">
          <li className="border-t-2 border-teal-200 pt-4">
            <h3 className="text-lg font-semibold text-navy">1. Put each vessel on the schedule</h3>
            <p className="my-3 leading-relaxed text-gray-600">Ask each operator to sign in, list or claim their vessel under My Vessels, and fill in its equipment and capacity. For upcoming research, publish a project, agree on dates, and confirm the cruise.</p>
            <Link className="font-semibold text-teal hover:underline" href={authLink('/get-started', '/dashboard/listings')}>List or claim a vessel</Link>
          </li>
          <li className="border-t-2 border-teal-200 pt-4">
            <h3 className="text-lg font-semibold text-navy">2. Follow the boats you work with</h3>
            <p className="my-3 leading-relaxed text-gray-600">On each partner vessel’s profile, choose Add to watchlist. Open Vessel Watchlist in your dashboard to compare the next few weeks or months side by side. Share schedule gives colleagues a link to that fleet view.</p>
            <Link className="font-semibold text-teal hover:underline" href="/vessels">Find your partners’ vessels</Link>
          </li>
          <li className="border-t-2 border-teal-200 pt-4">
            <h3 className="text-lg font-semibold text-navy">3. Find a trip your project can join</h3>
            <p className="my-3 leading-relaxed text-gray-600">Open a cruise near your study site. Check its dates, people, and listed equipment. Message the operator with the leg you’re interested in, or create a project and send its link so you can work out the details together.</p>
            <Link className="font-semibold text-teal hover:underline" href={authLink('/get-started', '/dashboard/projects/new')}>Create a project</Link>
          </li>
        </ol>
      </section>

      <section aria-labelledby="aboard" className="bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h2 id="aboard" className="text-3xl font-bold text-navy">How cruises and projects work on VesselConnect</h2>
          <p className="mt-4 leading-relaxed text-gray-600">Open a <strong>cruise</strong> on the calendar to see which vessel is sailing, where it’s going, and when it leaves and returns. A single cruise can include several <strong>projects</strong>. Each project describes one team’s research, who’s doing the work, and the equipment they need.</p>
          <p className="mt-3 leading-relaxed text-gray-600">The cruise page brings the projects, people, and equipment together. When berth figures are available, it shows the operator’s count or a labeled estimate. Ask the operator to confirm space and gear for the days your team wants to sail.</p>
          <p className="mt-3 leading-relaxed text-gray-600">As one project wraps up and another joins, people and instruments can come aboard or go ashore, freeing up space for the next team.</p>
        </div>
      </section>
      <LandingPageFaq headingId="cruise-planning-questions" questions={questions} />
    </article>
  )
}
