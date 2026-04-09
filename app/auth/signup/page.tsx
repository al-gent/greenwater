'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-browser'

type AccountType = 'researcher' | 'vessel' | null

function RoleCard({
  selected,
  onSelect,
  type,
  icon,
  title,
  description,
}: {
  selected: boolean
  onSelect: () => void
  type: AccountType
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex-1 text-left rounded-xl border-2 p-4 transition-all ${
        selected
          ? 'border-teal bg-teal-50'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 ${selected ? 'bg-teal text-white' : 'bg-gray-100 text-gray-500'}`}>
        {icon}
      </div>
      <p className={`text-sm font-semibold ${selected ? 'text-teal' : 'text-navy'}`}>{title}</p>
      <p className="text-xs text-gray-400 mt-0.5 leading-snug">{description}</p>
    </button>
  )
}

function SignUpForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'

  const [accountType, setAccountType] = useState<AccountType>(null)
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [firstName, setFirstName] = useState(searchParams.get('first_name') ?? '')
  const [lastName, setLastName] = useState(searchParams.get('last_name') ?? '')
  // researcher fields
  const [institution, setInstitution] = useState('')
  const [title, setTitle] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  // vessel fields
  const [organization, setOrganization] = useState('')
  const [vesselRole, setVesselRole] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountType) {
      setError('Please select an account type.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          account_type: accountType,
          first_name: firstName,
          last_name: lastName,
          institution: accountType === 'researcher' ? institution : organization,
          title: accountType === 'researcher' ? title : vesselRole,
          profile_url: accountType === 'researcher' ? (profileUrl || undefined) : undefined,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    setLoading(false)
    if (authError) {
      setError(authError.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 pt-16">
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
          {accountType === 'vessel' && (
            <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
              Once confirmed, browse the vessel listings and claim yours — or submit a new one.
            </p>
          )}
          {accountType === 'researcher' && (
            <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
              After confirming your email, your account will be reviewed by our team before you can message operators.
            </p>
          )}
          <Link href="/auth/signin" className="text-teal font-medium hover:underline text-sm">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 pt-16 pb-12">
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
          <h1 className="text-2xl font-bold text-navy">Create your account</h1>
          <p className="text-gray-500 text-sm mt-1">Join the Greenwater community</p>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-8">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Role selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">I am a…</label>
              <div className="flex gap-3">
                <RoleCard
                  type="researcher"
                  selected={accountType === 'researcher'}
                  onSelect={() => setAccountType('researcher')}
                  title="Researcher"
                  description="Marine scientist looking for research vessel access"
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  }
                />
                <RoleCard
                  type="vessel"
                  selected={accountType === 'vessel'}
                  onSelect={() => setAccountType('vessel')}
                  title="Vessel Operator"
                  description="Managing or representing a research vessel"
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  }
                />
              </div>
            </div>

            {accountType && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-400">*</span></label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@institution.edu"
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

                {accountType === 'researcher' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Institution <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        required
                        value={institution}
                        onChange={(e) => setInstitution(e.target.value)}
                        placeholder="WHOI / MIT / NOAA…"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Title <span className="text-red-400">*</span></label>
                      <input
                        type="text"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. PhD Student, Principal Investigator…"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">ORCID / Website <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input
                        type="url"
                        value={profileUrl}
                        onChange={(e) => setProfileUrl(e.target.value)}
                        placeholder="https://orcid.org/0000-…"
                        className={inputClass}
                      />
                    </div>
                  </>
                )}

                {accountType === 'vessel' && (
                  <>
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
                    <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-navy/80">
                      After confirming your email, you can claim an existing vessel listing or submit a new one for review.
                    </div>
                  </>
                )}

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
              </>
            )}
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link href={`/auth/signin${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-teal font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  )
}
