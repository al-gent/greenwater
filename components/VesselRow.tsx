'use client'

import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import type { Vessel } from '@/lib/vessel-utils'
import VesselCard from './VesselCard'
import { getPhotoUrl } from '@/lib/vessel-utils'

interface VesselRowProps {
  title: string
  subtitle?: string
  vessels: Vessel[]
}

export default function VesselRow({ title, subtitle, vessels }: VesselRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)

  const CARD_W = 280 + 20 // card width + gap

  const updateArrows = () => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateArrows()
    el.addEventListener('scroll', updateArrows, { passive: true })
    return () => el.removeEventListener('scroll', updateArrows)
  }, [])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -CARD_W * 2 : CARD_W * 2, behavior: 'smooth' })
  }

  return (
    <section className="mb-10">
      {/* Row header */}
      <div className="flex items-start justify-between mb-4 px-4 sm:px-6 lg:px-8">
        <div>
          <h2 className="text-xl font-semibold text-navy flex items-center gap-2">
            {title}
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </h2>
          {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
        </div>

        {/* Arrow buttons */}
        <div className="hidden sm:flex items-center gap-2 flex-shrink-0 mt-1">
          <button
            onClick={() => scroll('left')}
            disabled={!canLeft}
            className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 transition-colors disabled:opacity-25 disabled:cursor-default"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canRight}
            className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:border-gray-400 transition-colors disabled:opacity-25 disabled:cursor-default"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable cards */}
      <div
        ref={scrollRef}
        className="flex gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-2 scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {vessels.map((vessel) => (
          <div key={vessel.id} className="flex-shrink-0" style={{ width: '280px' }}>
            <VesselCard vessel={vessel} photoUrl={getPhotoUrl(vessel)} />
          </div>
        ))}
      </div>
    </section>
  )
}
