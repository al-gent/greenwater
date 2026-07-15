'use client'

import { useRouter } from 'next/navigation'
import type { Vessel } from '@/lib/vessel-utils'
import { countryNameToFlag, portAgeLabel } from '@/lib/vessel-utils'

export type SortKey = 'name' | 'flag' | 'affiliation' | 'location' | 'length' | 'scientists' | 'draft' | 'endurance'
export type SortDir = 'asc' | 'desc'

function locationOf(v: Vessel): string {
  // bare location only — this doubles as the Location sort key; the age
  // suffix is appended at render time so it can't pollute the sort
  return v.last_port_city
    ? [v.last_port_city, v.last_port_state].filter(Boolean).join(', ')
    : [v.port_city, v.port_state].filter(Boolean).join(', ') || (v.country ?? '')
}

// sort value, or null when missing (missing rows always sort to the bottom)
function sortVal(v: Vessel, key: SortKey): string | number | null {
  switch (key) {
    case 'name': return v.name.toLowerCase()
    case 'flag': return (v.country ?? '').toLowerCase() || null
    case 'affiliation': return (v.affiliation ?? '').toLowerCase() || null
    case 'location': return locationOf(v).toLowerCase() || null
    case 'length': return v.length ?? null
    case 'scientists': return v.scientists ?? null
    case 'draft': return v.draft ?? null
    case 'endurance': return parseInt(v.endurance ?? '', 10) || null
  }
}

export function sortVessels(list: Vessel[], key: SortKey, dir: SortDir): Vessel[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const av = sortVal(a, key)
    const bv = sortVal(b, key)
    if (av === null && bv === null) return a.name.localeCompare(b.name)
    if (av === null) return 1
    if (bv === null) return -1
    if (av < bv) return -sign
    if (av > bv) return sign
    return a.name.localeCompare(b.name)
  })
}

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right'; render: (v: Vessel) => string }[] = [
  { key: 'name', label: 'Name', align: 'left', render: (v) => v.name },
  { key: 'flag', label: 'Flag', align: 'left', render: (v) => `${countryNameToFlag(v.country) ?? ''} ${v.country ?? ''}`.trim() },
  { key: 'affiliation', label: 'Affiliation', align: 'left', render: (v) => v.affiliation ?? '—' },
  { key: 'location', label: 'Location', align: 'left', render: (v) => {
    const loc = locationOf(v)
    if (!loc) return '—'
    const age = v.last_port_city ? portAgeLabel(v.last_port_date) : null
    return age ? `${loc} · ${age}` : loc
  } },
  { key: 'length', label: 'Length', align: 'right', render: (v) => (v.length != null ? `${v.length} m` : '—') },
  { key: 'scientists', label: 'Berths', align: 'right', render: (v) => (v.scientists != null ? String(v.scientists) : '—') },
  { key: 'draft', label: 'Draft', align: 'right', render: (v) => (v.draft != null ? `${Math.round(v.draft * 10) / 10} m` : '—') },
  { key: 'endurance', label: 'Endurance', align: 'right', render: (v) => (v.endurance ?? '').trim() || '—' },
]

interface Props {
  vessels: Vessel[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}

export default function VesselList({ vessels, sortKey, sortDir, onSort }: Props) {
  const router = useRouter()

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[720px] text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = sortKey === c.key
              return (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  className={`sticky top-0 bg-white border-b border-gray-200 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-navy' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.align === 'right' && active && <Arrow dir={sortDir} />}
                    {c.label}
                    {c.align === 'left' && active && <Arrow dir={sortDir} />}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {vessels.map((v) => (
            <tr
              key={v.id}
              onClick={() => router.push(`/vessels/${v.id}`)}
              className="cursor-pointer hover:bg-gray-50 transition-colors"
            >
              {COLUMNS.map((c) => (
                <td
                  key={c.key}
                  className={`border-b border-gray-100 px-3 py-2.5 whitespace-nowrap ${c.align === 'right' ? 'text-right tabular-nums text-gray-600' : 'text-left'} ${c.key === 'name' ? 'font-medium text-navy' : 'text-gray-600'} ${c.key === 'affiliation' || c.key === 'location' ? 'max-w-[200px] truncate' : ''}`}
                >
                  {c.render(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Arrow({ dir }: { dir: SortDir }) {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={dir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
    </svg>
  )
}
