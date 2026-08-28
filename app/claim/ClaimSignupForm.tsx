'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-browser'

export interface VesselOption {
  id: number
  name: string
  country: string | null
  port_city: string | null
  claimed: boolean
}

interface SignedInUser {
  id: string
  email: string | null
  displayName: string
}

function VesselPicker({
  vessels,
  selected,
  onSelect,
}: {
  vessels: VesselOption[]
  selected: VesselOption | null
  onSelect: (v: VesselOption | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return vessels.slice(0, 50)
    return vessels.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 50)
  }, [vessels, query])

  if (selected) {
    return (
      <div className="flex items-center justify-between border border-teal bg-teal-50 rounded-xl px-3.5 py-2.5">
        <div>
          <p className="text-sm font-medium text-navy">{selected.name}</p>
          <p className="text-xs text-gray-500">
            {[selected.port_city, selected.country].filter(Boolean).join(', ')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { onSelect(null); setQuery('') }}
          className="text-sm text-gray-400 hover:text-red-500 px-2"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search by vessel name…"
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-card max-h-64 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-gray-400">No vessels match &ldquo;{query}&rdquo;</p>
          ) : (
            matches.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={v.claimed}
                onClick={() => { onSelect(v); setOpen(false) }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed border-b border-gray-50 last:border-b-0"
              >
                <span className="text-sm text-navy font-medium">{v.name}</span>
                {v.claimed && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Already claimed</span>
                )}
                <span className="block text-xs text-gray-400">
                  {[v.port_city, v.country].filter(Boolean).join(', ')}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ClaimForm({ vessels }: { vessels: VesselOption[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [vessel, setVessel] = useState<VesselOption | null>(() => {
    const id = parseInt(searchParams.get('vessel') ?? '', 10)
    return vessels.find((v) => v.id === id && !v.claimed) ?? null
  })
  const [relationship, setRelationship] = useState('')

  // account fields (hidden when already signed in)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [organization, setOrganization] = useState('')
  const [vesselRole, setVesselRole] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [user, setUser] = useState<SignedInUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingEmail, setExistingEmail] = useState(false)
  const [done, setDone] = useState<'confirm_email' | 'submitted' | null>(null)

  // The form is tall; when it collapses into the short confirmation card the
  // viewport would otherwise stay scrolled at where the submit button was.
  useEffect(() => {
    if (done) window.scrollTo(0, 0)
  }, [done])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (u) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', u.id)
          .single()
        const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || u.email || ''
        setUser({ id: u.id, email: u.email ?? null, displayName })
      }
      setAuthChecked(true)
    })
  }, [])

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

    // Already signed in — the claim API works directly.
    if (user) {
      setLoading(true)
      const res = await fetch('/api/vessel-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vessel_id: vessel.id,
          vessel_name: vessel.name,
          message: relationship.trim(),
        }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.instant) {
          // Access granted immediately — drop them straight into their listing.
          router.push(`/dashboard/edit?vessel=${vessel.id}&welcome=1`)
          return
        }
        setLoading(false)
        setDone('submitted')
      } else {
        setLoading(false)
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Submission failed. Please try again.')
      }
      return
    }

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          account_type: 'vessel',
          first_name: firstName,
          last_name: lastName,
          institution: organization,
          title: vesselRole,
          // Picked up by the profiles-insert database webhook
          // (/api/hooks/new-profile), which files the claim at signup
          // time and clears this key.
          pending_claim: {
            vessel_id: vessel.id,
            vessel_name: vessel.name,
            message: relationship.trim(),
          },
        },
        // Confirming the email lands them directly in their listing's editor —
        // the membership is granted at signup by handle_new_user.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/dashboard/edit?vessel=${vessel.id}&welcome=1`)}`,
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
    setDone('confirm_email')
  }

  // text-base on mobile: iOS Safari auto-zooms the page when focusing an
  // input whose font-size is under 16px
  const inputClass = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition'

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 pt-[112px] pb-12">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {done === 'confirm_email' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              )}
            </svg>
          </div>
          {done === 'confirm_email' ? (
            <>
              <h2 className="text-2xl font-bold text-navy mb-2">Almost there — check your email</h2>
              <p className="text-gray-500 mb-3">
                We sent a confirmation link to <strong>{email}</strong>. Click it and you&apos;ll land
                right in the editor for <strong>{vessel?.name}</strong> — no waiting for approval.
              </p>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">
                Our team will confirm your claim behind the scenes and reach out if we have questions.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-navy mb-2">Claim submitted</h2>
              <p className="text-gray-500 mb-3">
                <strong>{vessel?.name}</strong> already has an operator, so our team will review
                your claim and follow up at <strong>{user?.email}</strong>.
              </p>
              <p className="text-sm text-gray-400">Most reviews take 3–5 business days.</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 pt-[112px] pb-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="relative w-10 h-10">
              <Image src="/logo.jpg" alt="Greenwater Foundation" fill className="object-contain" />
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
              <VesselPicker vessels={vessels} selected={vessel} onSelect={setVessel} />
              <p className="text-xs text-gray-400 mt-1.5">
                Don&apos;t see your vessel?{' '}
                <Link href="/list-your-vessel" className="text-teal hover:underline">
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

            {authChecked && user ? (
              <div className="bg-lightblue-100 rounded-xl px-4 py-3 text-sm text-navy">
                <p className="font-medium">Claiming as</p>
                <p className="text-gray-600 mt-0.5">{user.displayName}</p>
              </div>
            ) : (
              <>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        required
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        placeholder="e.g. NOAA, University of Washington…"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Role <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        required
                        value={vesselRole}
                        onChange={(e) => setVesselRole(e.target.value)}
                        placeholder="e.g. Chief Scientist, Fleet Manager…"
                        className={inputClass}
                      />
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
              </>
            )}

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
              ) : user ? 'Submit Claim' : 'Create Account & Claim'}
            </button>
          </form>

          {!user && (
            <p className="text-center text-sm text-gray-500 mt-6">
              Already have an account?{' '}
              <Link href={`/auth/signin?next=${encodeURIComponent('/claim')}`} className="text-teal font-medium hover:underline">
                Sign in
              </Link>
            </p>
          )}
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
