'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { User } from '@supabase/supabase-js'
import RequestModal from './RequestModal'

interface Profile {
  verified: boolean
  first_name: string | null
  last_name: string | null
  institution: string | null
  title: string | null
}

export default function RequestButton({ vesselId, vesselName }: { vesselId: number; vesselName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<User | null | undefined>(undefined) // undefined = loading
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u)
      if (u) {
        supabase
          .from('profiles')
          .select('verified, first_name, last_name, institution, title')
          .eq('id', u.id)
          .single()
          .then(({ data }) => setProfile(data))
      }
    })
  }, [])

  const handleClick = () => {
    if (user === undefined) return // still loading
    if (!user) {
      router.push(`/auth/signin?next=/vessels/${vesselId}`)
      return
    }
    setOpen(true)
  }

  // Verified gate: show inline message instead of opening modal
  if (user && profile && !profile.verified && !open) {
    return (
      <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-center">
        <p className="text-sm font-medium text-gray-700">Verification pending</p>
        <p className="text-xs text-gray-400 mt-1">
          Your account is awaiting admin verification. You'll receive an email once approved.
        </p>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full bg-navy text-white py-4 rounded-2xl font-semibold text-base hover:bg-navy-600 transition-all hover:shadow-lg active:scale-[0.98]"
      >
        Connect with this Vessel
      </button>
      {open && user && profile && (
        <RequestModal
          vesselId={vesselId}
          vesselName={vesselName}
          user={user}
          profile={profile}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
