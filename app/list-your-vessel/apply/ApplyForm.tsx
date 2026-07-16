'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import PlaceAutocomplete from '@/components/PlaceAutocomplete'
import CollapsibleSection from '@/components/CollapsibleSection'
import { RATE_CURRENCIES } from '@/lib/vessel-utils'
import { makeThumbnail } from '@/lib/image-thumb'
import { createClient } from '@/lib/supabase-browser'

// Leaflet must not SSR
const VesselMap = dynamic(() => import('@/components/VesselMap'), {
  ssr: false,
  loading: () => <div className="h-[320px] rounded-xl bg-gray-100 animate-pulse" />,
})

interface ListForm {
  vesselName: string
  operatorName: string
  port_name: string
  port_city: string
  port_state: string
  country: string
  mmsi: string
  imo_number: string
  call_sign: string
  year_built: string
  year_refit: string
  length_m: string
  beam_m: string
  draft_m: string
  speed_cruise: string
  speed_max: string
  scientists: string
  crew: string
  endurance: string
  main_activity: string
  operating_area: string
  dpos: string
  ice_breaking: string
  url_ship: string
  vessel_of_opportunity: boolean
  daily_rate: string
  daily_rate_currency: string
}

const emptyForm: ListForm = {
  vesselName: '', operatorName: '', port_name: '', port_city: '', port_state: '',
  country: '', mmsi: '', imo_number: '', call_sign: '',
  year_built: '', year_refit: '', length_m: '', beam_m: '', draft_m: '',
  speed_cruise: '', speed_max: '', scientists: '', crew: '', endurance: '',
  main_activity: '', operating_area: '', dpos: '', ice_breaking: '', url_ship: '',
  vessel_of_opportunity: false, daily_rate: '', daily_rate_currency: 'USD',
}

type SectionKey = 'location' | 'identification' | 'physical' | 'performance' | 'operations'

const inputClass = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition'
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5'

interface Props {
  userEmail: string
}

