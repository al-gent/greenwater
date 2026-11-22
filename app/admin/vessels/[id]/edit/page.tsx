'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import VesselEditForm from '@/components/VesselEditForm'
import type { Vessel } from '@/lib/vessel-utils'

export default function AdminEditVesselPage() {
  const router = useRouter()
  const params = useParams()
  const vesselId = parseInt(params.id as string, 10)

  const [vessel, setVessel] = useState<Vessel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin?next=/admin'); return }

      const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()

      if (profile?.is_admin !== true) { router.push('/'); return }

      const { data } = await supabase
        .from('vessels').select('*').eq('id', vesselId).single()

      setVessel(data as Vessel)
      setLoading(false)
    })
  }, [router, vesselId])

  if (loading) {
    return (
      <div className="pt-16 min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading vessel data…</div>
      </div>
    )
  }

  if (!vessel) {
    return (
      <div className="pt-16 min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Vessel not found.</div>
      </div>
    )
  }

  return (
    <div className="pt-16 min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-bold text-navy">Edit Vessel</h1>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          {vessel.name} ·{' '}
          <Link href={`/vessels/${vesselId}`} target="_blank" className="text-teal hover:underline">
            view listing
          </Link>
        </p>

        <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8">
          <VesselEditForm vessel={vessel} vesselId={vesselId} backHref={`/vessels/${vesselId}`} isAdmin />
        </div>
      </div>
    </div>
  )
}
