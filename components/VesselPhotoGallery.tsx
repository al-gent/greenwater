'use client'

import { useState } from 'react'

interface Props {
  photos: string[]
  vesselName: string
  country?: string | null
}

const PLACEHOLDER_URL = 'https://jmpxcsihkmyotidxjuyv.supabase.co/storage/v1/object/public/vessel-photos/placeholder.jpg'

export default function VesselPhotoGallery({ photos, vesselName, country }: Props) {
  const [index, setIndex] = useState(0)

  const prev = () => setIndex((i) => (i - 1 + photos.length) % photos.length)
  const next = () => setIndex((i) => (i + 1) % photos.length)

  const isPlaceholder = photos.length === 0

  return (
    <div className="relative rounded-3xl overflow-hidden bg-gray-100" style={{ aspectRatio: '16/9' }}>
      <img
        key={isPlaceholder ? 'placeholder' : photos[index]}
        src={isPlaceholder ? PLACEHOLDER_URL : photos[index]}
        alt={isPlaceholder ? `${vesselName} placeholder` : `${vesselName} photo ${index + 1}`}
        className="w-full h-full object-cover"
      />
      {isPlaceholder && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-5 py-4">
          <p className="text-white text-sm text-center font-medium">We don&apos;t have an image of this vessel yet, but we will soon!</p>
        </div>
      )}

      {country && (
        <span className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-navy text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
          {country}
        </span>
      )}

      {photos.length > 1 && (
        <>
          {/* Prev / Next */}
          <button
            onClick={prev}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={next}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Photo ${i + 1}`}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === index ? 'bg-white scale-110' : 'bg-white/50 hover:bg-white/75'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
