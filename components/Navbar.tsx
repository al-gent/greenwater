import Link from 'next/link'
import Image from 'next/image'

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 flex-shrink-0">
            <div className="relative w-8 h-8">
              <Image
                src="/logo.png"
                alt="Greenwater Foundation"
                fill
                className="object-contain"
              />
            </div>
            <div>
              <span className="font-bold text-navy text-lg leading-tight block">
                Greenwater
              </span>
              <span className="text-xs text-teal font-medium tracking-wide uppercase leading-tight block -mt-0.5">
                Foundation
              </span>
            </div>
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/"
              className="text-gray-600 hover:text-navy font-medium transition-colors text-sm"
            >
              Find a Vessel
            </Link>
            <Link
              href="/list"
              className="text-gray-600 hover:text-navy font-medium transition-colors text-sm"
            >
              List Your Vessel
            </Link>
          </div>

          {/* Sign In */}
          <div className="flex items-center gap-3">
            <button className="bg-navy text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-navy-600 transition-colors">
              Sign In
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
