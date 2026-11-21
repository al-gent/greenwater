'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import PersonPicker, { type PersonChoice } from './PersonPicker'

export interface VesselAssignment {
  id: string; role: string; starts_on: string | null; ends_on: string | null; person: { id: string; name: string }
}
const field = 'mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm'

export default function VesselPeopleForm({ vesselId, assignments }: { vesselId: number; assignments: VesselAssignment[] }) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [person, setPerson] = useState<PersonChoice>({ name: '' })
  const [role, setRole] = useState('Captain')
  const [start, setStart] = useState(''), [end, setEnd] = useState('')
  const [message, setMessage] = useState(''), [saving, setSaving] = useState(false)
  function edit(row?: VesselAssignment) {
    setId(row?.id ?? null); setPerson({ name: row?.person.name ?? '', person_id: row?.person.id })
    setRole(row?.role ?? 'Captain'); setStart(row?.starts_on ?? ''); setEnd(row?.ends_on ?? ''); setMessage('')
  }
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!person.person_id && !person.create_person) { setMessage('Choose a directory match or add a new directory person.'); return }
    setSaving(true); setMessage('')
    try {
      const res = await fetch(`/api/vessels/${vesselId}/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, person, role, starts_on: start || null, ends_on: end || null }) })
      if (!res.ok) throw Error((await res.json()).error ?? 'Could not save this role')
      edit(); setMessage('Role saved.'); router.refresh()
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not save this role') }
    finally { setSaving(false) }
  }
  return <>
    {assignments.length > 0 && <ul className="mt-6 divide-y divide-gray-200">{assignments.map(row => <li key={row.id} className="flex items-center justify-between gap-3 py-3">
      <div><strong>{row.person.name}</strong> · {row.role}<div className="text-sm text-gray-600">{row.starts_on ? `From ${row.starts_on}` : ''}{row.ends_on ? ` through ${row.ends_on}` : row.starts_on ? ' · open-ended' : 'Dates unspecified'}</div></div>
      <button type="button" className="text-teal" disabled={saving} onClick={() => edit(row)} aria-label={`Edit ${row.person.name}, ${row.role}`}>Edit</button>
    </li>)}</ul>}
    <form className="mt-8 space-y-3" onSubmit={save}>
      <h2 className="font-semibold text-navy">{id ? 'Edit role' : 'Add a vessel role'}</h2>
      <PersonPicker value={person} onChange={setPerson} />
      <label className="block text-sm">Role<input className={field} list="vessel-role-suggestions" maxLength={100} value={role} onChange={e => setRole(e.target.value)} required /></label>
      <datalist id="vessel-role-suggestions">{['Captain','Mate','Engineer','Scheduling contact','Science contact','Other contact'].map(r => <option key={r} value={r} />)}</datalist>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">Start date (optional)<input className={field} type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label className="text-sm">End date (optional)<input className={field} type="date" min={start || undefined} value={end} onChange={e => setEnd(e.target.value)} /></label></div>
      <button disabled={saving} className="rounded-lg bg-navy px-4 py-2 text-white">{saving ? 'Saving…' : 'Save role'}</button>
      {id && <button type="button" disabled={saving} className="ml-3 text-sm" onClick={() => edit()}>Cancel edit</button>}
      <p role="status" className="text-sm">{message}</p>
    </form>
  </>
}
