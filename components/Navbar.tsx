'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { User } from '@supabase/supabase-js'
type Profile = { is_admin: boolean; verified?: boolean; first_name?: string | null; last_name?: string | null }

export default function Navbar() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)

  // Items awaiting review (submissions + claims + unverified scientists) for
  // the badge on the Admin link. AdminDashboard dispatches the event after
  // every approve/reject so the badge updates without a page reload.
  useEffect(() => {
    if (!profile?.is_admin) { setPendingCount(0); return }
    const refresh = () =>
      fetch('/api/admin/pending-count')
        .then((r) => r.json())
        .then((d) => setPendingCount(typeof d?.count === 'number' ? d.count : 0))
        .catch(() => {})
    refresh()
    window.addEventListener('gw:pending-count-changed', refresh)
    return () => window.removeEventListener('gw:pending-count-changed', refresh)
  }, [profile?.is_admin])

  // Unread message threads for the badge on Messages (operator) / Inbox
  // (scientist). Thread components dispatch the event after opening a thread
  // or replying so the badge updates without a page reload.
  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    const refresh = () =>
      fetch('/api/messages/unread-count')
        .then((r) => r.json())
        .then((d) => setUnreadCount(typeof d?.count === 'number' ? d.count : 0))
        .catch(() => {})
    refresh()
    window.addEventListener('gw:unread-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('gw:unread-changed', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [user])

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        supabase
          .from('profiles')
          .select('is_admin, verified, first_name, last_name')
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
          .select('is_admin, verified, first_name, last_name')
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
    <>
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className="bg-navy py-1.5 text-center text-sm text-white font-medium tracking-wide whitespace-nowrap overflow-hidden" onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2A7B6F')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1B3A6B')}>
        VesselConnect
      </div>
    <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-16">
          {/* Logo */}
          <a href="https://greenwaterfoundation.org" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 flex-shrink-0">
            <div className="relative w-10 h-10">
              <Image
                src="/logo.jpg"
                alt="Greenwater Foundation"
                fill
                className="object-contain"
              />
            </div>
            <div className="flex flex-col" style={{ lineHeight: 1.15 }}>
              <span className="font-bold text-navy text-base" style={{ letterSpacing: '-0.01em' }}>
                Greenwater
              </span>
              <span className="font-bold text-teal text-[13px] uppercase" style={{ letterSpacing: '0.1em' }}>
                Foundation
              </span>
            </div>
          </a>

          {/* Nav links — absolutely centered relative to the navbar */}
          <div className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
            <Link
              href="/"
              className="text-gray-600 hover:text-navy font-medium transition-colors text-sm"
            >
              Home
            </Link>
            <Link
              href="/list-your-vessel"
              className="text-gray-600 hover:text-navy font-medium transition-colors text-sm"
            >
              List Your Vessel
            </Link>
          </div>

          {/* Auth section */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {profile?.is_admin && (
                  <Link
                    href="/admin"
                    className="text-sm font-medium text-gray-600 hover:text-navy transition-colors hidden md:flex items-center gap-1.5"
                  >
                    Admin
                    {pendingCount > 0 && (
                      <span className="bg-gold text-navy text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                )}
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-gray-600 hover:text-navy transition-colors hidden md:flex items-center gap-1.5"
                >
                  Dashboard
                  {unreadCount > 0 && (
                    <span className="bg-gold text-navy text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {unreadCount}
                    </span>
                  )}
                </Link>
              </>
            ) : (
              <Link
                href="/auth/signin"
                className="bg-navy text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-navy-600 transition-colors"
              >
                Sign In
              </Link>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className="md:hidden p-2 -mr-2 text-gray-600 hover:text-navy transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 py-2">
            <Link href="/" onClick={() => setMenuOpen(false)} className="block py-2.5 text-sm font-medium text-gray-600 hover:text-navy transition-colors">
              Home
            </Link>
            <Link href="/list-your-vessel" onClick={() => setMenuOpen(false)} className="block py-2.5 text-sm font-medium text-gray-600 hover:text-navy transition-colors">
              List Your Vessel
            </Link>
            {profile?.is_admin && (
              <Link href="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-1.5 py-2.5 text-sm font-medium text-gray-600 hover:text-navy transition-colors">
                Admin
                {pendingCount > 0 && (
                  <span className="bg-gold text-navy text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {pendingCount}
                  </span>
                )}
              </Link>
            )}
            {user && (
              <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-1.5 py-2.5 text-sm font-medium text-gray-600 hover:text-navy transition-colors">
                Dashboard
                {unreadCount > 0 && (
                  <span className="bg-gold text-navy text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {unreadCount}
                  </span>
                )}
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
    </div>
    </>
  )
}
