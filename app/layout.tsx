import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import AuthHashHandler from '@/components/AuthHashHandler'
import NewsletterForm from '@/components/NewsletterForm'
import { Analytics } from '@vercel/analytics/react'

export const metadata: Metadata = {
  title: 'Greenwater Foundation — Research Vessel Marketplace',
  description:
    'Connect marine scientists with research vessels worldwide. Find and book research ships for oceanographic expeditions.',
  keywords: 'research vessels, marine science, oceanography, ship charter, scientific research',
  openGraph: {
    title: 'Greenwater Foundation',
    description: 'Connecting marine scientists with research vessels worldwide.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <AuthHashHandler />
        <Navbar />
        <main className="min-h-screen">{children}</main>

        {/* Footer */}
        <footer className="bg-navy text-white mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="mb-8 pb-8 border-b border-white/10 flex flex-col items-center gap-4">
              <p className="text-sm font-semibold uppercase tracking-wider opacity-60">Stay up to date</p>
              <NewsletterForm />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="md:col-span-2">
                <a href="https://greenwaterfoundation.org" target="_blank" rel="noopener noreferrer" className="font-bold text-xl mb-2 hover:text-gold transition-colors inline-block">Greenwater Foundation</a>
                <p className="text-lightblue-200 text-sm leading-relaxed max-w-sm opacity-80">
                  Connecting the global marine science community with research vessels.
                  Advancing ocean science, one voyage at a time.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider opacity-60 mb-3">
                  Platform
                </h3>
                <ul className="space-y-2 text-sm opacity-80">
                  <li><a href="/" className="hover:text-gold transition-colors">Find a Vessel</a></li>
                  <li><a href="/list" className="hover:text-gold transition-colors">List Your Vessel</a></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider opacity-60 mb-3">
                  Organization
                </h3>
                <ul className="space-y-2 text-sm opacity-80">
                  <li><a href="https://greenwaterfoundation.org" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">About Us</a></li>
                  <li><a href="mailto:info@greenwaterfoundation.org" className="hover:text-gold transition-colors">Contact</a></li>
                  <li><a href="https://www.paypal.com/donate?hosted_button_id=MA7NA6JPF9PBQ" target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">Donate</a></li>
                  <li><a href="/privacy" className="hover:text-gold transition-colors">Privacy Policy</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/10 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
              <p className="text-xs opacity-40">
                © {new Date().getFullYear()} Greenwater Foundation. All rights reserved.
              </p>
              <p className="text-xs opacity-40">
                {new Date().getFullYear()} · Built for marine science
              </p>
            </div>
          </div>
        </footer>
        <Analytics />
        {/* Kill-switch: unregister any lingering service worker from the old site */}
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(sw){sw.unregister();})});if('caches'in window){caches.keys().then(function(k){Promise.all(k.map(function(c){return caches.delete(c)}))})}}` }} />
      </body>
    </html>
  )
}
