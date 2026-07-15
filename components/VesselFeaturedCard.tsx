'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Vessel } from '@/lib/vessel-utils'
import { fmt, stripHtml, nextPhotoFallback, countryNameToFlag, portAgeLabel } from '@/lib/vessel-utils'

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-bold text-navy text-sm leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-gray-400 mt-1">{label}</span>
    </div>
  )
}

// Richer card for the Featured view. Every field is guaranteed present (see
// isFeatured in HomeClient), so the layout never shows a blank.
export default function VesselFeaturedCard({ vessel, photoUrl }: { vessel: Vessel; photoUrl: string }) {
  const [src, setSrc] = useState(photoUrl)
  const activity = stripHtml(vessel.main_activity ?? '')
  const location = vessel.last_port_city
    ? [vessel.last_port_city, vessel.last_port_state].filter(Boolean).join(', ')
      + (portAgeLabel(vessel.last_port_date) ? ` · ${portAgeLabel(vessel.last_port_date)}` : '')
    : [vessel.port_city, vessel.port_state].filter(Boolean).join(', ') || fmt(vessel.country)
  const draft = vessel.draft != null ? Math.round(vessel.draft * 10) / 10 : null
  const endDays = parseInt(vessel.endurance ?? '', 10) || null

  return (
    <Link
      href={`/vessels/${vessel.id}`}
      className="group block bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1"
    >
      <div className="relative h-48 sm:h-56 bg-lightblue-100 overflow-hidden">
        <img
          src={src}
          alt={vessel.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={() => setSrc(nextPhotoFallback(src, vessel))}
        />
        {countryNameToFlag(vessel.country) && (
          <div className="absolute top-3 left-3 text-2xl drop-shadow">{countryNameToFlag(vessel.country)}</div>
        )}
      </div>

      <div className="p-5">
        <h3 className="font-semibold text-navy text-lg leading-tight group-hover:text-teal transition-colors line-clamp-1">
          {vessel.name}
        </h3>
        {vessel.affiliation && <p className="text-xs text-gray-400 truncate mt-0.5">{vessel.affiliation}</p>}

        <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1.5">
          <svg className="w-3.5 h-3.5 text-teal flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          </svg>
          <span className="truncate">{location}</span>
        </p>

        {activity && <p className="text-sm text-gray-600 line-clamp-2 mt-2.5">{activity}</p>}

        <div className="grid grid-cols-4 gap-2 mt-4 border-t border-gray-100 pt-4">
          {vessel.length != null && <Stat value={`${vessel.length}m`} label="length" />}
          {vessel.scientists != null && <Stat value={vessel.scientists} label="berths" />}
          {draft != null && <Stat value={`${draft}m`} label="draft" />}
          {endDays != null && <Stat value={endDays} label="days" />}
        </div>
      </div>
    </Link>
  )
}
