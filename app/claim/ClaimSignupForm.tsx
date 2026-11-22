'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authLink } from '@/lib/auth-navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-browser'

import ClaimVesselPicker, { type VesselOption } from '@/components/ClaimVesselPicker'

function ClaimForm({ vessels }: { vessels: VesselOption[] }) {
  const searchParams = useSearchParams()

  const [vessel, setVessel] = useState<VesselOption | null>(() => {
    const id = parseInt(searchParams.get('vessel') ?? '', 10)
    return vessels.find((v) => v.id === id) ?? null
  })
  const [relationship, setRelationship] = useState('')

  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingEmail, setExistingEmail] = useState(false)
  const [done, setDone] = useState(false)

  // The form is tall; when it collapses into the short confirmation card the
  // viewport would otherwise stay scrolled at where the submit button was.
  useEffect(() => {
    if (done) window.scrollTo(0, 0)
  }, [done])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setExistingEmail(false)

    if (!vessel) {
      setError('Please select your vessel.')
      return
    }
    if (!relationship.trim()) {
      setError('Please describe your relationship to this vessel.')
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    const next = vessel.claimed ? '/dashboard/listings' : `/dashboard/listings/edit?vessel=${vessel.id}&welcome=1`
    setLoading(true)
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          signup_next: next,
          // Picked up by the profiles-insert database webhook
          // (/api/hooks/new-profile), which files the claim at signup
          // time and clears this key.
          pending_claim: {
            vessel_id: vessel.id,
            vessel_name: vessel.name,
            message: relationship.trim(),
          },
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
    // identifiable by an empty identities array.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setExistingEmail(true)
      return
    }
    if (data.session) {
      window.location.assign(next)
      return
    }
    setDone(true)
  }

  // text-base on mobile: iOS Safari auto-zooms the page when focusing an
  // input whose font-size is under 16px
  const inputClass = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition'

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 pt-20 pb-12">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-navy mb-2">Almost there — check your email</h2>
          <p className="text-gray-500 mb-3">
            We sent a confirmation link to <strong>{email}</strong> for your claim on <strong>{vessel?.name}</strong>.
          </p>
          <p className="text-sm text-gray-400 max-w-xs mx-auto">
            {vessel?.claimed ? 'The team will review your claim and email you a decision.' : 'Confirm your email to continue to your listing.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 pt-20 pb-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="relative w-10 h-10">
              <Image src="/logo.svg" alt="" fill className="object-contain" />
            </div>
            <div className="text-left">
              <span className="font-bold text-navy text-lg leading-tight block">Greenwater</span>
              <span className="text-xs text-teal font-medium tracking-wide uppercase leading-tight block -mt-0.5">Foundation</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-navy">Claim your vessel</h1>
          <p className="text-gray-500 text-sm mt-1">
            Create your account and claim your listing in one step
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-8">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}
          {existingEmail && (
            <div className="mb-4 bg-blue-50 border border-blue-100 text-navy text-sm px-4 py-3 rounded-xl">
              An account with this email already exists.{' '}
              <Link
                href={`/auth/signin?next=${encodeURIComponent(`/claim${vessel ? `?vessel=${vessel.id}` : ''}`)}`}
                className="text-teal font-medium hover:underline"
              >
                Sign in
              </Link>{' '}
              and you can submit your claim right away.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Your vessel <span className="text-red-400">*</span>
              </label>
              <ClaimVesselPicker vessels={vessels} selected={vessel} onSelect={setVessel} />
              {vessel?.claimed && (
                <p className="text-xs text-gray-500 mt-1.5">
                  <strong>{vessel.name}</strong> already has a claim on file. You can still claim it —
                  our team will review before granting access.
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1.5">
                Don&apos;t see your vessel?{' '}
                <Link href="/operators" className="text-teal hover:underline">
                  List it here
                </Link>{' '}
                instead.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Your relationship to this vessel <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="e.g. I am the Marine Superintendent and have managed this vessel since 2019…"
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-semibold text-navy mb-3">Create your account</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-400">*</span></label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@organization.org"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">First Name <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Jane"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Last Name <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Smith"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password <span className="text-red-400">*</span></label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password <span className="text-red-400">*</span></label>
                  <input
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                </div>
              </div>
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
                  Submitting…
                </>
              ) : 'Create Account & Claim'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link href={`/auth/signin?next=${encodeURIComponent(vessel ? `/claim?vessel=${vessel.id}` : '/claim')}`} className="text-teal font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ClaimSignupForm({ vessels }: { vessels: VesselOption[] }) {
  return (
    <Suspense>
      <ClaimForm vessels={vessels} />
    </Suspense>
  )
}
