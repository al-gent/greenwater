import Link from 'next/link'
import { getServerUser } from '@/lib/supabase-server'

function FeatureItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0 text-teal mt-0.5">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-navy mb-1">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

export default async function ListYourVesselPage() {
  const user = await getServerUser()
  const signedIn = !!user

  return (
    <div className="pt-[112px]">
      {/* Hero */}
      <div className="bg-gradient-to-br from-navy via-navy-600 to-teal text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-gold font-semibold text-sm uppercase tracking-widest mb-4">
              For Vessel Operators
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
              Put Your Research Vessel<br />to Work
            </h1>
            <p className="text-lg text-white/80 leading-relaxed">
              Join the Greenwater Foundation network and connect your research vessel with
              scientists around the world. Fill capacity, fund operations, and advance
              global marine science.
            </p>
            <div className="flex items-center gap-6 mt-8">
              {signedIn ? (
                <>
                  <Link
                    href="/list-your-vessel/apply"
                    className="bg-gold text-navy px-6 py-3.5 rounded-full font-semibold hover:bg-yellow-400 transition-colors"
                  >
                    Apply to List Your Vessel
                  </Link>
                  <Link
                    href="/"
                    className="text-white/80 hover:text-white font-medium flex items-center gap-1.5 transition-colors"
                  >
                    Browse vessels
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/signup?next=/list-your-vessel/apply"
                    className="bg-gold text-navy px-6 py-3.5 rounded-full font-semibold hover:bg-yellow-400 transition-colors"
                  >
                    Sign up to list
                  </Link>
                  <Link
                    href="/auth/signin?next=/list-your-vessel/apply"
                    className="text-white/80 hover:text-white font-medium transition-colors"
                  >
                    Already have an account? Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-teal text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 divide-x divide-white/20">
            {[
              { value: '567+', label: 'Vessels listed' },
              { value: '60+', label: 'Countries' },
              { value: '500+', label: 'Research institutions' },
            ].map((s) => (
              <div key={s.label} className="text-center px-4">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-white/70 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Value props */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-navy mb-3">
              Why list on Greenwater?
            </h2>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Our platform makes it easy to fill empty berths and fund ongoing research
              operations — while contributing to the global scientific community.
            </p>

            <div className="space-y-6">
              <FeatureItem
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                }
                title="Global Visibility"
                desc="Your vessel reaches thousands of marine scientists and research institutions worldwide actively searching for research platforms."
              />
              <FeatureItem
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                title="Fill Vacant Berths"
                desc="Maximize utilization by connecting with scientists whose timelines align with your existing schedules and research cruises."
              />
              <FeatureItem
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                title="Trusted Community"
                desc="Join a curated network of verified research institutions. All scientists are vetted before accessing vessel contact information."
              />
              <FeatureItem
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                title="Detailed Profiles"
                desc="Showcase your vessel's full specification sheet, equipment list, photos, and operational capabilities to serious researchers."
              />
            </div>
          </div>

          {/* Ocean photo */}
          <div className="relative hidden lg:block">
            <div
              className="rounded-3xl overflow-hidden shadow-card-hover"
              style={{ height: '480px' }}
            >
              <img
                src="https://jmpxcsihkmyotidxjuyv.supabase.co/storage/v1/object/public/vessel-photos/entete-ismer2.jpg"
                alt="Research vessel at sea"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/40 to-transparent rounded-3xl" />
            </div>
            <div className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-card-hover p-4 max-w-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center text-teal flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-navy text-sm">Free to list</p>
                  <p className="text-xs text-gray-500">No upfront fees or commitments</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mid-page CTA */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold text-navy mb-3">Ready to embark?</h2>
          <p className="text-gray-500 mb-6">
            Submit your vessel for review — our team responds within 3–5 business days.
          </p>
          {signedIn ? (
            <Link
              href="/list-your-vessel/apply"
              className="inline-block bg-navy text-white px-7 py-3.5 rounded-full font-semibold hover:bg-navy-600 transition-colors"
            >
              Start your application
            </Link>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/auth/signup?next=/list-your-vessel/apply"
                className="bg-navy text-white px-6 py-3 rounded-full text-sm font-semibold hover:bg-navy-600 transition-colors"
              >
                Sign up free
              </Link>
              <Link
                href="/auth/signin?next=/list-your-vessel/apply"
                className="border border-gray-200 text-gray-700 px-6 py-3 rounded-full text-sm font-semibold hover:border-gray-300 transition-colors"
              >
                Sign in
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-bold text-navy mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {[
            {
              q: 'How much does it cost to list?',
              a: 'Listing your vessel on Greenwater Foundation is completely free. We are a non-profit foundation dedicated to advancing marine science.',
            },
            {
              q: 'How do inquiries work?',
              a: 'Scientists submit requests through our platform. You receive the inquiry directly by email and can negotiate terms, dates, and pricing directly with the researcher.',
            },
            {
              q: 'What information do I need to provide?',
              a: 'At minimum: vessel name, home port, key specs (length, berths, speed), and a brief description of research capabilities. Photos and full spec sheets make your listing much more compelling.',
            },
            {
              q: 'Can I control who contacts me?',
              a: 'Yes. All scientist inquiries go through our platform and you can choose to respond or not. Contact details are never shared without your consent.',
            },
          ].map((faq, i) => (
            <div key={i} className="bg-gray-50 rounded-2xl p-5">
              <h3 className="font-semibold text-navy mb-2">{faq.q}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
