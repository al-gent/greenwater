'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authLink } from '@/lib/auth-navigation'
import { createClient } from '@/lib/supabase-browser'
import { trackConversion } from '@/lib/gtag'
import { getAdClick } from '@/lib/ad-attribution'

export default function SignUpForm({ next }: { next: string }) {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [firstName, setFirstName] = useState(searchParams.get('first_name') ?? '')
  const [lastName, setLastName] = useState(searchParams.get('last_name') ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          signup_next: next,
          first_name: firstName,
          last_name: lastName,
          // Which ad click (if any) brought this visitor — copied onto the
          // profile row by handle_new_user for offline conversion upload.
          ...(getAdClick() ?? {}),
        },
        emailRedirectTo: window.location.origin + authLink('/auth/callback', next),
      },
    })

    setLoading(false)
    if (authError) {
      setError(authError.message)
      return
    }
    // Supabase returns a fake success for existing emails (anti-enumeration),
    // identifiable by an empty identities array — don't show "check your email".
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError('An account with this email already exists. Sign in below, or reset your password if you’ve forgotten it.')
      return
    }
    trackConversion('signup')
    if (data.session) {
      window.location.assign(next)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 pt-20">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-navy mb-2">Check your email</h2>
          <p className="text-gray-500 mb-3">
            We sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account.
          </p>
        </div>
      </div>
    )
  }

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 pt-20 pb-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-navy">Create your free account</h1>
          <p className="text-gray-500 text-sm mt-1">
            {next === '/dashboard/listings'
              ? 'Once you join, you can list your vessel or claim one that’s already listed.'
              : next === '/dashboard/projects/new'
                ? 'Once you join, you can start a project for your fieldwork.'
                : 'Join VesselConnect to explore marine research, save vessels, and connect with people working at sea.'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-8">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-400">*</span></label>
              <input
                type="email"
                required
                id="email" autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1.5">First Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  id="firstName" autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1.5">Last Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  id="lastName" autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password <span className="text-red-400">*</span></label>
              <input
                type="password"
                required
                minLength={8}
                id="password" autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password <span className="text-red-400">*</span></label>
              <input
                type="password"
                required
                id="confirm" autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-navy text-white py-3 rounded-2xl font-semibold hover:bg-navy-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account…
                </>
              ) : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link href={authLink('/auth/signin', next)} className="text-teal font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
