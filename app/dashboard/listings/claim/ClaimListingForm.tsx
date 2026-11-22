'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ClaimVesselPicker, { type VesselOption } from '@/components/ClaimVesselPicker'

export default function ClaimListingForm({ vessels, selectedId }: { vessels: VesselOption[]; selectedId: number }) {
  const router = useRouter()
  const [vessel, setVessel] = useState(vessels.find(v => v.id === selectedId) ?? null)
  const [relationship, setRelationship] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!vessel || !relationship.trim()) {
      setError('Select your vessel and describe your relationship to it.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/vessel-claims', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vessel_id: vessel.id, vessel_name: vessel.name, message: relationship.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not submit your claim. Please try again.')
      if (data.instant) {
        router.push(`/dashboard/listings/edit?vessel=${vessel.id}&welcome=1`)
      } else {
        setSubmitted(true)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit your claim. Please try again.')
      setSaving(false)
    }
  }

  if (submitted) return (
    <section className="rounded-2xl bg-white p-6 shadow-card" role="status">
      <h2 className="text-xl font-semibold text-navy">Claim submitted</h2>
      <p className="mt-3 text-gray-600">Our team will review your claim for {vessel?.name}.</p>
    </section>
  )

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-card">
      <fieldset disabled={saving} className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Your vessel</p>
          <ClaimVesselPicker vessels={vessels} selected={vessel} onSelect={setVessel} />
          {vessel?.claimed && <p className="mt-2 text-sm text-gray-600">This vessel already has an operator. Our team will review your claim.</p>}
          <p className="mt-2 text-sm text-gray-500">Can’t find your vessel? <Link href="/dashboard/listings/new" className="text-teal hover:underline">List a new vessel</Link></p>
        </div>
        <label className="block text-sm font-medium text-gray-700">Your relationship to this vessel
          <textarea required rows={3} value={relationship} onChange={event => setRelationship(event.target.value)} placeholder="For example, I’m the captain and manage the vessel’s schedule." className="mt-2 block w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-base font-normal focus:outline-teal" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" className="rounded-full bg-navy px-6 py-2.5 text-sm font-semibold text-white hover:bg-navy-600 disabled:opacity-60" disabled={saving}>{saving ? 'Submitting…' : 'Submit claim'}</button>
      </fieldset>
    </form>
  )
}
