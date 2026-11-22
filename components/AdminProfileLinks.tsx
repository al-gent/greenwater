'use client'

import { useCallback, useEffect, useState } from 'react'

type LinkRequest = {
  id: string; note: string | null; created_at: string; verified_account_email: string | null
  member: { first_name: string | null; last_name: string | null; institution: string | null; title: string | null }
  person: { name: string; affiliation: string | null; email: string | null; organization: { name: string } | null }
}

export default function AdminProfileLinks() {
  const [rows, setRows] = useState<LinkRequest[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/profile-links', { cache: 'no-store' })
    if (!response.ok) throw new Error('The review queue could not be loaded.')
    setRows(await response.json())
  }, [])
  useEffect(() => { load().catch(() => setError('The review queue could not be loaded.')) }, [load])

  async function review(row: LinkRequest, status: 'confirmed' | 'declined') {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/admin/profile-links', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, status }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setMessage(`Request for ${row.person.name} ${status}.`)
      window.dispatchEvent(new Event('gw:pending-count-changed'))
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the decision.') }
    finally {
      await load().catch(() => setError('The review queue could not be refreshed.'))
      setBusy(false)
    }
  }
  return <section className="space-y-4" aria-labelledby="profile-links-heading">
    <h2 id="profile-links-heading" className="text-xl font-bold text-navy">Profile link requests</h2>
    {error && <div role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={() => { setError(''); load().catch(() => setError('The review queue could not be loaded.')) }}>Refresh</button></div>}
    {message && <p role="status" className="text-sm text-gray-600">{message}</p>}
    {rows === null ? !error && <p>Loading requests…</p> : !rows.length ? <p className="text-sm text-gray-600">No profile links are waiting for review.</p> : rows.map(row => <article key={row.id} className="space-y-4 rounded-2xl bg-white p-5 shadow-card">
      <p className="text-xs text-gray-500">Requested {new Date(row.created_at).toLocaleDateString()}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h3 className="text-sm text-gray-500">Member account</h3><strong className="text-navy">{[row.member.first_name, row.member.last_name].filter(Boolean).join(' ') || 'Member'}</strong>
          <p className="text-sm">{[row.member.title, row.member.institution].filter(Boolean).join(' · ')}</p><p className="break-words text-sm">{row.verified_account_email || 'No verified email on request'}</p></div>
        <div><h3 className="text-sm text-gray-500">Directory record</h3><strong className="text-navy">{row.person.name}</strong>
          <p className="text-sm">{row.person.affiliation || row.person.organization?.name}</p><p className="break-words text-sm">{row.person.email}</p></div>
      </div>
      {row.note && <p className="whitespace-pre-wrap break-words text-sm text-gray-700"><strong>Member note</strong><br />{row.note}</p>}
      <div className="flex gap-3"><button disabled={busy} className="rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => review(row, 'confirmed')}>Confirm match</button>
        <button disabled={busy} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50" onClick={() => review(row, 'declined')}>Decline</button></div>
    </article>)}
  </section>
}
