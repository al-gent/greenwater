'use client'

import { useState } from 'react'
import type { Vessel } from '@/lib/vessel-utils'

const ICE_NO = new Set(['no', 'none', 'none.', 'negative', 'n/a', '-', ''])

function hasVal(v: string | number | boolean | null | undefined) {
  return v !== null && v !== undefined && v !== ''
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!hasVal(value)) return null
  return (
    <div className="flex justify-between items-baseline gap-4 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-700 text-right">{value}</span>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-3 pb-1 border-b border-gray-100 mt-2 first:mt-0">
      {label}
    </p>
  )
}

interface Props {
  vessel: Vessel
}

export default function VesselDetailSpecs({ vessel }: Props) {
  const [open, setOpen] = useState(false)

  const n = (v: number | null | undefined, suffix = '') =>
    v != null ? `${parseFloat(v.toFixed(1))}${suffix}` : null

  const iceBreaking = (vessel.ice_breaking ?? '').trim().toLowerCase()
  const hasIce = iceBreaking && !ICE_NO.has(iceBreaking)

  // Capability badges
  const capabilities = [
    { label: 'CTD',          active: !!vessel.ctd_cap },
    { label: 'Multibeam',    active: !!vessel.aquis_multibeam },
    { label: 'Side Scan',    active: !!vessel.aquis_sidescan },
    { label: 'ADCP',         active: !!vessel.aquis_adcp },
    { label: 'ROV',          active: !!vessel.underwater_vehicles_rov },
    { label: 'AUV',          active: !!vessel.underwater_vehicles_auv },
    { label: 'Diving',       active: !!vessel.diving_cap },
    { label: 'Coring',       active: !!vessel.core_capable },
    { label: 'DP System',    active: !!vessel.dpos },
    { label: 'Ice Breaking', active: !!hasIce },
    { label: 'Wet Lab',      active: (vessel.area_wetlab ?? 0) > 0 },
    { label: 'Dry Lab',      active: (vessel.area_drylab ?? 0) > 0 },
  ].filter((c) => c.active)

  // Key stats
  const stats = [
    { label: 'Research bunks', value: vessel.scientists },
    { label: 'Length',         value: n(vessel.length, ' m') },
    { label: 'Cruise speed',   value: n(vessel.speed_cruise, ' kn') },
    { label: 'Endurance',      value: vessel.endurance ? `${vessel.endurance} days` : null },
    { label: 'Range',          value: n(vessel.range, ' nm') },
    { label: 'Year built',     value: vessel.year_built },
    { label: 'Gross tons',     value: n(vessel.gross_tons) },
    { label: 'Crew',           value: vessel.crew },
  ].filter((s) => hasVal(s.value))

  return (
    <div className="space-y-4">

      {/* Key stats */}
      {stats.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-navy leading-none">{s.value}</p>
              <p className="text-xs text-gray-400 mt-1 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Capability badges */}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {capabilities.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1 bg-teal/10 text-teal text-xs font-semibold px-2.5 py-1 rounded-full">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* Vessel Details dropdown */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <span className="text-sm font-semibold text-navy">Vessel Details</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="px-4 py-2">

            <SectionHeader label="Research & Science" />
            <Row label="DP System" value={vessel.dpos} />
            <Row label="Ice Breaking" value={hasIce ? vessel.ice_breaking : null} />
            <Row label="CTD" value={vessel.ctd_cap} />
            <Row label="CTD Make" value={vessel.ctd_make} />
            <Row label="CTD Towed" value={vessel.ctd_towed} />
            <Row label="CTD Oxygen" value={vessel.ctd_oxy} />
            <Row label="CTD Transmissometer" value={vessel.ctd_trans} />
            <Row label="CTD Fluorometer" value={vessel.ctd_fluor} />
            <Row label="CTD Rosette" value={vessel.ctd_rosette} />
            <Row label="Coring" value={vessel.core_capable} />
            <Row label="Grab Core" value={vessel.core_grab} />
            <Row label="Box Core" value={vessel.core_box} />
            <Row label="Gravity Core" value={vessel.core_gravity} />
            <Row label="Piston Core" value={vessel.core_piston} />
            <Row label="Multi Core" value={vessel.core_multi} />
            <Row label="Multibeam" value={vessel.aquis_multibeam} />
            <Row label="Side Scan" value={vessel.aquis_sidescan} />
            <Row label="ADCP" value={vessel.aquis_adcp} />
            <Row label="SMS" value={vessel.aquis_sms} />
            <Row label="ROV" value={vessel.underwater_vehicles_rov} />
            <Row label="AUV" value={vessel.underwater_vehicles_auv} />
            <Row label="Submarine" value={vessel.underwater_vehicles_sub} />
            <Row label="Other Underwater Vehicles" value={vessel.underwater_vehicles} />
            <Row label="Diving" value={vessel.diving_cap} />
            <Row label="Radioactive" value={vessel.radioactive} />
            <Row label="Echo Sounder" value={vessel.acoustic_echosound} />
            <Row label="Sonar" value={vessel.acoustic_sonar} />
            <Row label="Acoustic Silent" value={vessel.acoustic_silent} />

            <SectionHeader label="Physical & Propulsion" />
            <Row label="Beam" value={n(vessel.beam, ' m')} />
            <Row label="Draft" value={n(vessel.draft, ' m')} />
            <Row label="Gross Tons" value={n(vessel.gross_tons)} />
            <Row label="Hull Material" value={vessel.hull_material} />
            <Row label="Officers" value={vessel.officers} />
            <Row label="Power" value={n(vessel.power_hp, ' hp')} />
            <Row label="Max Speed" value={n(vessel.speed_max, ' kn')} />
            <Row label="Engines" value={vessel.engine_number} />
            <Row label="Engine Make" value={vessel.engine_make} />
            <Row label="Engine Power" value={vessel.engine_power} />
            <Row label="Prop Diameter" value={n(vessel.prop_diam, ' m')} />
            <Row label="Prop Max RPM" value={vessel.prop_maxrpm} />
            <Row label="Aux Diesel Power" value={n(vessel.aux_diesel_pwr, ' kW')} />

            <SectionHeader label="Facilities" />
            <Row label="Wet Lab" value={n(vessel.area_wetlab, ' m²')} />
            <Row label="Dry Lab" value={n(vessel.area_drylab, ' m²')} />
            <Row label="Free Deck Area" value={n(vessel.free_deck_area, ' m²')} />
            <Row label="Freeboard Deck" value={n(vessel.freeboard_deck, ' m')} />
            <Row label="Container Lab Space" value={vessel.space_cont_lab} />
            <Row label="Dry Storage" value={n(vessel.capacity_dry, ' m³')} />
            <Row label="Fuel Capacity" value={n(vessel.capacity_fuel, ' t')} />
            <Row label="Water Generator" value={n(vessel.water_gen, ' t/day')} />
            <Row label="Water Capacity" value={n(vessel.water_capacity, ' t')} />
            <Row label="Water Treatment" value={vessel.water_clean} />
            <Row label="Air Conditioning" value={n(vessel.air_cond, ' kW')} />
            <Row label="Operating Grids" value={vessel.operating_grids} />

            <SectionHeader label="Winches & Cranes" />
            <Row label="Oceanographic Winches" value={vessel.oc_winches} />
            <Row label="Steel Wire" value={vessel.oc_steelwire_len ? `${n(vessel.oc_steelwire_len, ' m')} / ${n(vessel.oc_steelwire_load, ' kg')}` : null} />
            <Row label="Conductor Cable" value={vessel.oc_condcable_len ? `${n(vessel.oc_condcable_len, ' m')} / ${n(vessel.oc_condcable_load, ' kg')}` : null} />
            <Row label="Trawl Wire" value={vessel.oc_trawl_len ? `${n(vessel.oc_trawl_len, ' m')} / ${n(vessel.oc_trawl_load, ' kg')}` : null} />
            <Row label="Other Wire" value={vessel.oc_other_len ? `${n(vessel.oc_other_len, ' m')} / ${n(vessel.oc_other_load, ' kg')}` : null} />
            <Row label="Gantry" value={vessel.gantry_pos ? `${vessel.gantry_pos}, ${n(vessel.gantry_abovedeck, ' m')} height, ${n(vessel.gantry_load, ' t')}` : null} />
            <Row label="Crane" value={vessel.crane_pos ? `${vessel.crane_pos}, ${n(vessel.crane_abovedeck, ' m')} height, ${n(vessel.crane_load, ' t')}` : null} />
            <Row label="Other Winches" value={vessel.winch_other} />

            <SectionHeader label="Navigation & Comms" />
            <Row label="Navigation" value={vessel.nav_equipment} />
            <Row label="Communications" value={vessel.nav_communications} />
            <Row label="Satellite Comms" value={vessel.nav_satcomm} />
            <Row label="GPS" value={vessel.nav_gps} />

            <SectionHeader label="Electrical" />
            <Row label="AC Power" value={vessel.ac_voltage ? `${vessel.ac_voltage}V, ${vessel.ac_voltage_kva ?? '—'} kVA, ${vessel.ac_voltage_phases ?? '—'} phase, ${vessel.ac_voltage_freq ?? '—'} Hz` : null} />
            <Row label="DC Power" value={vessel.dc_voltages} />
            <Row label="Data Processing" value={vessel.dp_equip} />

            <SectionHeader label="Vessel Info" />
            <Row label="Call Sign" value={vessel.call_sign} />
            <Row label="MMSI" value={vessel.mmsi} />
            <Row label="IMO Number" value={vessel.imo_number} />
            <Row label="Year Refit" value={vessel.year_refit} />
            <Row label="Vessel Class" value={vessel.vessel_class} />
            <Row label="Construction" value={vessel.vessel_construct} />
            <Row label="NODC Code" value={vessel.nodc_code} />
            <Row label="ISM Certificate" value={vessel.ism_cert} />
            <Row label="UNOLS" value={vessel.unols ? 'Yes' : null} />
            <Row label="Euro Fleet" value={vessel.euro ? 'Yes' : null} />
            <Row label="Amenities" value={vessel.amenities} />
            <Row label="Notes" value={vessel.notes} />
            <Row label="Other" value={vessel.vessel_other} />

          </div>
        )}
      </div>
    </div>
  )
}
