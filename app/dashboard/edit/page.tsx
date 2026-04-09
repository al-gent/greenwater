'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

interface VesselEditForm {
  name: string
  port_city: string
  port_state: string
  operator_name: string
  affiliation: string
  url_ship: string
  main_activity: string
  scientists: string
  speed_cruise: string
  length: string
  operating_area: string
}

const emptyForm: VesselEditForm = {
  name: '',
  port_city: '',
  port_state: '',
  operator_name: '',
  affiliation: '',
  url_ship: '',
  main_activity: '',
  scientists: '',
  speed_cruise: '',
  length: '',
  operating_area: '',
}

export default function EditVesselPage() {
  const router = useRouter()
  const [form, setForm] = useState<VesselEditForm>(emptyForm)
  const [vesselId, setVesselId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/signin?next=/dashboard/edit'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, vessel_id')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'operator' || !profile.vessel_id) {
        router.push('/dashboard')
        return
      }

      setVesselId(profile.vessel_id)

      const { data: vessel } = await supabase
        .from('vessels')
        .select('name,port_city,port_state,operator_name,affiliation,url_ship,main_activity,scientists,speed_cruise,length,operating_area')
        .eq('id', profile.vessel_id)
        .single()

      if (vessel) {
        setForm({
          name: vessel.name ?? '',
          port_city: vessel.port_city ?? '',
          port_state: vessel.port_state ?? '',
          operator_name: vessel.operator_name ?? '',
          affiliation: vessel.affiliation ?? '',
          url_ship: vessel.url_ship ?? '',
          main_activity: vessel.main_activity ?? '',
          scientists: vessel.scientists != null ? String(vessel.scientists) : '',
          speed_cruise: vessel.speed_cruise != null ? String(vessel.speed_cruise) : '',
          length: vessel.length != null ? String(vessel.length) : '',
          operating_area: vessel.operating_area ?? '',
        })
      }
      setLoading(false)
    })
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vesselId) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const res = await fetch('/api/vessels/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vessel_id: vesselId,
        name: form.name.trim() || undefined,
        port_city: form.port_city.trim() || undefined,
        port_state: form.port_state.trim() || undefined,
        operator_name: form.operator_name.trim() || undefined,
        affiliation: form.affiliation.trim() || undefined,
        url_ship: form.url_ship.trim() || undefined,
        main_activity: form.main_activity.trim() || undefined,
        scientists: form.scientists ? parseInt(form.scientists, 10) : undefined,
        speed_cruise: form.speed_cruise ? parseFloat(form.speed_cruise) : undefined,
        length: form.length ? parseFloat(form.length) : undefined,
        operating_area: form.operating_area.trim() || undefined,
      }),
    })

    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Save failed. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="pt-16 min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading vessel data…</div>
      </div>
    )
  }

  const field = (label: string, key: keyof VesselEditForm, type = 'text', hint?: string) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
      />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )

  return (
    <div className="pt-16 min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-gray-400 hover:text-navy transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-navy">Edit Vessel Info</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}
            {saved && (
              <div className="bg-teal-50 border border-teal/20 text-teal text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Vessel info saved successfully.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {field('Vessel Name', 'name')}
              {field('Port City', 'port_city')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {field('State / Province', 'port_state')}
              {field('Operator Name', 'operator_name')}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {field('Affiliation / Institution', 'affiliation')}
            </div>

            {field('Official Website', 'url_ship', 'url', 'Full URL including https://')}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Research Activity / Description
              </label>
              <textarea
                rows={4}
                value={form.main_activity}
                onChange={(e) => setForm({ ...form, main_activity: e.target.value })}
                placeholder="Describe the vessel's research capabilities and typical activities…"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition resize-none"
              />
            </div>

            {field('Operating Area', 'operating_area')}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {field('Research Bunks', 'scientists', 'number')}
              {field('Cruise Speed (kn)', 'speed_cruise', 'number')}
              {field('Length (m)', 'length', 'number')}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-navy text-white py-3.5 rounded-2xl font-semibold hover:bg-navy-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </>
              ) : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
