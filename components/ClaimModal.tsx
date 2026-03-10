'use client'

import { useState, useEffect } from 'react'

interface ClaimModalProps {
  vesselId: number
  vesselName: string
  userEmail: string
  onClose: () => void
}

export default function ClaimModal({ vesselId, vesselName, userEmail, onClose }: ClaimModalProps) {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    claimant_name: '',
    email: userEmail,
    role: '',
    organization: '',
    message: '',
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/vessel-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, vessel_id: vesselId, vessel_name: vesselName }),
    })

    setLoading(false)
    if (res.ok) {
      setSubmitted(true)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Submission failed. Please try again.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-modal overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-navy">Claim This Vessel</h2>
            <p className="text-sm text-gray-500 mt-0.5">{vesselName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {submitted ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-navy mb-2">Claim Submitted</h3>
            <p className="text-gray-500 mb-2 max-w-sm">
              We&apos;ll review your relationship to <strong>{vesselName}</strong> and follow up at{' '}
              <strong>{form.email}</strong>.
            </p>
            <p className="text-sm text-gray-400 mb-6">Most reviews take 3–5 business days.</p>
            <button
              onClick={onClose}
              className="bg-navy text-white px-6 py-3 rounded-full font-medium hover:bg-navy-600 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            {/* Trust note */}
            <div className="mx-6 mt-5 bg-lightblue-100 rounded-xl px-4 py-3 flex gap-2.5 text-sm text-navy">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="opacity-80">
                Your claim will be reviewed by the Greenwater Foundation team. We verify operator relationships before granting access.
              </span>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Your Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.claimant_name}
                    onChange={(e) => setForm({ ...form, claimant_name: e.target.value })}
                    placeholder="Capt. Jane Smith"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Contact Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@institution.org"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Your Role / Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    placeholder="Fleet Manager, Captain…"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Organization <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.organization}
                    onChange={(e) => setForm({ ...form, organization: e.target.value })}
                    placeholder="WHOI, CSIRO, NOAA…"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Supporting Information <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Describe your relationship to this vessel and why you are the authorized operator or representative…"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition resize-none"
                />
              </div>
            </div>

            <div className="px-6 pb-6 flex-shrink-0">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-navy text-white py-3.5 rounded-full font-semibold hover:bg-navy-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting…
                  </>
                ) : 'Submit Claim'}
              </button>
              <p className="text-center text-xs text-gray-400 mt-3">
                By submitting you agree to our{' '}
                <a href="#" className="underline">Terms of Service</a>.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
