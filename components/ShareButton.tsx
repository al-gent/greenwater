'use client'

import { useId, useRef, useState } from 'react'

export default function ShareButton({ title }: { title: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const [link, setLink] = useState('')
  const [status, setStatus] = useState('')

  async function share() {
    const url = window.location.origin + window.location.pathname
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    setLink(url)
    setStatus('')
    dialog.current?.showModal()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setStatus('Link copied')
    } catch {
      linkInput.current?.focus()
      linkInput.current?.select()
      setStatus('Copy the selected link to share it.')
    }
  }

  return (
    <>
      <button type="button" onClick={share} className="btn-secondary">
        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4" />
        </svg>
        Share
      </button>
      <dialog ref={dialog} aria-labelledby={headingId} className="w-[min(24rem,90vw)] rounded-2xl border border-gray-200 bg-white p-5 text-gray-600 shadow-modal backdrop:bg-black/50">
        <div className="flex items-center justify-between gap-3">
          <h2 id={headingId} className="text-lg font-semibold text-navy">Share {title}</h2>
          <form method="dialog"><button aria-label="Close share options" className="px-2 text-xl">×</button></form>
        </div>
        <input ref={linkInput} readOnly aria-label="Page link" value={link} onFocus={event => event.target.select()} className="mt-4 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm" />
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm font-semibold">
          <button type="button" onClick={copy} className="btn-primary">Copy link</button>
          <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(link)}`} className="text-teal hover:underline">Email</a>
          <a href={`sms:?body=${encodeURIComponent(link)}`} className="text-teal hover:underline">Text message</a>
        </div>
        <p role="status" className="text-sm text-teal empty:hidden mt-3">{status}</p>
      </dialog>
    </>
  )
}
