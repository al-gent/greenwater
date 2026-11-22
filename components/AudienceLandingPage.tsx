import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import LandingPageFaq from '@/components/LandingPageFaq'
import { getNetworkStats } from '@/lib/network-stats'

type Action = { label: string; href: string }
const iconPaths = {
  profile: ['M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'],
  location: ['M15 12a3 3 0 11-6 0 3 3 0 016 0z', 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'],
  cost: ['M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
  check: ['M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'],
}

type LandingPageProps = {
  audience: string
  hero: { title: string; description: ReactNode; primary: Action; secondary: Action }
  overview: {
    title: string
    description: string
    features: { icon: keyof typeof iconPaths; title: string; description: string; action?: Action }[]
  }
  planning: { title: string; paragraphs: string[]; action: Action; secondary: Action }
  faqId: string
  questions: { question: string; answer: string }[]
}


export default async function AudienceLandingPage({ audience, hero, overview, planning, faqId, questions }: LandingPageProps) {
  const stats = await getNetworkStats().catch(() => {
    console.error('Network statistics unavailable')
    return null
  })

  return (
    <article className="pt-16">
      <header className="bg-gradient-to-br from-navy via-navy-600 to-teal text-white">
        <div className="page-gutter py-12 sm:py-16 grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
          <div className="max-w-2xl">
            <p className="text-gold font-semibold text-sm uppercase tracking-widest mb-4">{audience}</p>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">{hero.title}</h1>
            <p className="text-lg text-white/80 leading-relaxed">{hero.description}</p>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <Link href={hero.primary.href} className="btn-primary">{hero.primary.label}</Link>
              <Link href={hero.secondary.href} className="btn-secondary border-white/60 text-white hover:bg-white/10">{hero.secondary.label}</Link>
            </div>
          </div>
          <Image src="/rv-cosmo-cutout.webp" alt="R/V Cosmo seen from the bow" width={1179} height={1156} priority unoptimized className="mx-auto h-auto w-full max-w-[240px] md:max-w-[390px]" />
        </div>
      </header>

      {stats && (
        <section aria-label="VesselConnect in numbers" className="bg-teal-50 border-b border-teal-100">
          <dl className="page-gutter grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-7 py-8">
            {[
              { value: stats.vessels, label: 'Vessels', detail: `${stats.vessels_added} added this month` },
              { value: stats.countries, label: 'Countries' },
              { value: stats.members, label: 'Members', detail: `${stats.members_joined} joined this month` },
              { value: stats.institutions, label: 'Institutions represented' },
            ].map(({ value, label, detail }) => (
              <div key={label} className="flex flex-wrap items-baseline content-start gap-x-2 border-l-2 border-teal-200 pl-3 sm:pl-4">
                <dt className="font-semibold text-navy">{label}</dt>
                <dd className="order-first text-3xl sm:text-4xl font-bold tracking-tight tabular-nums text-navy">{value.toLocaleString('en-US')}</dd>
                {detail && <dd className="basis-full mt-1 text-sm font-medium text-teal">{detail}</dd>}
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="page-gutter py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-navy mb-3">{overview.title}</h2>
            <p className="text-gray-500 mb-8 leading-relaxed">{overview.description}</p>
            <div className="space-y-6">
              {overview.features.map(feature => (
                <div key={feature.title} className="flex gap-4">
                  <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center shrink-0 text-teal mt-0.5">
                    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {iconPaths[feature.icon].map(path => <path key={path} d={path} strokeLinecap="round" strokeLinejoin="round" />)}
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-navy mb-1">{feature.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
                    {feature.action && <Link href={feature.action.href} className="mt-2 inline-block text-sm font-semibold text-teal hover:underline">{feature.action.label}</Link>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Link href="/vessels/1254" className="group overflow-hidden rounded-3xl shadow-card hover:shadow-card-hover lg:order-first">
            <Image src="https://jmpxcsihkmyotidxjuyv.supabase.co/storage/v1/object/public/vessel-photos/1254/1793833472644-x1p4pxysr.jpg" alt="Mike Reigle" width={800} height={640} unoptimized className="h-56 w-full object-cover sm:h-72 lg:h-[480px]" />
            <span className="block px-4 py-3 text-sm font-semibold text-navy group-hover:text-teal">Mike Reigle, Aquarium of the Bay</span>
          </Link>
        </div>
      </section>

      <section id="project-planning" aria-labelledby="project-planning-heading" className="scroll-mt-16 bg-teal-50 py-16">
        <div className="page-gutter mx-auto max-w-3xl">
          <h2 id="project-planning-heading" className="mb-3 text-3xl font-bold text-navy">{planning.title}</h2>
          {planning.paragraphs.map(text => <p key={text} className="mt-3 leading-relaxed text-gray-600">{text}</p>)}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href={planning.action.href} className="btn-primary">{planning.action.label}</Link>
            <Link href={planning.secondary.href} className="btn-secondary">{planning.secondary.label}</Link>
          </div>
        </div>
      </section>

      <LandingPageFaq headingId={faqId} questions={questions} />
    </article>
  )
}
