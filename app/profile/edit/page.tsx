'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

export default function ProfileEditPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [institution, setInstitution] = useState('')
  const [title, setTitle] = useState('')
  const [profileUrl, setProfileUrl] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/auth/signin?next=/profile/edit')
          return
        }
        const { data } = await supabase
          .from('profiles')
          .select('first_name, last_name, institution, title, profile_url')
          .eq('id', user.id)
          .single()
        if (data) {
          setFirstName(data.first_name ?? '')
          setLastName(data.last_name ?? '')
          setInstitution(data.institution ?? '')
          setTitle(data.title ?? '')
          setProfileUrl(data.profile_url ?? '')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/auth/signin?next=/profile/edit')
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ first_name: firstName, last_name: lastName, institution, title, profile_url: profileUrl || null })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    await supabase.auth.updateUser({ data: { first_name: firstName, last_name: lastName } })

    setSaving(false)
    setSaved(true)
    setTimeout(() => router.replace('/'), 1200)
  }

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-transparent transition'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 pt-[88px] pb-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-navy mb-2">Your profile</h1>
          <p className="text-gray-500 text-sm">Help vessel operators know who you are.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">First name <span className="text-red-400">*</span></label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Last name <span className="text-red-400">*</span></label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Institution / Organization</label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. WHOI, NOAA, University of Washington…"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title / Role</label>
                <input
                  type="text"
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

              {error && <p className="text-sm text-red-500">{error}</p>}
              {saved && (
                <p className="text-sm text-teal font-medium text-center">Profile saved! Redirecting…</p>
              )}

              <button
                type="submit"
                disabled={saving || saved}
                className="w-full bg-navy text-white py-2.5 rounded-xl text-sm font-medium hover:bg-navy/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-400 mt-4">
          <Link href="/" className="hover:text-gray-600 transition-colors">Back to vessels</Link>
        </p>
      </div>
    </div>
  )
}
