'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import VesselEditForm from '@/components/VesselEditForm'
import type { Vessel } from '@/lib/vessel-utils'

export default function EditVesselPage() {
  const router = useRouter()
  const [vessel, setVessel] = useState<Vessel | null>(null)
  const [vesselId, setVesselId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin?next=/dashboard/edit'); return }

      const { data: profile } = await supabase
        .from('profiles').select('role, vessel_id').eq('id', user.id).single()

      if (!profile || profile.role !== 'operator' || !profile.vessel_id) {
        router.push('/dashboard')
        return
      }

      setVesselId(profile.vessel_id)

      const { data } = await supabase
        .from('vessels').select('*').eq('id', profile.vessel_id).single()

      setVessel(data as Vessel)
      setLoading(false)
    })
  }, [router])

  if (loading) {
    return (
      <div className="pt-[88px] min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading vessel data…</div>
      </div>
    )
  }

  if (!vessel || !vesselId) {
    return (
      <div className="pt-[88px] min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Vessel not found.</div>
      </div>
    )
  }

  return (
    <div className="pt-[88px] min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-gray-400 hover:text-navy transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-navy">Edit Vessel Info</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8">
          <VesselEditForm vessel={vessel} vesselId={vesselId} backHref="/dashboard" />
        </div>
      </div>
    </div>
  )
}