export default function ApplyForm({ userEmail }: Props) {
  const [form, setForm] = useState<ListForm>(emptyForm)
  const [operatingAreaGeojson, setOperatingAreaGeojson] = useState<GeoJSON.FeatureCollection | null>(null)
  // Photos are staged in storage under submissions/<draftId>/ before the
  // submission row exists; approval copies the URLs onto the vessel.
  const [draftId] = useState(() => crypto.randomUUID())
  const [photos, setPhotos] = useState<string[]>([])
  const [photoCredits, setPhotoCredits] = useState<Record<string, string>>({}) // url → credit
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [homePortCoords, setHomePortCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    location: true,
    identification: false,
    physical: false,
    performance: false,
    operations: false,
  })

  const toggle = (key: SectionKey) => setOpen((s) => ({ ...s, [key]: !s[key] }))

  const MAX_PHOTOS = 12 // mirror of the server-side cap in /api/vessel-submissions

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setPhotoError(null)
    const remaining = MAX_PHOTOS - photos.length
    if (remaining <= 0) {
      setPhotoError(`Up to ${MAX_PHOTOS} photos per listing.`)
      e.target.value = ''
      return
    }
    if (files.length > remaining) {
      files = files.slice(0, remaining)
      setPhotoError(`Up to ${MAX_PHOTOS} photos per listing — added the first ${remaining}.`)
    }
    setUploading(true)
    const supabase = createClient()
    const newUrls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `submissions/${draftId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error } = await supabase.storage.from('vessel-photos').upload(path, file)
      if (error) {
        setPhotoError(`Upload failed: ${error.message}`)
        setUploading(false)
        return
      }
      // thumbnail for cards/maps — best-effort, never blocks the upload
      const thumb = await makeThumbnail(file)
      if (thumb) {
        await supabase.storage.from('vessel-photos').upload(`thumbs/${data.path}`, thumb, { contentType: 'image/jpeg' })
      }
      const { data: { publicUrl } } = supabase.storage.from('vessel-photos').getPublicUrl(data.path)
      newUrls.push(publicUrl)
    }
    setPhotos((p) => [...p, ...newUrls])
    setUploading(false)
    e.target.value = ''
  }

  const removeStagedPhoto = async (url: string) => {
    setPhotos((p) => p.filter((u) => u !== url))
    setPhotoCredits(({ [url]: _removed, ...rest }) => rest)
    // best-effort cleanup of the staged file + its thumb; the submission only stores URLs
    const path = url.split('/vessel-photos/')[1]
    if (path) await createClient().storage.from('vessel-photos').remove([path, `thumbs/${path}`])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    setError(null)

    if (uploading) {
      setValidationError('Photos are still uploading — one moment.')
      return
    }
    if (!form.operating_area.trim()) {
      setOpen((s) => ({ ...s, location: true }))
      setValidationError("Please add the vessel's operating area.")
      return
    }
    if (form.mmsi && !/^\d{9}$/.test(form.mmsi.trim())) {
      setOpen((s) => ({ ...s, identification: true }))
      setValidationError('MMSI must be exactly 9 digits.')
      return
    }
    if (form.imo_number && !/^(IMO\s?)?\d{7}$/.test(form.imo_number.trim())) {
      setOpen((s) => ({ ...s, identification: true }))
      setValidationError('IMO Number must be 7 digits (e.g. 1234567 or IMO 1234567).')
      return
    }

    setLoading(true)
    const res = await fetch('/api/vessel-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vessel_name: form.vesselName,
        operator_name: form.operatorName,
        port_name: form.port_name,
        homeport_latitude: homePortCoords?.lat ?? null,
        homeport_longitude: homePortCoords?.lon ?? null,
        port_city: form.port_city,
        port_state: form.port_state,
        country: form.country,
        mmsi: form.mmsi,
        imo_number: form.imo_number,
        call_sign: form.call_sign,
        year_built: form.year_built,
        year_refit: form.year_refit,
        length_m: form.length_m,
        beam_m: form.beam_m,
        draft_m: form.draft_m,
        speed_cruise: form.speed_cruise,
        speed_max: form.speed_max,
        scientists: form.scientists,
        crew: form.crew,
        endurance: form.endurance,
        main_activity: form.main_activity,
        operating_area: form.operating_area,
        operating_area_geojson: operatingAreaGeojson,
        dpos: form.dpos,
        ice_breaking: form.ice_breaking,
        url_ship: form.url_ship,
        vessel_of_opportunity: form.vessel_of_opportunity,
        daily_rate: form.daily_rate,
        daily_rate_currency: form.daily_rate_currency,
        photo_urls: photos,
        photo_details: photos
          .map((url) => ({ url, credit: (photoCredits[url] ?? '').trim() }))
          .filter((d) => d.credit),
      }),
    })

    setLoading(false)
    if (res.ok) {
      setSubmitted(true)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <div className="pt-[112px] bg-gray-50 min-h-screen pb-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="mb-6">
          <Link
            href="/list-your-vessel"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-navy mb-3">Apply to List Your Vessel</h1>
          <p className="text-gray-500">
            Tell us about your vessel. Our team will review your application and reach out within a day or two.
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-card p-6 sm:p-8">
          {submitted ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-20 h-20 bg-teal-50 rounded-full flex items-center justify-center mb-5">
                <svg className="w-10 h-10 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-navy mb-2">Application Submitted!</h3>
              <p className="text-gray-500 mb-6 max-w-sm">
                Thank you for your interest. Our team will review your application and contact you at <strong>{userEmail}</strong> soon!
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setSubmitted(false); setForm(emptyForm); setOperatingAreaGeojson(null); setHomePortCoords(null) }}
                  className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-full text-sm font-medium hover:border-gray-300 transition-colors"
                >
                  Submit another
                </button>
                <Link
                  href="/"
                  className="bg-navy text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-navy-600 transition-colors"
                >
                  Browse vessels
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">

              {/* Essentials */}
              <div>
                <h2 className="text-xs font-semibold text-navy uppercase tracking-widest mb-4">
                  The essentials
                </h2>
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className={labelClass}>
                        Vessel name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.vesselName}
                        onChange={(e) => setForm({ ...form, vesselName: e.target.value })}
                        placeholder="R/V Ocean Explorer"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Operator / Institution <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.operatorName}
                        onChange={(e) => setForm({ ...form, operatorName: e.target.value })}
                        placeholder="Woods Hole Oceanographic..."
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>
                      Research focus / Main activity <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={form.main_activity}
                      onChange={(e) => setForm({ ...form, main_activity: e.target.value })}
                      placeholder="Describe the vessel's research capabilities, scientific equipment, and typical mission types…"
                      className={`${inputClass} resize-none`}
                    />
                  </div>

                  {/* Vessel type toggle */}
                  <div>
                    <label className={labelClass}>Vessel type</label>
                    <div className="grid grid-cols-2 rounded-xl border border-gray-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, vessel_of_opportunity: false })}
                        className={`px-4 py-2.5 text-sm transition-colors ${!form.vessel_of_opportunity ? 'bg-teal text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                      >
                        Dedicated research vessel
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, vessel_of_opportunity: true })}
                        className={`px-4 py-2.5 text-sm transition-colors border-l border-gray-200 ${form.vessel_of_opportunity ? 'bg-teal text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                      >
                        Vessel of opportunity
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {form.vessel_of_opportunity
                        ? 'A pleasure craft, fishing, or working vessel that can also be used to perform research.'
                        : 'This is a research vessel — purpose-built or primarily used for scientific work.'}
                    </p>
                  </div>

                  {/* Photos */}
                  <div>
                    <label className={labelClass}>
                      Photos
                      <span className="ml-1 text-gray-400 font-normal">(optional)</span>
                    </label>
                    {photos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                        {photos.map((url) => (
                          <div key={url}>
                            <div className="relative group rounded-xl overflow-hidden aspect-video bg-gray-100">
                              <img src={url} alt="" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeStagedPhoto(url)}
                                className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label="Remove photo"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <input
                              type="text"
                              value={photoCredits[url] ?? ''}
                              onChange={(e) => setPhotoCredits((c) => ({ ...c, [url]: e.target.value }))}
                              placeholder="Photo credit (optional)"
                              className="mt-1.5 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-transparent"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {photoError && <p className="text-xs text-red-500 mb-2">{photoError}</p>}
                    <label className={`flex items-center gap-2 w-fit cursor-pointer px-4 py-2 rounded-xl border border-dashed border-gray-300 hover:border-teal text-sm text-gray-500 hover:text-teal transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      {uploading ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Uploading…
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Upload photos
                        </>
                      )}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                    </label>
                  </div>
                </div>
              </div>

              {/* Optional details */}
              <div className="pt-2 border-t border-gray-100">
                <div className="mb-4">
                  <h2 className="text-xs font-semibold text-navy uppercase tracking-widest mb-1">
                    Optional details
                  </h2>
                  <p className="text-xs text-gray-400">
                    Share what you can — admins use these to feature your vessel and match it to researchers.
                  </p>
                </div>

                <div className="space-y-3">

                  <CollapsibleSection
                    open={open.location}
                    onToggle={() => toggle('location')}
                    label="Location"
                    count={5}
                  >
                    <div>
                      <label className={labelClass}>
                        Home port
                        {homePortCoords && (
                          <span className="ml-2 text-xs text-teal font-normal">✓ location verified</span>
                        )}
                      </label>
                      <PlaceAutocomplete
                        value={form.port_name}
                        preferPorts
                        onChange={(v) => { setForm((f) => ({ ...f, port_name: v })); setHomePortCoords(null) }}
                        onSelect={(r) => {
                          setForm((f) => ({
                            ...f,
                            port_name: r.name,
                            port_city: r.city ?? f.port_city,
                            port_state: r.state ?? f.port_state,
                            country: r.country ?? f.country,
                          }))
                          setHomePortCoords({ lat: r.lat, lon: r.lon })
                        }}
                        placeholder="Start typing a port or harbour…"
                        className={inputClass}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>City</label>
                        <input
                          type="text"
                          value={form.port_city}
                          onChange={(e) => setForm({ ...form, port_city: e.target.value })}
                          placeholder="e.g. Falmouth"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          State / Province
                          <span className="ml-1 text-gray-400 font-normal">(if applicable)</span>
                        </label>
                        <input
                          type="text"
                          value={form.port_state}
                          onChange={(e) => setForm({ ...form, port_state: e.target.value })}
                          placeholder="e.g. MA"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Country / Flag State</label>
                      <input
                        type="text"
                        value={form.country}
                        onChange={(e) => setForm({ ...form, country: e.target.value })}
                        placeholder="USA"
                        className={inputClass}
                      />
                    </div>
                    <div className="pt-2 border-t border-gray-100">
                      <label className={labelClass}>
                        Operating area <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.operating_area}
                        onChange={(e) => setForm({ ...form, operating_area: e.target.value })}
                        placeholder="e.g. North Atlantic, Arctic, Global"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Draw operating area
                        <span className="ml-1 text-gray-400 font-normal">(optional)</span>
                      </label>
                      <VesselMap
                        editable
                        operatingArea={operatingAreaGeojson}
                        onAreaChange={setOperatingAreaGeojson}
                        homePort={homePortCoords ? { lat: homePortCoords.lat, lng: homePortCoords.lon } : null}
                        height={320}
                      />
                      <p className="mt-1.5 text-xs text-gray-400">
                        Use the toolbar (top-right) to sketch one or more areas the vessel works in. This powers location search.
                      </p>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection
                    open={open.identification}
                    onToggle={() => toggle('identification')}
                    label="Identification"
                    count={3}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>
                          MMSI <span className="text-gray-400 font-normal">(9 digits)</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={9}
                          value={form.mmsi}
                          onChange={(e) => setForm({ ...form, mmsi: e.target.value.replace(/\D/g, '') })}
                          placeholder="123456789"
                          className={`${inputClass} font-mono`}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          IMO Number <span className="text-gray-400 font-normal">(7 digits)</span>
                        </label>
                        <input
                          type="text"
                          value={form.imo_number}
                          onChange={(e) => setForm({ ...form, imo_number: e.target.value })}
                          placeholder="IMO 1234567"
                          className={`${inputClass} font-mono`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Call sign</label>
                      <input
                        type="text"
                        value={form.call_sign}
                        onChange={(e) => setForm({ ...form, call_sign: e.target.value })}
                        placeholder="KABO"
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <p className="text-xs text-gray-400">MMSI/IMO are used for automatic position tracking.</p>
                  </CollapsibleSection>

                  <CollapsibleSection
                    open={open.physical}
                    onToggle={() => toggle('physical')}
                    label="Physical specifications"
                    count={5}
                  >
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className={labelClass}>Length (m)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form.length_m}
                          onChange={(e) => setForm({ ...form, length_m: e.target.value })}
                          placeholder="85"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Beam (m)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form.beam_m}
                          onChange={(e) => setForm({ ...form, beam_m: e.target.value })}
                          placeholder="16"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Draft (m)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form.draft_m}
                          onChange={(e) => setForm({ ...form, draft_m: e.target.value })}
                          placeholder="5.5"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Year built</label>
                        <input
                          type="number"
                          min="1900"
                          value={form.year_built}
                          onChange={(e) => setForm({ ...form, year_built: e.target.value })}
                          placeholder="1998"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Year last refit</label>
                        <input
                          type="number"
                          min="1900"
                          value={form.year_refit}
                          onChange={(e) => setForm({ ...form, year_refit: e.target.value })}
                          placeholder="2019"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection
                    open={open.performance}
                    onToggle={() => toggle('performance')}
                    label="Performance & capacity"
                    count={5}
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Cruise speed (kn)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form.speed_cruise}
                          onChange={(e) => setForm({ ...form, speed_cruise: e.target.value })}
                          placeholder="12"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Max speed (kn)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form.speed_max}
                          onChange={(e) => setForm({ ...form, speed_max: e.target.value })}
                          placeholder="15"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Research bunks</label>
                        <input
                          type="number"
                          min="0"
                          value={form.scientists}
                          onChange={(e) => setForm({ ...form, scientists: e.target.value })}
                          placeholder="24"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Crew</label>
                        <input
                          type="number"
                          min="0"
                          value={form.crew}
                          onChange={(e) => setForm({ ...form, crew: e.target.value })}
                          placeholder="18"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Endurance</label>
                      <input
                        type="text"
                        value={form.endurance}
                        onChange={(e) => setForm({ ...form, endurance: e.target.value })}
                        placeholder="e.g. 30 days, 6000 nm"
                        className={inputClass}
                      />
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection
                    open={open.operations}
                    onToggle={() => toggle('operations')}
                    label="Operations & links"
                    count={5}
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>
                          Estimated daily rate
                          <span className="ml-1 text-gray-400 font-normal">(optional)</span>
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={form.daily_rate}
                          onChange={(e) => setForm({ ...form, daily_rate: e.target.value })}
                          placeholder="e.g. 2500"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Currency</label>
                        <select
                          value={form.daily_rate_currency}
                          onChange={(e) => setForm({ ...form, daily_rate_currency: e.target.value })}
                          className={inputClass}
                        >
                          {RATE_CURRENCIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>
                          Dynamic positioning
                          <span className="ml-1 text-gray-400 font-normal">(DP class)</span>
                        </label>
                        <input
                          type="text"
                          value={form.dpos}
                          onChange={(e) => setForm({ ...form, dpos: e.target.value })}
                          placeholder="e.g. DP2"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Ice class</label>
                        <input
                          type="text"
                          value={form.ice_breaking}
                          onChange={(e) => setForm({ ...form, ice_breaking: e.target.value })}
                          placeholder="e.g. 1A, PC6"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Official website</label>
                      <input
                        type="url"
                        value={form.url_ship}
                        onChange={(e) => setForm({ ...form, url_ship: e.target.value })}
                        placeholder="https://www.institution.edu/vessel"
                        className={inputClass}
                      />
                    </div>
                  </CollapsibleSection>

                </div>
              </div>

              {(validationError || error) && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
                  {validationError ?? error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full bg-navy text-white py-4 rounded-2xl font-semibold hover:bg-navy-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting…
                  </>
                ) : (
                  'Submit Application'
                )}
              </button>
              <p className="text-center text-xs text-gray-400">
                Listing is free. We don&apos;t sell or share your data.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
