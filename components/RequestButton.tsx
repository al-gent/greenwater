'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import type { User } from '@supabase/supabase-js'
import RequestModal from './RequestModal'

interface Profile {
  first_name: string | null
  last_name: string | null
  institution: string | null
  title: string | null
}

export interface RequestPrefill { startDate?: string; endDate?: string; message?: string; context?: string }

export default function RequestButton({ vesselId, vesselName, compact = false, label, className, prefill, next }: {
  vesselId: number; vesselName: string; compact?: boolean
  label?: string; className?: string          // override the button's text / styling
  prefill?: RequestPrefill                    // seed the message form (e.g. from a cruise)
  next?: string                               // where to come back to after sign-in
}) {
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
          .select('first_name, last_name, institution, title')
          .eq('id', u.id)
          .single()
          .then(({ data }) => setProfile(data))
      }
    })
  }, [])

  const handleClick = () => {
    if (user === undefined) return // still loading
    if (!user) {
      router.push(`/auth/signin?next=${encodeURIComponent(next ?? `/vessels/${vesselId}`)}`)
      return
    }
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={className ?? (compact ? 'btn-primary' : 'btn-primary w-full')}
      >
        {label ?? (
          <span className="flex items-center justify-center gap-1.5">
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-6 4v-4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
            </svg>
            Message
          </span>
        )}
      </button>
      {open && user && profile && (
        <RequestModal
          vesselId={vesselId}
          vesselName={vesselName}
          user={user}
          profile={profile}
          prefill={prefill}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
