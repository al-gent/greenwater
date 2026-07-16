'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Vessel, VesselDoc, PhotoDetail } from '@/lib/vessel-utils'
import { RATE_CURRENCIES } from '@/lib/vessel-utils'
import { makeThumbnail } from '@/lib/image-thumb'
import { createClient } from '@/lib/supabase-browser'
import PlaceAutocomplete from '@/components/PlaceAutocomplete'
import CollapsibleSection from '@/components/CollapsibleSection'

const editInputClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition'

// Leaflet must not SSR
const VesselMap = dynamic(() => import('@/components/VesselMap'), {
  ssr: false,
  loading: () => <div className="h-[320px] rounded-xl bg-gray-100 animate-pulse" />,
})

type EditableVessel = Omit<Vessel,
  'id' | 'vessel_id_gfw' | 'photo_urls' | 'doc_details' | 'last_updated' |
  'last_port_city' | 'last_port_state' | 'last_port_country' | 'last_port_lat' | 'last_port_lon' | 'last_port_date'
>

type FormState = Record<string, string>

const NUM_FIELDS = new Set([
  'scientists', 'length', 'beam', 'draft', 'speed_cruise', 'speed_max', 'range',
  'year_built', 'year_refit', 'crew', 'officers', 'gross_tons', 'power_hp',
  'engine_number', 'prop_diam', 'prop_maxrpm', 'aux_diesel_pwr',
  'area_wetlab', 'area_drylab', 'capacity_dry', 'capacity_fuel',
  'water_gen', 'water_capacity', 'air_cond', 'freeboard_deck', 'free_deck_area',
  'oc_winches', 'oc_steelwire_len', 'oc_steelwire_load', 'oc_condcable_len', 'oc_condcable_load',
  'oc_trawl_len', 'oc_trawl_load', 'oc_other_len', 'oc_other_load',
  'gantry_abovedeck', 'gantry_outboard_ext', 'gantry_load', 'daily_rate',
  'crane_abovedeck', 'crane_outboard_ext', 'crane_load',
])

// Never absorb these into text-field form state. Crucial for the nullable
// array/object columns: when NULL they'd slip past the array check below,
// become '' in the form, and formToPayload would then send them back as
// explicit null on Save — wiping e.g. a photo uploaded moments earlier.
const NON_FORM_FIELDS = new Set([
  'id', 'photo_urls', 'photo_details', 'doc_details', 'operating_area_geojson',
  'vessel_id_gfw', 'last_updated', 'created_at', 'vessel_of_opportunity',
])

function vesselToForm(vessel: Partial<EditableVessel>): FormState {
  const form: FormState = {}
  for (const [key, value] of Object.entries(vessel)) {
    if (NON_FORM_FIELDS.has(key)) continue
    // Skip arrays and objects — those are handled separately (e.g. photo_urls)
    if (Array.isArray(value) || (value !== null && typeof value === 'object')) continue
    form[key] = value != null ? String(value) : ''
  }
  return form
}

function formToPayload(form: FormState, vesselId: number): Record<string, unknown> {
  const payload: Record<string, unknown> = { vessel_id: vesselId }
  for (const [key, raw] of Object.entries(form)) {
    if (Array.isArray(raw) || (raw !== null && typeof raw === 'object')) continue
    const trimmed = raw.trim()
    if (trimmed === '') {
      payload[key] = null
    } else {
      payload[key] = NUM_FIELDS.has(key) ? Number(trimmed) : trimmed
    }
  }
  return payload
}

interface Props {
  vessel: Partial<EditableVessel> & { name: string; photo_urls?: string[] | null; photo_details?: PhotoDetail[] | null; doc_details?: VesselDoc[] | null }
  vesselId?: number
  backHref: string
  createMode?: boolean
  isAdmin?: boolean
}

