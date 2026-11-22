'use client'

import { useState, type FormEvent } from 'react'

export default function ContactForm({ footer = false }: { footer?: boolean }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending) return
    const data = new FormData(event.currentTarget)
    setSending(true)
    setError('')
    try {
      const response = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(data)),
      })
      const result = await response.json()
      if (response.ok && result.success) setSent(true)
      else setError(result.error || 'We couldn’t send your question. Please try again.')
    } catch {
      setError('We couldn’t send your question. Please try again.')
    } finally {
      setSending(false)
    }
  }

  if (sent) return <p role="status" className={`text-sm font-medium ${footer ? 'text-teal-200' : 'text-navy'}`}>
    {footer ? 'Thanks for your feedback.' : 'Thanks for your question.'} Our team will reply by email.
  </p>

  const field = footer ? 'footer-field' : 'mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 font-normal text-base focus:outline-teal'
  const label = footer ? 'sr-only' : 'block text-sm font-medium text-navy'
  return (
    <form onSubmit={submit} aria-label={footer ? 'Send feedback' : 'Ask the team'} className={footer ? 'flex flex-1 flex-col gap-2' : 'space-y-4'}>
      <label className="block">
        <span className={label}>Your email</span>
        <input className={field} type="email" name="email" placeholder={footer ? 'Your email' : undefined} autoComplete="email" maxLength={254} required />
      </label>
      <label className={footer ? 'flex flex-1 flex-col' : 'block'}>
        <span className={label}>{footer ? 'Your feedback' : 'Your question'}</span>
        <textarea className={`${field} ${footer ? 'flex-1 resize-y' : ''}`} name="question" placeholder={footer ? 'Your feedback or question' : undefined} rows={footer ? 3 : 4} maxLength={4000} required />
      </label>
      <label hidden aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      {error && <p role="alert" className={`text-sm ${footer ? 'text-red-200' : 'text-red-700'}`}>{error}</p>}
      <button type="submit" disabled={sending} className={footer ? 'btn-primary w-full' : 'btn-primary'}>
        {sending ? 'Sending…' : footer ? 'Send feedback' : 'Send question'}
      </button>
    </form>
  )
}
