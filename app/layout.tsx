import Image from 'next/image'
import type { Metadata } from 'next'
import './globals.css'
import AppearanceControl from '@/components/AppearanceControl'
import AppearanceProvider from '@/components/AppearanceProvider'
import { initialThemeScript } from '@/lib/appearance'
import Navbar from '@/components/Navbar'
import TimeZoneCookie from '@/components/TimeZoneCookie'
import AuthHashHandler from '@/components/AuthHashHandler'
import FooterFormSection from '@/components/FooterFormSection'
import ContactForm from '@/components/ContactForm'
import NewsletterForm from '@/components/NewsletterForm'
import { Analytics } from '@vercel/analytics/react'
import PageViewTracker from '@/components/PageViewTracker'
import GoogleAdsTag from '@/components/GoogleAdsTag'
import AdClickCapture from '@/components/AdClickCapture'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vesselconnect.org').replace(/\/$/, '')

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Self-referencing canonical on every page: the app is served on both
  // vesselconnect.org and vessels.greenwaterfoundation.org, and without an
  // explicit canonical Google flags one host's pages as duplicates.
  alternates: { canonical: './' },
  title: 'VesselConnect — Research Vessel Marketplace',
  description:
    'Connect marine scientists with research vessels worldwide. Find and book research ships for oceanographic expeditions.',
  keywords: 'research vessels, marine science, oceanography, ship charter, scientific research',
  openGraph: {
    title: 'VesselConnect by Greenwater Foundation',
    description: 'Connecting marine scientists with research vessels worldwide.',
    type: 'website',
    url: SITE_URL,
    siteName: 'VesselConnect',
    images: [
      {
        url: 'https://greenwaterfoundation.org/images/IMG_8300.jpeg',
        width: 1536,
        height: 800,
        alt: 'VesselConnect by Greenwater Foundation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VesselConnect by Greenwater Foundation',
    description: 'Connecting marine scientists with research vessels worldwide.',
    images: ['https://greenwaterfoundation.org/images/IMG_8300.jpeg'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initialThemeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <AuthHashHandler />
        <PageViewTracker />
        <TimeZoneCookie />
        <AppearanceProvider>
          <Navbar />
          <main className="min-h-screen">{children}</main>

          {/* Footer */}
          <footer className="bg-navy text-white">
            <div className="page-gutter grid gap-y-8 py-9 xl:grid-cols-[1.35fr_1fr] xl:gap-x-10">
              <div>
                <div className="grid gap-x-5 gap-y-6 sm:grid-cols-[1.5fr_1fr_auto]">
                  <div>
                    <a href="https://greenwaterfoundation.org" target="_blank" rel="noopener noreferrer" className="mb-2 inline-flex items-center gap-2.5 text-xl font-bold leading-tight transition-colors hover:text-gold">
                      <Image src="/logo.svg" alt="" width={40} height={40} className="shrink-0" />
                      <span>Greenwater Foundation</span>
                    </a>
                    <p className="text-lightblue-200 text-sm leading-relaxed max-w-sm opacity-80">
                      Connecting the global marine science community with research vessels.
                      Advancing ocean science, one voyage at a time.
                    </p>
                    <AppearanceControl />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider opacity-60 mb-3">
                      Platform
                    </h3>
                    <ul className="space-y-2 text-sm opacity-80">
                      <li><a href="/vessels" className="hover:text-gold transition-colors">Vessels</a></li>
                      <li><a href="/research" className="hover:text-gold transition-colors">Research</a></li>
                      <li><a href="/cruise-planning" className="hover:text-gold transition-colors">Cruise planning</a></li>
                      <li><a href="/research?view=timeline" className="hover:text-gold transition-colors">Fleet Timeline</a></li>
                      <li><a href="/researchers" className="hover:text-gold transition-colors">For Researchers</a></li>
                      <li><a href="/operators" className="hover:text-gold transition-colors">For Operators</a></li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm uppercase tracking-wider opacity-60 mb-3">
                      Organization
                    </h3>
                    <ul className="space-y-2 text-sm opacity-80">
                      <li><a href="https://greenwaterfoundation.org" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">About Us</a></li>
                      <li className="hidden sm:list-item"><a href="#footer-contact" className="hover:text-gold transition-colors">Contact</a></li>
                      <li><a href="https://www.paypal.com/donate?hosted_button_id=MA7NA6JPF9PBQ" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">Donate</a></li>
                      <li><a href="/privacy" className="hover:text-gold transition-colors">Privacy Policy</a></li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-7 xl:gap-5">
                <FooterFormSection id="footer-contact" title="Contact the team" mobileLabel="Contact">
                  <ContactForm footer />
                </FooterFormSection>
                <FooterFormSection id="footer-newsletter" title="Stay up to date" mobileLabel="Subscribe to newsletter">
                  <NewsletterForm />
                </FooterFormSection>
              </div>
            </div>
          </footer>
        </AppearanceProvider>
        <Analytics />
        <GoogleAdsTag />
        <AdClickCapture />
        {/* Kill-switch: unregister any lingering service worker from the old site */}
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(sw){sw.unregister();})});if('caches'in window){caches.keys().then(function(k){Promise.all(k.map(function(c){return caches.delete(c)}))})}}` }} />
      </body>
    </html>
  )
}
