'use client'

import { useEffect, useState } from 'react'

export interface PersonChoice { name: string; person_id?: string | null; create_person?: boolean }
interface Match { id: string; name: string; affiliation: string | null }

export default function PersonPicker({ value, onChange }: { value: PersonChoice; onChange: (choice: PersonChoice) => void }) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<{ term: string; matches: Match[]; failed?: boolean } | null>(null)
  const term = value.name.trim()
  const searching = open && !!term && !value.person_id && !value.create_person
  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/people?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        if (!res.ok) throw Error()
        const data = await res.json()
        if (!controller.signal.aborted) setResults({ term, matches: data.people })
      } catch {
        if (!controller.signal.aborted) setResults({ term, matches: [], failed: true })
      }
    }, 180)
    return () => { clearTimeout(timer); controller.abort() }
  }, [term, searching])
  return <div className="min-w-0" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
    <input aria-label="Person name" placeholder="Search by name" maxLength={200} value={value.name}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" onFocus={() => setOpen(true)}
      onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
      onChange={e => { setOpen(true); onChange({ name: e.target.value, person_id: null, create_person: false }) }} />
    {value.person_id && <small className="text-teal">Linked to directory</small>}
    {value.create_person && <small className="text-teal">Will be added to the public directory on save</small>}
    {searching && <div className="rounded-lg border border-gray-200 bg-white p-1 text-sm">
      {results?.term !== term ? <p className="px-2 py-1">Searching…</p> : results.failed ? <p className="px-2 py-1">Directory search unavailable</p> : <>
        {results.matches.map(person => <button type="button" key={person.id} className="block w-full rounded px-2 py-2 text-left hover:bg-gray-50"
          onClick={() => { onChange({ person_id: person.id, name: person.name, create_person: false }); setOpen(false) }}>
          {person.name}{person.affiliation && <span className="ml-2 text-gray-500">{person.affiliation}</span>}
        </button>)}
        <button type="button" className="w-full px-2 py-2 text-left text-teal" onClick={() => { onChange({ name: term, person_id: null, create_person: true }); setOpen(false) }}>Add “{term}” to the public directory</button>
      </>}
    </div>}
  </div>
}
