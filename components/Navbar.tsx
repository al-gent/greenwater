'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import HeaderSearch from './HeaderSearch'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { User } from '@supabase/supabase-js'
import { authLink, destinationFromPage } from '@/lib/auth-navigation'

function AuthLinks({ next, onClick }: { next: string; onClick: () => void }) {
  return (
    <>
      <Link href={authLink('/get-started', next)} onClick={onClick} className="btn-primary px-2.5 sm:px-4">
        Get started
      </Link>
      <Link href={authLink('/auth/signin', next)} onClick={onClick} className="btn-secondary px-2.5 sm:px-4">
        Sign In
      </Link>
    </>
  )
}

function PageAuthLinks({ onClick }: { onClick: () => void }) {
  const path = usePathname()
  const query = useSearchParams()
  return <AuthLinks next={destinationFromPage(path, new URLSearchParams(query))} onClick={onClick} />
}

type Profile = { is_admin: boolean; verified?: boolean; first_name?: string | null; last_name?: string | null }

export default function Navbar() {
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

  return (
    <nav className="fixed inset-x-0 top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="page-gutter">
        <div className="relative flex h-16 items-center gap-3">
          <Link href="/" aria-label="VesselConnect home" onClick={() => setMenuOpen(false)} className="shrink-0">
            <Image src="/logo.svg" alt="" width={40} height={40} className="object-contain" />
          </Link>
          <HeaderSearch onOpen={() => setMenuOpen(false)} />
          <div className="ml-auto flex items-center gap-2 md:gap-3 lg:gap-5">
            <Link
              href="/vessels"
              className="hidden md:block text-gray-600 hover:text-navy font-medium transition-colors text-sm"
            >
              Vessels
            </Link>
            <Link
              href="/research"
              className="hidden md:block text-gray-600 hover:text-navy font-medium transition-colors text-sm"
            >
              Research
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="text-sm font-medium text-gray-600 hover:text-navy transition-colors hidden md:flex items-center gap-1.5"
              >
                Dashboard
                {(unreadCount + pendingCount) > 0 && (
                  <span className="bg-gold text-navy text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {unreadCount + pendingCount}
                  </span>
                )}
              </Link>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Suspense fallback={<AuthLinks next="/dashboard" onClick={() => setMenuOpen(false)} />}>
                  <PageAuthLinks onClick={() => setMenuOpen(false)} />
                </Suspense>
              </div>
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
            <Link href="/vessels" onClick={() => setMenuOpen(false)} className="block py-2.5 text-sm font-medium text-gray-600 hover:text-navy transition-colors">
              Vessels
            </Link>
            <Link href="/research" onClick={() => setMenuOpen(false)} className="block py-2.5 text-sm font-medium text-gray-600 hover:text-navy transition-colors">
              Research
            </Link>
            {user ? (
              <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-1.5 py-2.5 text-sm font-medium text-gray-600 hover:text-navy transition-colors">
                Dashboard
                {(unreadCount + pendingCount) > 0 && (
                  <span className="bg-gold text-navy text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {unreadCount + pendingCount}
                  </span>
                )}
              </Link>
            ) : (
              <div className="flex items-center gap-2 py-2 sm:hidden">
                <Suspense fallback={<AuthLinks next="/dashboard" onClick={() => setMenuOpen(false)} />}>
                  <PageAuthLinks onClick={() => setMenuOpen(false)} />
                </Suspense>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