export default function VesselEditForm({ vessel, vesselId, backHref, createMode, isAdmin }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() => vesselToForm(vessel))
  const [operatingAreaGeojson, setOperatingAreaGeojson] = useState<GeoJSON.FeatureCollection | null>(
    () => (vessel.operating_area_geojson as GeoJSON.FeatureCollection | null) ?? null,
  )
  const [photos, setPhotos] = useState<string[]>(() => vessel.photo_urls ?? [])
  const [photoDetails, setPhotoDetails] = useState<PhotoDetail[]>(() => vessel.photo_details ?? [])
  const [voo, setVoo] = useState<boolean>(vessel.vessel_of_opportunity === true)
  const [docs, setDocs] = useState<VesselDoc[]>(() => vessel.doc_details ?? [])
  const [docUrl, setDocUrl] = useState('')
  const [docLabel, setDocLabel] = useState('')
  const [docBusy, setDocBusy] = useState(false)
  const [uploadKind, setUploadKind] = useState<'photo' | 'doc'>('photo')
  const [docError, setDocError] = useState<string | null>(null)

  // createMode: no vessel id exists yet, so files are staged locally and
  // uploaded/attached right after the create call returns the new id.
  const [pendingPhotos, setPendingPhotos] = useState<{ file: File; preview: string; credit: string }[]>([])
  const [pendingDocs, setPendingDocs] = useState<{ file: File | null; url: string | null; label: string }[]>([])

  const removePendingPhoto = (i: number) =>
    setPendingPhotos((prev) => {
      URL.revokeObjectURL(prev[i].preview)
      return prev.filter((_, idx) => idx !== i)
    })

  // POST one doc (uploaded path or external url) to the attach API
  const attachDoc = async (
    body: Record<string, unknown>,
    vid: number,
  ): Promise<{ docs: VesselDoc[] | null; error: string | null }> => {
    await createClient().auth.getSession() // refresh token like the photo path
    const res = await fetch('/api/vessels/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_id: vid, ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return { docs: data.docs, error: null }
    return { docs: null, error: data.error ?? `Failed (${res.status}).` }
  }

  // Upload a PDF to storage, then attach it (server verifies the stored bytes)
  const uploadDocFile = async (
    file: File,
    label: string,
    vid: number,
  ): Promise<{ docs: VesselDoc[] | null; error: string | null }> => {
    const supabase = createClient()
    await supabase.auth.getSession()
    const safe = file.name.replace(/[^\p{L}\p{N}._-]/gu, '_').replace(/_{2,}/g, '_').slice(0, 80)
    const path = `${vid}/${Date.now()}-${safe.toLowerCase().endsWith('.pdf') ? safe : safe + '.pdf'}`
    const { error: upErr } = await supabase.storage.from('vessel-docs').upload(path, file, { contentType: 'application/pdf' })
    if (upErr) return { docs: null, error: `Upload failed: ${upErr.message}` }
    return attachDoc({ path, description: label || undefined }, vid)
  }

  const addDoc = async () => {
    if (!docUrl.trim() || docBusy) return
    if (createMode) {
      setPendingDocs((prev) => [...prev, { file: null, url: docUrl.trim(), label: docLabel.trim() }])
      setDocUrl('')
      setDocLabel('')
      return
    }
    setDocBusy(true)
    setDocError(null)
    await createClient().auth.getSession() // refresh token like the photo path
    const res = await fetch('/api/vessels/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_id: vesselId, url: docUrl.trim(), description: docLabel.trim() || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setDocs(data.docs)
      setDocUrl('')
      setDocLabel('')
    } else {
      setDocError(data.error ?? `Failed (${res.status}).`)
    }
    setDocBusy(false)
  }

  const uploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || docBusy) return
    setDocError(null)
    if (file.size > 25 * 1024 * 1024) {
      setDocError('PDFs up to 25 MB.')
      return
    }
    if (createMode) {
      setPendingDocs((prev) => [...prev, { file, url: null, label: docLabel.trim() }])
      setDocLabel('')
      return
    }
    setDocBusy(true)
    const { docs: newDocs, error: attachErr } = await uploadDocFile(file, docLabel.trim(), vesselId!)
    if (newDocs) {
      setDocs(newDocs)
      setDocLabel('')
    } else {
      setDocError(attachErr)
    }
    setDocBusy(false)
  }

  const removeDoc = async (url: string) => {
    setDocError(null)
    await createClient().auth.getSession()
    const res = await fetch('/api/vessels/docs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_id: vesselId, url }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setDocs(data.docs)
    else setDocError(data.error ?? `Failed to remove (${res.status}).`)
  }
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [homeVerified, setHomeVerified] = useState(false)
  // true once the user edits a home-port text field by hand → tells the server to geocode on save
  const [locationTextEdited, setLocationTextEdited] = useState(false)

  type SectionKey =
    | 'photos' | 'docs' | 'identity' | 'location' | 'operatingArea' | 'operator'
    | 'research' | 'physical' | 'propulsion' | 'facilities' | 'science'
    | 'acoustics' | 'nav' | 'notes'
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    photos: true, docs: false, identity: true, location: true, operatingArea: true, operator: false,
    research: false, physical: false, propulsion: false, facilities: false, science: false,
    acoustics: false, nav: false, notes: false,
  })
  const toggle = (k: SectionKey) => setOpen((s) => ({ ...s, [k]: !s[k] }))

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  // Editing a location text field by hand clears the verified coords so the server re-geocodes on save.
  const setLoc = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value, primary_latitude: '', primary_longitude: '' }))
    setHomeVerified(false)
    setLocationTextEdited(true)
  }

  // Save photo_urls via the update route. Refreshing the session first matters:
  // on a long-open form the access token in the cookie expires, the PATCH 401s,
  // and (before this was added) the failure was silent — photos uploaded to
  // storage but never landed in the DB. getSession() auto-refreshes an expired
  // token and rewrites the auth cookies the route reads.
  const savePhotoUrls = async (urls: string[], details: PhotoDetail[], vid: number): Promise<string | null> => {
    await createClient().auth.getSession()
    // Keep credits consistent with the photo list: drop empties and entries
    // for URLs no longer present (e.g. after a photo is removed).
    const cleaned = details
      .map((d) => ({ url: d.url, credit: d.credit.trim() }))
      .filter((d) => d.credit && urls.includes(d.url))
    const res = await fetch('/api/vessels/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_id: vid, photo_urls: urls, photo_details: cleaned.length ? cleaned : null }),
    })
    if (res.ok) return null
    const data = await res.json().catch(() => ({}))
    return data.error ?? `Save failed (${res.status}). Please try again.`
  }

  // Update a photo's credit in local state; persisted on blur via saveCredits
  const [creditsDirty, setCreditsDirty] = useState(false)
  const setCredit = (url: string, credit: string) => {
    setCreditsDirty(true)
    setPhotoDetails((prev) => {
      const rest = prev.filter((d) => d.url !== url)
      return credit ? [...rest, { url, credit }] : rest
    })
  }

  const saveCredits = async () => {
    if (createMode || !creditsDirty) return
    setCreditsDirty(false)
    const saveError = await savePhotoUrls(photos, photoDetails, vesselId!)
    if (saveError) setUploadError(saveError)
  }

  // Upload photo files (+ best-effort thumbnails) to storage; returns public URLs
  const uploadPhotoFiles = async (files: File[], vid: number): Promise<{ urls: string[]; error: string | null }> => {
    const supabase = createClient()
    const newUrls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${vid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error } = await supabase.storage.from('vessel-photos').upload(path, file)
      if (error) return { urls: newUrls, error: `Upload failed: ${error.message}` }
      // thumbnail for cards/maps — best-effort, never blocks the upload
      const thumb = await makeThumbnail(file)
      if (thumb) {
        await supabase.storage.from('vessel-photos').upload(`thumbs/${data.path}`, thumb, { contentType: 'image/jpeg' })
      }
      const { data: { publicUrl } } = supabase.storage.from('vessel-photos').getPublicUrl(data.path)
      newUrls.push(publicUrl)
    }
    return { urls: newUrls, error: null }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if (createMode) {
      setPendingPhotos((prev) => [...prev, ...files.map((file) => ({ file, preview: URL.createObjectURL(file), credit: '' }))])
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setUploading(true)
    setUploadError(null)
    const { urls: newUrls, error: upErr } = await uploadPhotoFiles(files, vesselId!)
    if (upErr) {
      setUploadError(upErr)
      setUploading(false)
      return
    }
    const updated = [...photos, ...newUrls]
    const saveError = await savePhotoUrls(updated, photoDetails, vesselId!)
    if (saveError) {
      setUploadError(saveError)
    } else {
      setPhotos(updated)
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePhoto = async (url: string) => {
    const prev = photos
    const prevDetails = photoDetails
    const updated = photos.filter((p) => p !== url)
    const updatedDetails = photoDetails.filter((d) => d.url !== url)
    setPhotos(updated) // optimistic — rolled back on failure
    setPhotoDetails(updatedDetails)
    setUploadError(null)
    const saveError = await savePhotoUrls(updated, updatedDetails, vesselId!)
    if (saveError) {
      setPhotos(prev)
      setPhotoDetails(prevDetails)
      setUploadError(saveError)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (createMode) {
      const payload: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(form)) {
        const trimmed = raw.trim()
        if (trimmed !== '') payload[key] = NUM_FIELDS.has(key) ? Number(trimmed) : trimmed
      }
      payload.operating_area_geojson = operatingAreaGeojson
      payload.vessel_of_opportunity = voo
      const res = await fetch('/api/vessels/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setSaving(false)
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Create failed. Please try again.')
        return
      }
      const { id } = await res.json()

      // Attach staged photos/docs now that the vessel id exists. The vessel is
      // already created, so failures here don't block the redirect — anything
      // that didn't attach can be retried on the edit page we land on.
      let attachError: string | null = null
      if (pendingPhotos.length) {
        const { urls, error: upErr } = await uploadPhotoFiles(pendingPhotos.map((p) => p.file), id)
        if (urls.length) {
          // uploadPhotoFiles returns URLs in input order, so index i maps back
          // to pendingPhotos[i] and its staged credit
          const details = urls.map((url, i) => ({ url, credit: pendingPhotos[i]?.credit ?? '' }))
          attachError = await savePhotoUrls(urls, details, id)
        }
        if (upErr) attachError = upErr
      }
      for (const d of pendingDocs) {
        const { error: docErr } = d.file
          ? await uploadDocFile(d.file, d.label, id)
          : await attachDoc({ url: d.url, description: d.label || undefined }, id)
        if (docErr) attachError = docErr
      }
      if (attachError) console.error('post-create attach:', attachError)

      setSaving(false)
      setSaved(true)
      setTimeout(() => router.push(`/admin/vessels/${id}/edit`), 1500)
      return
    }

    await createClient().auth.getSession() // refresh expired token before saving
    const res = await fetch('/api/vessels/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formToPayload(form, vesselId!),
        operating_area_geojson: operatingAreaGeojson,
        vessel_of_opportunity: voo,
        // explicit null so clearing the rate actually clears it
        daily_rate: form.daily_rate?.trim() ? Number(form.daily_rate) : null,
        _geocode: locationTextEdited,
      }),
    })

    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => router.push(backHref), 1500)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Save failed. Please try again.')
    }
  }

  const f = (label: string, key: string, type = 'text', hint?: string) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={form[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
      />
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )

  const ta = (label: string, key: string, rows = 3) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <textarea
        rows={rows}
        value={form[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition resize-none"
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}
      {saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-teal flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-navy font-semibold text-lg">Saved!</p>
            <p className="text-sm text-gray-400">{createMode ? 'Redirecting to edit page…' : 'Redirecting to vessel page…'}</p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <label className="text-sm font-medium text-gray-700">Status</label>
          <select
            value={form.status || 'active'}
            onChange={(e) => set('status', e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="retired">Retired</option>
          </select>
          <span className="text-xs text-gray-400">Inactive / retired vessels are hidden from the public site.</span>
        </div>
      )}

      <CollapsibleSection
        open={open.photos}
        onToggle={() => toggle('photos')}
        label="Photos & Documents"
        count={createMode ? pendingPhotos.length + pendingDocs.length : photos.length + docs.length}
      >
          <div className="space-y-4">
            {createMode && (
              <p className="text-xs text-gray-400">
                Files are staged here and uploaded when you press Create Vessel.
              </p>
            )}
            {(createMode ? pendingPhotos.length : photos.length) > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {createMode
                  ? pendingPhotos.map((p, i) => (
                      <div key={p.preview}>
                        <div className="relative group rounded-xl overflow-hidden aspect-video bg-gray-100">
                          <img src={p.preview} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePendingPhoto(i)}
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
                          value={p.credit}
                          onChange={(e) => setPendingPhotos((prev) => prev.map((pp, idx) => idx === i ? { ...pp, credit: e.target.value } : pp))}
                          placeholder="Photo credit (optional)"
                          className="mt-1.5 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-transparent"
                        />
                      </div>
                    ))
                  : photos.map((url) => (
                      <div key={url}>
                        <div className="relative group rounded-xl overflow-hidden aspect-video bg-gray-100">
                          <img src={url} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(url)}
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
                          value={photoDetails.find((d) => d.url === url)?.credit ?? ''}
                          onChange={(e) => setCredit(url, e.target.value)}
                          onBlur={saveCredits}
                          placeholder="Photo credit (optional)"
                          className="mt-1.5 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-transparent"
                        />
                      </div>
                    ))}
              </div>
            )}
            {createMode && pendingDocs.length > 0 && (
              <div className="space-y-2">
                {pendingDocs.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy truncate">
                        {d.label || d.file?.name || d.url}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {d.file ? `${d.file.name} · ${Math.round(d.file.size / 1024)} KB` : d.url}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingDocs((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                      aria-label="Remove document"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!createMode && docs.length > 0 && (
              <div className="space-y-2">
                {docs.map((d) => (
                  <div key={d.url} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100">
                    <div className="min-w-0 flex-1">
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-teal hover:underline truncate block">
                        {d.description || d.name}
                      </a>
                      <p className="text-xs text-gray-400 truncate">
                        {d.name}{d.contentLength ? ` · ${Math.round(d.contentLength / 1024)} KB` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDoc(d.url)}
                      className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                      aria-label="Remove document"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(uploadError || docError) && <p className="text-xs text-red-500">{uploadError || docError}</p>}

            {/* one upload control; the toggle decides photo vs document handling */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
                <button
                  type="button"
                  onClick={() => setUploadKind('photo')}
                  className={`px-3 py-2 text-sm transition-colors ${uploadKind === 'photo' ? 'bg-teal text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Photo
                </button>
                <button
                  type="button"
                  onClick={() => setUploadKind('doc')}
                  className={`px-3 py-2 text-sm transition-colors border-l border-gray-200 ${uploadKind === 'doc' ? 'bg-teal text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  Document (PDF)
                </button>
              </div>
              {uploadKind === 'doc' && (
                <input
                  type="text"
                  value={docLabel}
                  onChange={(e) => setDocLabel(e.target.value)}
                  placeholder="Label (optional, e.g. Spec sheet)"
                  className={`${editInputClass} sm:w-52`}
                />
              )}
              <label className={`flex items-center justify-center gap-2 cursor-pointer px-4 py-2 rounded-lg border border-dashed border-gray-300 hover:border-teal text-sm text-gray-500 hover:text-teal transition-colors whitespace-nowrap ${(uploading || docBusy) ? 'opacity-50 pointer-events-none' : ''}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {(uploading || docBusy) ? 'Working…' : uploadKind === 'photo' ? 'Upload photos' : 'Upload PDF'}
                {uploadKind === 'photo' ? (
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                ) : (
                  <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={uploadDoc} />
                )}
              </label>
            </div>
            {uploadKind === 'doc' && (
              /* or paste a link — the server fetches and stores our own copy
                 (some sites block automated downloads; upload wins then) */
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                  placeholder="…or paste a link to a PDF"
                  className={`${editInputClass} flex-1`}
                />
                <button
                  type="button"
                  onClick={addDoc}
                  disabled={docBusy || !docUrl.trim()}
                  className="bg-navy text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-navy-600 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {docBusy ? 'Fetching…' : 'Add from link'}
                </button>
              </div>
            )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.identity} onToggle={() => toggle('identity')} label="Identity & Classification" count={7}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {f('Vessel Name', 'name')}
          {f('Call Sign', 'call_sign')}
          {f('MMSI', 'mmsi')}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {f('IMO Number', 'imo_number')}
          {f('Vessel Class', 'vessel_class')}
          {f('Hull Material', 'hull_material')}
        </div>
        {f('Construction Notes', 'vessel_construct')}
      </CollapsibleSection>

      <CollapsibleSection open={open.location} onToggle={() => toggle('location')} label="Home Port Location" count={4}>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Port Name
            {(homeVerified || (form.primary_latitude && form.primary_longitude)) && (
              <span className="ml-2 text-teal">✓ coordinates set</span>
            )}
          </label>
          <PlaceAutocomplete
            value={form.port_name ?? ''}
            preferPorts
            onChange={(v) => set('port_name', v)}
            onSelect={(r) => {
              setForm((prev) => ({
                ...prev,
                port_name: r.name,
                port_city: r.city ?? prev.port_city,
                port_state: r.state ?? prev.port_state,
                country: r.country ?? prev.country,
                primary_latitude: String(r.lat),
                primary_longitude: String(r.lon),
              }))
              setHomeVerified(true)
              setLocationTextEdited(false)
            }}
            placeholder="Start typing a port or harbour…"
            className={editInputClass}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
            <input value={form.port_city ?? ''} onChange={(e) => setLoc('port_city', e.target.value)} className={editInputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">State / Province</label>
            <input value={form.port_state ?? ''} onChange={(e) => setLoc('port_state', e.target.value)} className={editInputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
            <input value={form.country ?? ''} onChange={(e) => setLoc('country', e.target.value)} className={editInputClass} />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.operatingArea} onToggle={() => toggle('operatingArea')} label="Operating Area" count={4}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {f('Operating Area', 'operating_area')}
          {f('Endurance (days)', 'endurance')}
          {f('Dynamic Positioning (DPos)', 'dpos')}
        </div>
        {f('Ice Breaking', 'ice_breaking')}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Operating Area Map</label>
          <VesselMap
            editable
            operatingArea={operatingAreaGeojson}
            onAreaChange={setOperatingAreaGeojson}
            homePort={
              form.primary_latitude && form.primary_longitude &&
              !isNaN(Number(form.primary_latitude)) && !isNaN(Number(form.primary_longitude))
                ? { lat: Number(form.primary_latitude), lng: Number(form.primary_longitude) }
                : null
            }
            height={320}
          />
          <p className="text-xs text-gray-400 mt-0.5">Draw or edit the area(s) this vessel operates in. The teal dot is the home port.</p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.research} onToggle={() => toggle('research')} label="Research" count={4}>
        {ta('Research Activity / Description', 'main_activity', 4)}
        {f('Research Bunks', 'scientists', 'number')}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Vessel type</label>
          <div className="grid grid-cols-2 rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setVoo(false)}
              className={`px-3 py-2 text-sm transition-colors ${!voo ? 'bg-teal text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              Dedicated research vessel
            </button>
            <button
              type="button"
              onClick={() => setVoo(true)}
              className={`px-3 py-2 text-sm transition-colors border-l border-gray-200 ${voo ? 'bg-teal text-white font-medium' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              Vessel of opportunity
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {voo
              ? 'A pleasure craft, fishing, or working vessel that can also be used to perform research.'
              : 'This is a research vessel — purpose-built or primarily used for scientific work.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {f('Estimated Daily Rate', 'daily_rate', 'number')}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
            <select
              value={form.daily_rate_currency || 'USD'}
              onChange={(e) => set('daily_rate_currency', e.target.value)}
              className={editInputClass}
            >
              {RATE_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.operator} onToggle={() => toggle('operator')} label="Operator & Contact" count={8}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {f('Operator Name', 'operator_name')}
          {f('Affiliation / Institution', 'affiliation')}
        </div>
        {f('Owner', 'owner')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {f('Vessel Website', 'url_ship', 'url')}
          {f('Operator Website', 'url_operator', 'url')}
        </div>
        {f('Schedule URL', 'url_schedule', 'url')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {f('Contact Email', 'contact_email', 'email')}
          {f('Phone', 'phone')}
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.physical} onToggle={() => toggle('physical')} label="Physical Specifications" count={11}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {f('Length (m)', 'length', 'number')}
          {f('Beam (m)', 'beam', 'number')}
          {f('Draft (m)', 'draft', 'number')}
          {f('Gross Tons', 'gross_tons', 'number')}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {f('Cruise Speed (kn)', 'speed_cruise', 'number')}
          {f('Max Speed (kn)', 'speed_max', 'number')}
          {f('Range (nm)', 'range', 'number')}
          {f('Year Built', 'year_built', 'number')}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {f('Year Refit', 'year_refit', 'number')}
          {f('Crew', 'crew', 'number')}
          {f('Officers', 'officers', 'number')}
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.propulsion} onToggle={() => toggle('propulsion')} label="Propulsion" count={3}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {f('Engine Count', 'engine_number', 'number')}
          {f('Engine Make', 'engine_make')}
          {f('Engine Power', 'engine_power')}
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.facilities} onToggle={() => toggle('facilities')} label="Facilities" count={6}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {f('Wet Lab (m²)', 'area_wetlab', 'number')}
          {f('Dry Lab (m²)', 'area_drylab', 'number')}
          {f('Free Deck (m²)', 'free_deck_area', 'number')}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {f('Dry Storage (L)', 'capacity_dry', 'number')}
          {f('Fuel Capacity (L)', 'capacity_fuel', 'number')}
          {f('Water Capacity (L)', 'water_capacity', 'number')}
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.science} onToggle={() => toggle('science')} label="Science Equipment" count={9}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {f('CTD Capability', 'ctd_cap')}
          {f('Multibeam', 'aquis_multibeam')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {f('Sidescan Sonar', 'aquis_sidescan')}
          {f('ADCP', 'aquis_adcp')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {f('ROV', 'underwater_vehicles_rov')}
          {f('AUV', 'underwater_vehicles_auv')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {f('Diving Capability', 'diving_cap')}
          {f('Coring Capability', 'core_capable')}
          {f('Radioactive Materials', 'radioactive')}
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.acoustics} onToggle={() => toggle('acoustics')} label="Acoustics" count={3}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {f('Echo Sounder', 'acoustic_echosound')}
          {f('Sonar', 'acoustic_sonar')}
          {f('Acoustic Silent', 'acoustic_silent')}
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.nav} onToggle={() => toggle('nav')} label="Navigation & Communications" count={4}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {f('Nav Equipment', 'nav_equipment')}
          {f('Communications', 'nav_communications')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {f('Satcomm', 'nav_satcomm')}
          {f('GPS', 'nav_gps')}
        </div>
      </CollapsibleSection>

      <CollapsibleSection open={open.notes} onToggle={() => toggle('notes')} label="Notes" count={2}>
        {ta('Notes', 'notes', 3)}
        {ta('Amenities', 'amenities', 2)}
      </CollapsibleSection>

      <div className="pt-4">
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
          ) : createMode ? 'Create Vessel' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
