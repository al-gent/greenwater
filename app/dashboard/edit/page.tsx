'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import VesselEditForm from '@/components/VesselEditForm'
import UpdateLocationModal from '@/components/UpdateLocationModal'
import type { Vessel } from '@/lib/vessel-utils'

function EditVesselPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedId = parseInt(searchParams.get('vessel') ?? '', 10)
  // Set by the claim flow: the user just claimed this vessel and landed here.
  const justClaimed = searchParams.get('welcome') === '1'
  const [vessel, setVessel] = useState<Vessel | null>(null)
  const [vesselId, setVesselId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [locationOpen, setLocationOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin?next=/dashboard/edit'); return }

      // Operator context comes from the API (single source of truth); admins
      // may edit any vessel — the update API enforces the same rule server-side.
      const me = await fetch('/api/operators/me').then((r) => r.json()).catch(() => null)
      const operated: number[] = Array.isArray(me?.vesselIds) ? me.vesselIds : []
      const isAdmin: boolean = !!me?.isAdmin

      let target: number | null = null
      if (!isNaN(requestedId)) {
        if (isAdmin || operated.includes(requestedId)) target = requestedId
      } else if (operated.length === 1) {
        // No param: unambiguous only when the user operates exactly one vessel
        target = operated[0]
      }

      if (!target) {
        router.push('/dashboard')
        return
      }

      setVesselId(target)
      const { data } = await supabase
        .from('vessels').select('*').eq('id', target).single()

      setVessel(data as Vessel)
      setLoading(false)
    })
  }, [router, requestedId])

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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <Link href="/dashboard" className="text-gray-400 hover:text-navy transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-navy">Edit Vessel Info</h1>
          <button
            type="button"
            onClick={() => setLocationOpen(true)}
            className="ml-auto flex items-center gap-1.5 border border-teal text-teal px-3 py-1.5 rounded-full text-sm font-medium hover:bg-teal-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Update Location
          </button>
        </div>

        {locationOpen && (
          <UpdateLocationModal
            vesselId={vesselId}
            vesselName={vessel.name}
            onClose={() => setLocationOpen(false)}
          />
        )}

        {justClaimed && (
          <div className="mb-4 bg-teal-50 border border-teal/30 rounded-2xl px-4 py-3.5 sm:px-5">
            <p className="text-sm font-semibold text-navy">
              {vessel.name} is yours to manage 🎉
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Your changes go live immediately. Our team will confirm your claim behind the
              scenes and reach out if we have any questions.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-card p-4 sm:p-8">
          <VesselEditForm vessel={vessel} vesselId={vesselId} backHref="/dashboard" />
        </div>
      </div>
    </div>
  )
}

export default function EditVesselPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-[88px] min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-400">Loading vessel data…</div>
        </div>
      }
    >
      <EditVesselPageInner />
    </Suspense>
  )
}
