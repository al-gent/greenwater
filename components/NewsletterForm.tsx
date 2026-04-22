'use client'

import { useState } from 'react'

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
    <div className="flex-1">
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 justify-center">
        <input
          type="text"
          value={fname}
          onChange={(e) => setFname(e.target.value)}
          placeholder="First name"
          required
          className="w-32 px-3 py-2 rounded text-sm bg-white/10 text-white placeholder-white/40 border border-white/20 focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal"
        />
        <input
          type="text"
          value={lname}
          onChange={(e) => setLname(e.target.value)}
          placeholder="Last name"
          required
          className="w-32 px-3 py-2 rounded text-sm bg-white/10 text-white placeholder-white/40 border border-white/20 focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="w-52 px-3 py-2 rounded text-sm bg-white/10 text-white placeholder-white/40 border border-white/20 focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-4 py-2 rounded text-sm font-medium bg-teal text-white hover:bg-teal/90 transition-colors disabled:opacity-60 whitespace-nowrap"
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
