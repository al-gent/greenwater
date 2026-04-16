'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Vessel } from '@/lib/vessel-utils'
import { fmt, stripHtml, getFallbackPhotoUrl, toThumbnailUrl, countryNameToFlag } from '@/lib/vessel-utils'

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days < 1) return 'today'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}yr ago`
}

interface VesselCardProps {
  vessel: Vessel
  photoUrl: string
}

export default function VesselCard({ vessel, photoUrl }: VesselCardProps) {
  const [imgSrc, setImgSrc] = useState(() => toThumbnailUrl(photoUrl))

  const activity = stripHtml(vessel.main_activity)

  return (
    <Link
      href={`/vessels/${vessel.id}`}
      className="group block bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 hover:-translate-y-1"
    >
      {/* Photo */}
      <div className="relative h-28 sm:h-48 bg-lightblue-100 overflow-hidden">
        <img
          src={imgSrc}
          alt={vessel.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={() => setImgSrc(getFallbackPhotoUrl(vessel))}
        />
        {/* Country flag */}
        {countryNameToFlag(vessel.country) && (
          <div className="absolute top-2 left-2 sm:top-3 sm:left-3 text-lg sm:text-2xl drop-shadow">
            {countryNameToFlag(vessel.country)}
          </div>
        )}
        {/* Scientists badge */}
        {vessel.scientists != null && (
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-teal text-white text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full hidden sm:flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
            {vessel.scientists} research bunks
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-2.5 sm:p-4">
        <h3 className="font-semibold text-navy text-sm sm:text-lg leading-tight mb-0.5 sm:mb-1 group-hover:text-teal transition-colors line-clamp-1">
          {vessel.name}
        </h3>

        {/* Location */}
        <p className="text-gray-500 text-xs sm:text-sm flex items-center gap-1 sm:mb-3">
          <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="truncate">
            {vessel.last_port_city
              ? [vessel.last_port_city, vessel.last_port_state].filter(Boolean).join(', ')
              : vessel.port_city ?? vessel.port_state ?? fmt(vessel.country)}
          </span>
        </p>

        {/* Activity — desktop only */}
        {activity && (
          <p className="hidden sm:block text-xs text-teal font-medium bg-teal-50 px-2 py-1 rounded-lg line-clamp-1 mb-3">
            {activity}
          </p>
        )}

        {/* Specs row — desktop only */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3">
          {vessel.length != null && (
            <span className="flex items-center gap-1">
              <span className="font-medium text-gray-700">{vessel.length}m</span>
              <span>length</span>
            </span>
          )}
          {vessel.speed_cruise != null && (
            <span className="flex items-center gap-1">
              <span className="font-medium text-gray-700">{vessel.speed_cruise}kn</span>
              <span>cruise</span>
            </span>
          )}
          {vessel.year_built != null && (
            <span className="flex items-center gap-1">
              <span>Built</span>
              <span className="font-medium text-gray-700">{vessel.year_built}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
