'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import ClaimModal from './ClaimModal'

interface Profile {
  first_name: string | null
  last_name: string | null
  institution: string | null
  title: string | null
  email: string | null
}

interface ClaimButtonProps {
  vesselId: number
  vesselName: string
}

export default function ClaimButton({ vesselId, vesselName }: ClaimButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase
        .from('profiles')
        .select('first_name, last_name, institution, title, email')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  const handleClick = () => {
    if (!userId) {
      router.push(`/auth/signin?next=/vessels/${vesselId}`)
      return
    }
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full border border-navy text-navy py-3 rounded-2xl font-medium text-sm hover:bg-navy-50 transition-all"
      >
        Claim This Vessel
      </button>
      {open && userId && (
        <ClaimModal
          vesselId={vesselId}
          vesselName={vesselName}
          profile={profile}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
