'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { PhotoDetail } from '@/lib/vessel-utils'

interface Props {
  photos: string[]
  vesselName: string
  details?: PhotoDetail[] | null
}

const PLACEHOLDER_URL = 'https://jmpxcsihkmyotidxjuyv.supabase.co/storage/v1/object/public/vessel-photos/placeholder.jpg'

export default function VesselPhotoGallery({ photos, vesselName, details }: Props) {
  const gallery = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [broken, setBroken] = useState<Set<string>>(new Set())

  const prev = () => setIndex((i) => (i - 1 + photos.length) % photos.length)
  const next = () => setIndex((i) => (i + 1) % photos.length)

  const isPlaceholder = photos.length === 0
  const current = isPlaceholder ? PLACEHOLDER_URL : photos[index]
  const src = broken.has(current) ? PLACEHOLDER_URL : current
  const detail = broken.has(current) ? undefined : details?.find((d) => d.url === current)
  const credit = detail?.credit

  useEffect(() => {
    const sync = () => {
      const expanded = document.fullscreenElement === gallery.current
      setNativeFullscreen(expanded)
      if (!expanded) expandButton.current?.focus()
    }
    const element = gallery.current
    element?.addEventListener('fullscreenchange', sync)
    return () => element?.removeEventListener('fullscreenchange', sync)
  }, [])

  async function expand() {
    if (document.fullscreenEnabled && gallery.current?.requestFullscreen) {
      try {
        await gallery.current.requestFullscreen()
        return
      } catch { /* Use the viewport viewer when native fullscreen is unavailable. */ }
    }
    setDialogOpen(true)
    dialog.current?.showModal()
  }

  function close() {
    if (document.fullscreenElement === gallery.current) void document.exitFullscreen()
    else dialog.current?.close()
  }

  function navigate(event: KeyboardEvent) {
    if (photos.length < 2) return
    if (event.key === 'ArrowLeft') prev()
    else if (event.key === 'ArrowRight') next()
    else return
    event.preventDefault()
  }

  function photo(expanded: boolean) {
    return <>
      <img
        key={isPlaceholder ? 'placeholder' : photos[index]}
        src={src}
        alt={isPlaceholder ? `${vesselName} placeholder` : `${vesselName} photo ${index + 1}`}
        className={`w-full h-full ${expanded ? 'object-contain' : 'object-cover'}`}
        onError={() => setBroken((b) => new Set(b).add(current))}
      />
      {(!isPlaceholder || expanded) && (
        <button ref={expanded && dialogOpen ? undefined : expandButton} type="button" onClick={expanded ? close : expand}
          aria-label={expanded ? 'Close full screen' : 'View photo full screen'} title={expanded ? 'Close full screen' : 'View photo full screen'}
          className="absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white">
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d={expanded ? 'M6 6l12 12M18 6 6 18' : 'M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5'} />
          </svg>
        </button>
      )}
      {isPlaceholder && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-5 py-4">
          <p className="text-white text-sm text-center font-medium">We don&apos;t have an image of this vessel yet, but we will soon!</p>
        </div>
      )}

      {credit && (
        detail?.source ? (
          <a
            href={detail.source}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 right-3 max-w-[60%] truncate bg-black/45 text-white/90 text-[10px] px-2 py-1 rounded-md underline decoration-white/40 underline-offset-2 hover:bg-black/60 hover:text-white"
            title={credit}
          >
            {credit}
          </a>
        ) : (
          <span className="absolute bottom-3 right-3 max-w-[60%] truncate bg-black/45 text-white/90 text-[10px] px-2 py-1 rounded-md" title={credit}>
            {credit}
          </span>
        )
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
                  i === index ? 'bg-[#fff] scale-110' : 'bg-[#fff]/50 hover:bg-[#fff]/75'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </>
  }

  return (
    <>
      <div ref={gallery} onKeyDown={nativeFullscreen ? navigate : undefined}
        className={nativeFullscreen ? 'relative h-full w-full bg-black' : 'relative aspect-video overflow-hidden rounded-3xl bg-gray-100'}>
        {photo(nativeFullscreen)}
      </div>
      <dialog ref={dialog} aria-label={`${vesselName} photos`} onKeyDown={navigate}
        onClose={() => { setDialogOpen(false); expandButton.current?.focus() }}
        className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-black p-0 backdrop:bg-black">
        {dialogOpen && photo(true)}
      </dialog>
    </>
  )
}
