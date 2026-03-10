'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import ClaimModal from './ClaimModal'

interface ClaimButtonProps {
  vesselId: number
  vesselName: string
}

export default function ClaimButton({ vesselId, vesselName }: ClaimButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null)
    })
  }, [])

  const handleClick = () => {
    if (!userEmail) {
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
      {open && userEmail && (
        <ClaimModal
          vesselId={vesselId}
          vesselName={vesselName}
          userEmail={userEmail}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
