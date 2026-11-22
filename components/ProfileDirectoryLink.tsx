'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

type Person = { id: string; name: string; affiliation: string | null }
type Candidate = Person & {
  organization: { name: string } | null
  projects: { project: { title: string } | null }[]
  cruises: { cruise: { title: string } | null }[]
}
type Credit = { kind: string; title: string; path: string; role: string; starts_on: string | null; ends_on: string | null }
type DirectoryLink = {
  person: Person | null
  request: { status: 'pending' | 'confirmed' | 'declined'; person: { name: string } | null } | null
  linkingUnavailable?: boolean
  creditsUnavailable?: boolean
  credits: Credit[]
}
const button = 'inline-flex items-center rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-600 disabled:opacity-50'
const input = 'mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-navy'

function creditDates(credit: Credit) {
  const format = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
  if (credit.kind === 'Project') return credit.starts_on ? `Earliest requested start ${format(credit.starts_on)}` : ''
  if (credit.starts_on && credit.ends_on) return `${format(credit.starts_on)} – ${format(credit.ends_on)}`
  if (credit.starts_on) return `From ${format(credit.starts_on)}`
  return credit.ends_on ? `Through ${format(credit.ends_on)}` : ''
}

export default function ProfileDirectoryLink({ name }: { name: string }) {
  const [link, setLink] = useState<DirectoryLink | null>(null)
  const [version, setVersion] = useState(0)
  const [query, setQuery] = useState(name)
  const [results, setResults] = useState<Candidate[] | null>(null)
  const [selection, setSelection] = useState<Candidate | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/profile/directory-link', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (!controller.signal.aborted) setLink(data)
    }).catch(() => { if (!controller.signal.aborted) setError('Your directory link could not be loaded.') })
    return () => controller.abort()
  }, [version])

  async function search(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setResults(null)
    try {
      const response = await fetch(`/api/people?purpose=profile-link&q=${encodeURIComponent(query.trim())}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setResults(data.people)
    } catch { setError('Directory search is unavailable. Please try again.') }
    finally { setBusy(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!selection) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/profile/directory-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId: selection.id, note }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setLink({ person: null, request: { status: 'pending', person: { name: selection.name } }, credits: [] })
      setSelection(null); setResults(null); setNote('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not submit your request.') }
    finally { setBusy(false) }
  }

  return <section className="mt-6 space-y-3 border-t border-gray-100 pt-5" aria-labelledby="directory-work">
    <h3 id="directory-work" className="text-lg font-semibold text-navy">Your work on Vessel Connect</h3>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!link ? (error ? <button type="button" className={button} onClick={() => { setError(''); setVersion(v => v + 1) }}>Try again</button> : <p className="text-sm text-gray-500">Loading your directory record…</p>)
      : link.person ? <>
        <p className="text-sm text-gray-600">Linked to <strong>{link.person.name}</strong>{link.person.affiliation && ` · ${link.person.affiliation}`}</p>
        {link.creditsUnavailable ? <p className="text-sm text-gray-600">Your work history isn’t available yet.</p> : link.credits.length ? <ul className="divide-y divide-gray-100">{link.credits.map((credit, index) => <li key={`${credit.path}-${index}`} className="py-2">
          <Link href={credit.path} className="text-sm font-semibold text-navy underline">{credit.title}</Link>
          <p className="text-sm text-gray-600">{[credit.kind, credit.role, creditDates(credit)].filter(Boolean).join(' · ')}</p>
        </li>)}</ul> : <p className="text-sm text-gray-500">No work credits yet. Vessels, projects, and cruises will appear here as they’re added to your directory record.</p>}
      </> : link.linkingUnavailable ? <div className="text-sm text-gray-600">
        <p className="font-semibold text-navy">No work linked yet</p>
        <p className="mt-1">Directory linking isn’t available yet. Once it’s enabled, you can connect your profile to vessels, projects, and cruises you’ve worked on.</p>
      </div> : link.request?.status === 'pending' ? <p role="status" className="text-sm text-gray-600">The team is reviewing your request to link <strong>{link.request.person?.name ?? 'your directory record'}</strong>. You can check the decision here.</p>
      : link.request?.status === 'confirmed' ? <p className="text-sm text-gray-600">Your link was confirmed. The directory record is currently unavailable.</p>
      : <>
        {link.request?.status === 'declined' && <p className="text-sm text-gray-600">The team couldn’t confirm your match{link.request.person && ` with ${link.request.person.name}`}. You can search again or include more details with your request.</p>}
        <p className="text-sm font-semibold text-navy">No work linked yet</p>
        <p className="text-sm text-gray-600">Already listed on a vessel, project, or cruise? Find your directory record to show that work on your profile.</p>
        {selection ? <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-navy"><strong>{selection.name}</strong>{(selection.affiliation || selection.organization?.name) && ` · ${selection.affiliation || selection.organization?.name}`}</p>
          <label className="block text-sm text-gray-700">Anything the team should know? (optional)
            <textarea className={input} rows={2} maxLength={800} placeholder="A vessel, project, or institution you worked with" value={note} onChange={e => setNote(e.target.value)} /></label>
          <div className="flex items-center gap-4"><button className={button} disabled={busy}>{busy ? 'Sending…' : 'Request review'}</button>
            <button type="button" className="text-sm text-navy underline" disabled={busy} onClick={() => { setSelection(null); setNote(''); setError('') }}>Choose a different record</button></div>
        </form> : <>
          <form onSubmit={search} className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm text-gray-700">Name in the directory
            <input className={input} value={query} maxLength={200} disabled={busy} onChange={e => { setQuery(e.target.value); setResults(null) }} /></label>
            <button className={button} disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Find my record'}</button></form>
          {results && (results.length ? <ul className="divide-y divide-gray-100">{results.map(p => <li key={p.id} className="flex items-center justify-between gap-3 py-2">
            <div><strong className="text-sm text-navy">{p.name}</strong><p className="text-sm text-gray-600">{[p.affiliation || p.organization?.name, p.projects[0]?.project?.title, p.cruises[0]?.cruise?.title].filter(Boolean).join(' · ')}</p></div>
            <button type="button" className="shrink-0 text-sm font-semibold text-navy underline" onClick={() => setSelection(p)}>This is me</button>
          </li>)}</ul> : <p role="status" className="text-sm text-gray-500">No available records match that name. Try a last name or a different spelling.</p>)}
        </>}
      </>}
  </section>
}
