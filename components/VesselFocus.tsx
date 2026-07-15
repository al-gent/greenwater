'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Vessel } from '@/lib/vessel-utils'
import { fmt, stripHtml, getPhotoUrl, nextPhotoFallback, countryNameToFlag, portAgeLabel } from '@/lib/vessel-utils'

interface Props {
  vessels: Vessel[]
  index: number
  onPrev: () => void
  onNext: () => void
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-bold text-navy leading-none">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-gray-400 mt-1">{label}</span>
    </div>
  )
}

export default function VesselFocus({ vessels, index, onPrev, onNext }: Props) {
  const v = vessels[index]
  // reset the image when the featured vessel changes
  const [src, setSrc] = useState(() => (v ? getPhotoUrl(v) : ''))
  useEffect(() => { if (v) setSrc(getPhotoUrl(v)) }, [v])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev()
      else if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPrev, onNext])

  if (!v) return null
  const activity = stripHtml(v.main_activity)
  const location = v.last_port_city
    ? [v.last_port_city, v.last_port_state, v.last_port_country].filter(Boolean).join(', ')
      + (portAgeLabel(v.last_port_date) ? ` · ${portAgeLabel(v.last_port_date)}` : '')
    : [v.port_city, v.port_state].filter(Boolean).join(', ') || fmt(v.country)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-2 sm:gap-4">
        <button
          onClick={onPrev}
          aria-label="Previous vessel"
          className="flex-shrink-0 w-10 h-10 rounded-full bg-white border border-gray-200 text-navy flex items-center justify-center hover:bg-navy hover:text-white hover:border-navy transition-colors shadow-sm"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex-1 min-w-0 bg-white rounded-2xl overflow-hidden shadow-card">
          <div className="relative h-56 sm:h-80 bg-lightblue-100">
            <img
              src={src}
              alt={v.name}
              className="w-full h-full object-cover"
              onError={() => setSrc(nextPhotoFallback(src, v))}
            />
            {countryNameToFlag(v.country) && (
              <div className="absolute top-3 left-3 text-2xl sm:text-3xl drop-shadow">{countryNameToFlag(v.country)}</div>
            )}
          </div>
          <div className="p-5 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-navy">{v.name}</h2>
            <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1">
              <svg className="w-4 h-4 text-teal flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {location}
            </p>
            {activity && (
              <p className="text-sm text-teal font-medium bg-teal-50 px-3 py-1.5 rounded-lg inline-block mt-3 line-clamp-2">{activity}</p>
            )}
            <div className="flex flex-wrap gap-x-8 gap-y-4 mt-5 border-t border-gray-100 pt-5">
              {v.scientists != null && <Stat value={v.scientists} label="research bunks" />}
              {v.length != null && <Stat value={`${v.length} m`} label="length" />}
              {v.speed_cruise != null && <Stat value={`${v.speed_cruise} kn`} label="cruise speed" />}
              {v.year_built != null && <Stat value={v.year_built} label="year built" />}
            </div>
            <Link
              href={`/vessels/${v.id}`}
              className="inline-block mt-6 bg-navy text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-navy-600 transition-colors"
            >
              View full details →
            </Link>
          </div>
        </div>

        <button
          onClick={onNext}
          aria-label="Next vessel"
          className="flex-shrink-0 w-10 h-10 rounded-full bg-white border border-gray-200 text-navy flex items-center justify-center hover:bg-navy hover:text-white hover:border-navy transition-colors shadow-sm"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        {index + 1} of {vessels.length} · use ← → to browse
      </p>
    </div>
  )
}
