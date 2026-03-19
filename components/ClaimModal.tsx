'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'

interface Profile {
  first_name: string | null
  last_name: string | null
  institution: string | null
  title: string | null
  email: string | null
}

interface ClaimModalProps {
  vesselId: number
  vesselName: string
  profile: Profile | null
  onClose: () => void
}

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp'
const MAX_MB = 10

export default function ClaimModal({ vesselId, vesselName, profile, onClose }: ClaimModalProps) {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [relationship, setRelationship] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [docUrl, setDocUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_MB} MB.`)
      e.target.value = ''
      return
    }
    setError(null)
    setFile(f)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!relationship.trim()) {
      setError('Please describe your relationship to this vessel.')
      return
    }
    setLoading(true)
    setError(null)

    let uploadedUrl = docUrl.trim() || null

    // Upload file to Supabase Storage if provided
    if (file) {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `claims/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data: upload, error: uploadError } = await supabase.storage
        .from('claim-documents')
        .upload(path, file)

      if (uploadError) {
        setError('File upload failed. Try linking a document URL instead.')
        setLoading(false)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('claim-documents')
        .getPublicUrl(upload.path)
      uploadedUrl = publicUrl
    }

    const res = await fetch('/api/vessel-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vessel_id: vesselId,
        vessel_name: vesselName,
        message: relationship.trim(),
        document_url: uploadedUrl,
      }),
    })

    setLoading(false)
    if (res.ok) {
      setSubmitted(true)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Submission failed. Please try again.')
    }
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')

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
              We&apos;ll review your claim for <strong>{vesselName}</strong> and follow up at{' '}
              <strong>{profile?.email}</strong>.
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
            {/* Claiming as banner */}
            <div className="mx-6 mt-5 bg-lightblue-100 rounded-xl px-4 py-3 text-sm text-navy">
              <p className="font-medium">Claiming as</p>
              <p className="text-gray-600 mt-0.5">
                {displayName || profile?.email}
                {profile?.institution ? ` · ${profile.institution}` : ''}
                {profile?.title ? ` · ${profile.title}` : ''}
              </p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              {/* Relationship */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Your relationship to this vessel <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  placeholder="e.g. I am the Chief Scientist and have operated this vessel since 2019 under the University of Washington's research fleet…"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition resize-none"
                />
              </div>

              {/* Document upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supporting documentation <span className="text-gray-400 font-normal">(optional but recommended)</span>
                </label>
                <p className="text-xs text-gray-400 mb-2.5">
                  Upload a registration certificate, crew manifest, employment letter, or port authority document. PDF or image, max 10 MB.
                </p>

                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors ${
                    file ? 'border-teal bg-teal-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-teal font-medium">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {file.name}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                        className="ml-1 text-gray-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">
                      <svg className="w-6 h-6 mx-auto mb-1.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Click to upload a file
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleFile} />
                </div>

                {!file && (
                  <div className="mt-3">
                    <label className="block text-xs text-gray-400 mb-1">Or paste a link to your document</label>
                    <input
                      type="url"
                      value={docUrl}
                      onChange={(e) => setDocUrl(e.target.value)}
                      placeholder="https://drive.google.com/…"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                    />
                  </div>
                )}
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
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
