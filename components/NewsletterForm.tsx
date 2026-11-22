'use client'

import { useState } from 'react'
import { trackConversion } from '@/lib/gtag'

export default function NewsletterForm() {
  const [fname, setFname] = useState('')
  const [lname, setLname] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    const res = await fetch('/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fname, lname }),
    })

    const data = await res.json()

    if (res.ok) {
      trackConversion('newsletter')
      setStatus('success')
      setEmail('')
    } else {
      setStatus('error')
      setMessage(data.error ?? 'Something went wrong.')
    }
  }

  if (status === 'success') {
    return (
      <p className="text-sm text-teal-300">
        You&apos;re subscribed — thanks for staying connected!
      </p>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <form onSubmit={handleSubmit} aria-label="Newsletter signup" className="flex flex-1 flex-col gap-2">
        <input
          type="text"
          value={fname}
          onChange={(e) => setFname(e.target.value)}
          placeholder="First name"
          required
          className="footer-field"
        />
        <input
          type="text"
          value={lname}
          onChange={(e) => setLname(e.target.value)}
          placeholder="Last name"
          required
          className="footer-field"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="footer-field"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="btn-primary mt-auto w-full"
        >
          {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>
      {status === 'error' && (
        <p className="text-xs text-red-400 mt-2">{message}</p>
      )}
    </div>
  )
}
