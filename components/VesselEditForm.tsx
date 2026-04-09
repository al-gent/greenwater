'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Vessel } from '@/lib/vessel-utils'
import { createClient } from '@/lib/supabase-browser'

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
  'gantry_abovedeck', 'gantry_outboard_ext', 'gantry_load',
  'crane_abovedeck', 'crane_outboard_ext', 'crane_load',
])

function vesselToForm(vessel: Partial<EditableVessel>): FormState {
  const form: FormState = {}
  for (const [key, value] of Object.entries(vessel)) {
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
  vessel: Partial<EditableVessel> & { name: string; photo_urls?: string[] | null }
  vesselId?: number
  backHref: string
  createMode?: boolean
}

export default function VesselEditForm({ vessel, vesselId, backHref, createMode }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() => vesselToForm(vessel))
  const [photos, setPhotos] = useState<string[]>(() => vessel.photo_urls ?? [])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    setUploadError(null)
    const supabase = createClient()
    const newUrls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${vesselId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error } = await supabase.storage.from('vessel-photos').upload(path, file)
      if (error) {
        setUploadError(`Upload failed: ${error.message}`)
        setUploading(false)
        return
      }
      const { data: { publicUrl } } = supabase.storage.from('vessel-photos').getPublicUrl(data.path)
      newUrls.push(publicUrl)
    }
    const updated = [...photos, ...newUrls]
    setPhotos(updated)
    await fetch('/api/vessels/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_id: vesselId, photo_urls: updated }),
    })
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePhoto = async (url: string) => {
    const updated = photos.filter((p) => p !== url)
    setPhotos(updated)
    await fetch('/api/vessels/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_id: vesselId, photo_urls: updated }),
    })
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
      const res = await fetch('/api/vessels/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSaving(false)
      if (res.ok) {
        const { id } = await res.json()
        setSaved(true)
        setTimeout(() => router.push(`/admin/vessels/${id}/edit`), 1500)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Create failed. Please try again.')
      }
      return
    }

    const res = await fetch('/api/vessels/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formToPayload(form, vesselId!)),
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

  const sec = (title: string) => (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-4 pb-1 border-b border-gray-100">
      {title}
    </p>
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

      {!createMode && sec('Photos')}
      {!createMode && <div className="space-y-3">
        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((url) => (
              <div key={url} className="relative group rounded-xl overflow-hidden aspect-video bg-gray-100">
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
            ))}
          </div>
        )}
        {uploadError && (
          <p className="text-xs text-red-500">{uploadError}</p>
        )}
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </label>
      </div>}

      {sec('Identity')}
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

      {sec('Home Port Location')}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {f('City', 'port_city')}
        {f('State / Province', 'port_state')}
        {f('Country', 'country')}
      </div>
      {sec('Operator')}
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

      {sec('Research')}
      {ta('Research Activity / Description', 'main_activity', 4)}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {f('Operating Area', 'operating_area')}
        {f('Research Bunks', 'scientists', 'number')}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {f('Endurance (days)', 'endurance')}
        {f('Dynamic Positioning (DPos)', 'dpos')}
        {f('Ice Breaking', 'ice_breaking')}
      </div>

      {sec('Physical Specifications')}
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

      {sec('Propulsion')}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {f('Engine Count', 'engine_number', 'number')}
        {f('Engine Make', 'engine_make')}
        {f('Engine Power', 'engine_power')}
      </div>

      {sec('Facilities')}
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

      {sec('Science Equipment')}
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

      {sec('Acoustics')}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {f('Echo Sounder', 'acoustic_echosound')}
        {f('Sonar', 'acoustic_sonar')}
        {f('Acoustic Silent', 'acoustic_silent')}
      </div>

      {sec('Navigation & Communications')}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {f('Nav Equipment', 'nav_equipment')}
        {f('Communications', 'nav_communications')}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {f('Satcomm', 'nav_satcomm')}
        {f('GPS', 'nav_gps')}
      </div>

      {sec('Notes')}
      {ta('Notes', 'notes', 3)}
      {ta('Amenities', 'amenities', 2)}

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
