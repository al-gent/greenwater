'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import PlaceAutocomplete from './PlaceAutocomplete'

const PositionMap = dynamic(() => import('./PositionMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 animate-pulse" />,
})

interface UpdateLocationModalProps {
  vesselId: number
  vesselName: string
  current?: { label: string; lat: number | null; lon: number | null }
  onClose: () => void
}

/** Search a port (Photon autocomplete — the operator picks the right match,
 *  same as the homepage location search) or click the map to drop a pin. */
export default function UpdateLocationModal({ vesselId, vesselName, current, onClose }: UpdateLocationModalProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<{ label: string; lat: number; lon: number } | null>(null)
  const [pinMode, setPinMode] = useState(false)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lat = picked?.lat ?? current?.lat ?? null
  const lon = picked?.lon ?? current?.lon ?? null

  // Fires on an armed map click OR a drag of the placed pin.
  const dropPin = (plat: number, plon: number) => {
    setPicked({
      label: query.trim() || `${plat.toFixed(3)}, ${plon.toFixed(3)}`,
      lat: plat,
      lon: plon,
    })
    setPinMode(false)
  }

  // Browser geolocation — the operator is usually ON the vessel, so their
  // device location IS the vessel location. Reverse-geocode for a nice label.
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not available in this browser.')
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: plat, longitude: plon } = pos.coords
        let label = `${plat.toFixed(3)}, ${plon.toFixed(3)}`
        try {
          const r = await fetch(`https://photon.komoot.io/reverse?lat=${plat}&lon=${plon}`)
          const j = await r.json()
          const p = j?.features?.[0]?.properties
          const nice = [p?.name, p?.city, p?.state].filter(Boolean).slice(0, 2).join(', ')
          if (nice) label = nice
        } catch {
          // coords-only label is fine
        }
        setPicked({ label, lat: plat, lon: plon })
        setPinMode(false)
        setLocating(false)
      },
      () => {
        setLocating(false)
        setError("Couldn't get your location — check browser permissions.")
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const save = async () => {
    if (!picked || saving) return
    setSaving(true)
    setError(null)
    const res = await fetch('/api/vessels/position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vessel_id: vesselId, port_text: picked.label, lat: picked.lat, lon: picked.lon }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to save location.')
      return
    }
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="p-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy">Update location</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Where is <span className="font-medium text-navy">{vesselName}</span> right now?
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-navy transition-colors p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4">
            <PlaceAutocomplete
              value={query}
              onChange={setQuery}
              onSelect={(r) => {
                setQuery(r.label)
                setPicked({ label: r.label, lat: r.lat, lon: r.lon })
              }}
              preferPorts
              placeholder="Search a port or city…"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-transparent transition"
            />
            <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
              <span className="text-gray-400">Pick a match, or</span>
              <button
                onClick={() => setPinMode((m) => !m)}
                className={`font-medium rounded-full px-2.5 py-1 border transition-colors ${
                  pinMode
                    ? 'bg-teal text-white border-teal'
                    : 'text-teal border-teal/30 hover:border-teal'
                }`}
              >
                {pinMode ? 'Click the map to place the pin…' : 'Drop a pin'}
              </button>
              {pinMode ? (
                <button onClick={() => setPinMode(false)} className="text-gray-400 hover:text-gray-600">
                  Cancel
                </button>
              ) : (
                <button
                  onClick={useMyLocation}
                  disabled={locating}
                  className="font-medium text-teal rounded-full px-2.5 py-1 border border-teal/30 hover:border-teal transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2m17.07-7.07l-2.12 2.12M7.05 16.95l-2.12 2.12m14.14 0l-2.12-2.12M7.05 7.05L4.93 4.93" />
                    <circle cx="12" cy="12" r="3.5" />
                  </svg>
                  {locating ? 'Locating…' : 'Use my location'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="h-64 relative">
          <PositionMap lat={lat} lon={lon} onPick={dropPin} clickToPick={pinMode} />
          {picked && !pinMode && (
            <div className="absolute top-2 left-2 z-[1000] bg-white/90 rounded-lg px-2.5 py-1 text-[11px] text-gray-500 shadow-sm">
              Drag the pin to fine-tune
            </div>
          )}
        </div>

        <div className="p-4 flex items-center justify-between gap-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 truncate">
            {picked
              ? <>New location: <span className="font-medium text-navy">{picked.label}</span></>
              : current
                ? <>Current: {current.label}</>
                : 'No location on file'}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {error && <span className="text-xs text-red-500">{error}</span>}
            <button
              onClick={save}
              disabled={!picked || saving}
              className="bg-teal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save location'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
