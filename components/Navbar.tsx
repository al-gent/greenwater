'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { User } from '@supabase/supabase-js'

type Profile = { role: string; vessel_id: number | null; verified?: boolean }

export default function Navbar() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        supabase
          .from('profiles')
          .select('role, vessel_id, verified')
          .eq('id', user.id)
          .single()
          .then(({ data }) => setProfile(data))
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase
          .from('profiles')
          .select('role, vessel_id, verified')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => setProfile(data))
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 flex-shrink-0">
            <div className="relative w-10 h-10">
              <Image
                src="/logo.jpg"
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

          {/* Auth section */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {profile?.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="text-sm font-medium text-gray-600 hover:text-navy transition-colors hidden sm:block"
                  >
                    Admin
                  </Link>
                )}
                {profile?.role === 'operator' && (
                  <>
                    <Link
                      href="/dashboard"
                      className="text-sm font-medium text-gray-600 hover:text-navy transition-colors hidden sm:block"
                    >
                      My Vessel
                    </Link>
                    <Link
                      href="/dashboard#inquiries"
                      className="text-sm font-medium text-gray-600 hover:text-navy transition-colors hidden sm:block"
                    >
                      Messages
                    </Link>
                  </>
                )}
                {profile?.role === 'scientist' && profile?.verified && (
                  <Link
                    href="/inbox"
                    className="text-sm font-medium text-gray-600 hover:text-navy transition-colors hidden sm:block"
                  >
                    Inbox
                  </Link>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 hidden sm:block truncate max-w-[140px]">
                    {user.email}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="text-sm font-medium text-gray-500 hover:text-navy transition-colors border border-gray-200 px-3 py-1.5 rounded-full hover:border-gray-300"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <Link
                href="/auth/signin"
                className="bg-navy text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-navy-600 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
