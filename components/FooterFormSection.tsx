'use client'

import { useState, type ReactNode } from 'react'

export default function FooterFormSection({ id, title, mobileLabel, children }: {
  id: string
  title: string
  mobileLabel: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <section id={id} aria-label={title} className="flex min-w-0 scroll-mt-20 flex-col">
      <h3 className="mb-3 hidden text-sm font-semibold uppercase tracking-wider opacity-60 sm:block">{title}</h3>
      <button type="button" aria-expanded={open} aria-controls={`${id}-form`} onClick={() => setOpen(!open)}
        className="flex items-center justify-between rounded border border-white/30 px-4 py-3 text-left text-sm font-medium focus-visible:outline-teal-200 sm:hidden">
        {mobileLabel}<span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <div id={`${id}-form`} className={`${open ? 'mt-3 flex' : 'hidden'} flex-1 flex-col sm:mt-0 sm:flex`}>
        {children}
      </div>
    </section>
  )
}
