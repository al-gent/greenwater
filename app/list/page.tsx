'use client'

import { useState } from 'react'
import Link from 'next/link'

interface ListForm {
  // Core
  vesselName: string
  operatorName: string
  email: string
  port_city: string
  port_state: string
  // Identification
  country: string
  mmsi: string
  imo_number: string
  call_sign: string
  // Physical
  year_built: string
  year_refit: string
  length_m: string
  beam_m: string
  draft_m: string
  // Performance & capacity
  speed_cruise: string
  speed_max: string
  scientists: string
  crew: string
  endurance: string
  // Research operations
  main_activity: string
  operating_area: string
  dpos: string
  ice_breaking: string
  url_ship: string
}

const emptyForm: ListForm = {
  vesselName: '', operatorName: '', email: '', port_city: '', port_state: '',
  country: '', mmsi: '', imo_number: '', call_sign: '',
  year_built: '', year_refit: '', length_m: '', beam_m: '', draft_m: '',
  speed_cruise: '', speed_max: '', scientists: '', crew: '', endurance: '',
  main_activity: '', operating_area: '', dpos: '', ice_breaking: '', url_ship: '',
}



function FeatureItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0 text-teal mt-0.5">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-navy mb-1">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

export default function ListPage() {
  const [form, setForm] = useState<ListForm>(emptyForm)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    setError(null)

    // Client-side validation
    if (!form.mmsi && !form.imo_number) {
      setValidationError('Please provide at least one of: MMSI or IMO Number.')
      return
    }
    if (form.mmsi && !/^\d{9}$/.test(form.mmsi.trim())) {
      setValidationError('MMSI must be exactly 9 digits.')
      return
    }
    if (form.imo_number && !/^(IMO\s?)?\d{7}$/.test(form.imo_number.trim())) {
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
        email: form.email,
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
        dpos: form.dpos,
        ice_breaking: form.ice_breaking,
        url_ship: form.url_ship,
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
    <div className="pt-16">
      {/* Hero */}
      <div className="bg-gradient-to-br from-navy via-navy-600 to-teal text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-gold font-semibold text-sm uppercase tracking-widest mb-4">
              For Vessel Operators
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
              Put Your Research Vessel<br />to Work
            </h1>
            <p className="text-lg text-white/80 leading-relaxed">
              Join the Greenwater Foundation network and connect your research vessel with
              scientists around the world. Fill capacity, fund operations, and advance
              global marine science.
            </p>
            <div className="flex items-center gap-6 mt-8">
              <a
                href="#apply"
                className="bg-gold text-navy px-6 py-3.5 rounded-full font-semibold hover:bg-yellow-400 transition-colors"
              >
                Apply to List Your Vessel
              </a>
              <Link
                href="/"
                className="text-white/80 hover:text-white font-medium flex items-center gap-1.5 transition-colors"
              >
                Browse vessels
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-teal text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 divide-x divide-white/20">
            {[
              { value: '567+', label: 'Vessels listed' },
              { value: '60+', label: 'Countries' },
              { value: '500+', label: 'Research institutions' },
            ].map((s) => (
              <div key={s.label} className="text-center px-4">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-white/70 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Value props */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold text-navy mb-3">
              Why list on Greenwater?
            </h2>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Our platform makes it easy to fill empty berths and fund ongoing research
              operations — while contributing to the global scientific community.
            </p>

            <div className="space-y-6">
              <FeatureItem
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                }
                title="Global Visibility"
                desc="Your vessel reaches thousands of marine scientists and research institutions worldwide actively searching for research platforms."
              />
              <FeatureItem
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                title="Fill Vacant Berths"
                desc="Maximize utilization by connecting with scientists whose timelines align with your existing schedules and research cruises."
              />
              <FeatureItem
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                title="Trusted Community"
                desc="Join a curated network of verified research institutions. All scientists are vetted before accessing vessel contact information."
              />
              <FeatureItem
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                title="Detailed Profiles"
                desc="Showcase your vessel's full specification sheet, equipment list, photos, and operational capabilities to serious researchers."
              />
            </div>
          </div>

          {/* Ocean photo */}
          <div className="relative hidden lg:block">
            <div
              className="rounded-3xl overflow-hidden shadow-card-hover"
              style={{ height: '480px' }}
            >
              <img
                src="https://jmpxcsihkmyotidxjuyv.supabase.co/storage/v1/object/public/vessel-photos/entete-ismer2.jpg"
                alt="Research vessel at sea"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/40 to-transparent rounded-3xl" />
            </div>
            {/* Floating card */}
            <div className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-card-hover p-4 max-w-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center text-teal flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-navy text-sm">Free to list</p>
                  <p className="text-xs text-gray-500">No upfront fees or commitments</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section id="apply" className="bg-gray-50 py-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-navy mb-3">Apply to List Your Vessel</h2>
            <p className="text-gray-500">
              Tell us about your vessel. Our team will review your application and
              reach out within 3–5 business days.
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
                  Thank you for your interest. Our team will review your application and
                  contact you at <strong>{form.email}</strong> within 3–5 business days.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSubmitted(false)
                      setForm(emptyForm)
                    }}
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

                {/* ── Basic info ── */}
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Vessel Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.vesselName}
                        onChange={(e) => setForm({ ...form, vesselName: e.target.value })}
                        placeholder="R/V Ocean Explorer"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Operator / Institution <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.operatorName}
                        onChange={(e) => setForm({ ...form, operatorName: e.target.value })}
                        placeholder="Woods Hole Oceanographic..."
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Contact Email <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="captain@institution.edu"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Port City <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.port_city}
                        onChange={(e) => setForm({ ...form, port_city: e.target.value })}
                        placeholder="e.g. Boston, Woods Hole, Hamburg"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        State / Province
                        <span className="ml-1 text-gray-400 font-normal">(if applicable)</span>
                      </label>
                      <input
                        type="text"
                        value={form.port_state}
                        onChange={(e) => setForm({ ...form, port_state: e.target.value })}
                        placeholder="e.g. MA, British Columbia"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Country / Flag State</label>
                      <input
                        type="text"
                        value={form.country}
                        onChange={(e) => setForm({ ...form, country: e.target.value })}
                        placeholder="USA"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Vessel Identification ── */}
                <div className="pt-2 border-t border-gray-100">
                  <h3 className="text-xs font-semibold text-navy uppercase tracking-widest mb-4">
                    Vessel Identification
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          MMSI <span className="text-gray-400 font-normal">(9 digits — AIS identifier)</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={9}
                          value={form.mmsi}
                          onChange={(e) => setForm({ ...form, mmsi: e.target.value.replace(/\D/g, '') })}
                          placeholder="123456789"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          IMO Number <span className="text-gray-400 font-normal">(7 digits)</span>
                        </label>
                        <input
                          type="text"
                          value={form.imo_number}
                          onChange={(e) => setForm({ ...form, imo_number: e.target.value })}
                          placeholder="IMO 1234567"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 -mt-1">At least one of MMSI or IMO Number is required.</p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Call Sign</label>
                      <input
                        type="text"
                        value={form.call_sign}
                        onChange={(e) => setForm({ ...form, call_sign: e.target.value })}
                        placeholder="KABO"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Physical Specifications ── */}
                <div className="pt-2 border-t border-gray-100">
                  <h3 className="text-xs font-semibold text-navy uppercase tracking-widest mb-4">
                    Physical Specifications
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Length (m) <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.1"
                          value={form.length_m}
                          onChange={(e) => setForm({ ...form, length_m: e.target.value })}
                          placeholder="85"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Beam (m)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form.beam_m}
                          onChange={(e) => setForm({ ...form, beam_m: e.target.value })}
                          placeholder="16"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Draft (m)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form.draft_m}
                          onChange={(e) => setForm({ ...form, draft_m: e.target.value })}
                          placeholder="5.5"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Year Built</label>
                        <input
                          type="number"
                          min="1900"
                          max={new Date().getFullYear()}
                          value={form.year_built}
                          onChange={(e) => setForm({ ...form, year_built: e.target.value })}
                          placeholder="1998"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Year Last Refit</label>
                        <input
                          type="number"
                          min="1900"
                          max={new Date().getFullYear()}
                          value={form.year_refit}
                          onChange={(e) => setForm({ ...form, year_refit: e.target.value })}
                          placeholder="2019"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Performance & Capacity ── */}
                <div className="pt-2 border-t border-gray-100">
                  <h3 className="text-xs font-semibold text-navy uppercase tracking-widest mb-4">
                    Performance &amp; Capacity
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Cruise Speed (kn)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form.speed_cruise}
                          onChange={(e) => setForm({ ...form, speed_cruise: e.target.value })}
                          placeholder="12"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Speed (kn)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={form.speed_max}
                          onChange={(e) => setForm({ ...form, speed_max: e.target.value })}
                          placeholder="15"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Research Bunks <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={form.scientists}
                          onChange={(e) => setForm({ ...form, scientists: e.target.value })}
                          placeholder="24"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Crew</label>
                        <input
                          type="number"
                          min="1"
                          value={form.crew}
                          onChange={(e) => setForm({ ...form, crew: e.target.value })}
                          placeholder="18"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Endurance</label>
                      <input
                        type="text"
                        value={form.endurance}
                        onChange={(e) => setForm({ ...form, endurance: e.target.value })}
                        placeholder="e.g. 30 days, 6000 nm"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Research Operations ── */}
                <div className="pt-2 border-t border-gray-100">
                  <h3 className="text-xs font-semibold text-navy uppercase tracking-widest mb-4">
                    Research Operations
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Research Activity / Main Focus <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        required
                        rows={4}
                        value={form.main_activity}
                        onChange={(e) => setForm({ ...form, main_activity: e.target.value })}
                        placeholder="Describe the vessel's research capabilities, scientific equipment, and typical mission types…"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Operating Area</label>
                      <input
                        type="text"
                        value={form.operating_area}
                        onChange={(e) => setForm({ ...form, operating_area: e.target.value })}
                        placeholder="e.g. North Atlantic, Arctic, Global"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Dynamic Positioning
                          <span className="ml-1 text-gray-400 font-normal">(DPos class)</span>
                        </label>
                        <input
                          type="text"
                          value={form.dpos}
                          onChange={(e) => setForm({ ...form, dpos: e.target.value })}
                          placeholder="e.g. DP2"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Ice Breaking Class
                        </label>
                        <input
                          type="text"
                          value={form.ice_breaking}
                          onChange={(e) => setForm({ ...form, ice_breaking: e.target.value })}
                          placeholder="e.g. 1A, PC6"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Links ── */}
                <div className="pt-2 border-t border-gray-100">
                  <h3 className="text-xs font-semibold text-navy uppercase tracking-widest mb-4">Links</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Official Website</label>
                    <input
                      type="url"
                      value={form.url_ship}
                      onChange={(e) => setForm({ ...form, url_ship: e.target.value })}
                      placeholder="https://www.institution.edu/vessel"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition"
                    />
                  </div>
                </div>

                {(validationError || error) && (
                  <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
                    {validationError ?? error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-navy text-white py-4 rounded-2xl font-semibold hover:bg-navy-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Submitting Application…
                    </>
                  ) : (
                    'Submit Application'
                  )}
                </button>
                <p className="text-center text-xs text-gray-400">
                  Listing is free. We don&apos;t sell or share your data. By submitting you agree to our{' '}
                  <a href="#" className="underline">Terms of Service</a>.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-bold text-navy mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {[
            {
              q: 'How much does it cost to list?',
              a: 'Listing your vessel on Greenwater Foundation is completely free. We are a non-profit foundation dedicated to advancing marine science.',
            },
            {
              q: 'How do inquiries work?',
              a: 'Scientists submit requests through our platform. You receive the inquiry directly by email and can negotiate terms, dates, and pricing directly with the researcher.',
            },
            {
              q: 'What information do I need to provide?',
              a: 'At minimum: vessel name, home port, key specs (length, berths, speed), and a brief description of research capabilities. Photos and full spec sheets make your listing much more compelling.',
            },
            {
              q: 'Can I control who contacts me?',
              a: 'Yes. All scientist inquiries go through our platform and you can choose to respond or not. Contact details are never shared without your consent.',
            },
          ].map((faq, i) => (
            <div key={i} className="bg-gray-50 rounded-2xl p-5">
              <h3 className="font-semibold text-navy mb-2">{faq.q}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
