// TEMPORARY — entity seed-list tables for /tmp-cruise (people / organizations / equipment).
import Link from 'next/link'
import { readEntity } from './data'

const s = (v: any) => (v == null || v === '' ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

function Table({ cols, rows, keyOf }: { cols: { k: string; label?: string; w?: string; render?: (r: any) => React.ReactNode }[]; rows: any[]; keyOf: (r: any) => string }) {
  return (
    <div className="overflow-x-auto border rounded max-h-[78vh] overflow-y-auto">
      <table className="text-xs w-full">
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            {cols.map((c) => (
              <th key={c.k} className="text-left px-2 py-1.5 font-semibold text-gray-600 whitespace-nowrap" style={{ width: c.w }}>
                {c.label ?? c.k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={keyOf(r)} className="hover:bg-navy-50 align-top">
              {cols.map((c) => (
                <td key={c.k} className="px-2 py-1 text-navy break-words">
                  {c.render ? c.render(r) : s(r[c.k]) || <span className="text-gray-300">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Filter({ tab, q, extra, placeholder, note }: { tab: string; q: string; extra?: React.ReactNode; placeholder: string; note: string }) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2 mb-2 text-sm">
      <input type="hidden" name="tab" value={tab} />
      <input name="q" defaultValue={q} placeholder={placeholder} className="border rounded px-2 py-1 w-72" />
      {extra}
      <button className="bg-navy text-white rounded px-3 py-1">Filter</button>
      <span className="text-xs text-gray-400">{note}</span>
    </form>
  )
}

export function PeopleTab({ q, sort }: { q: string; sort: string }) {
  const d = readEntity('people')
  let rows: any[] = d.people
  if (q) rows = rows.filter((p) => `${p.name} ${p.org} ${p.person_id}`.toLowerCase().includes(q))
  if (sort === 'name') rows = [...rows].sort((a, b) => a.list_name.localeCompare(b.list_name))
  if (sort === 'upcoming') rows = [...rows].sort((a, b) => b.upcoming_count - a.upcoming_count)
  if (sort === 'flags') rows = [...rows].sort((a, b) => b.name_flags.length - a.name_flags.length)
  const dupIds = new Set<number>(Object.values(d.same_name_different_ids as Record<string, number[]>).flat())
  return (
    <div>
      <Filter
        tab="people"
        q={q}
        placeholder="name / org / person_id"
        note={`${rows.length} of ${d.count} · ${Object.keys(d.same_name_different_ids).length} same-name/different-id groups: ${Object.keys(d.same_name_different_ids).join(', ')}`}
        extra={
          <select name="sort" defaultValue={sort} className="border rounded px-2 py-1">
            <option value="">sort: cruise count</option>
            <option value="upcoming">sort: upcoming</option>
            <option value="name">sort: name</option>
            <option value="flags">sort: name flags</option>
          </select>
        }
      />
      <Table
        keyOf={(r) => String(r.person_id)}
        rows={rows}
        cols={[
          { k: 'person_id', label: 'Person_id', w: '70px', render: (r) => <span className={dupIds.has(r.person_id) ? 'text-red-600 font-semibold' : ''}>{r.person_id}</span> },
          { k: 'user_id', label: 'User_id', w: '60px' },
          { k: 'name_raw', label: 'name (raw)', render: (r) => <span>{r.name_raw}{r.name_flags.length ? <span className="ml-1 text-[10px] text-gold-500">{r.name_flags.join(', ')}</span> : null}</span> },
          { k: 'org' },
          { k: 'roles', render: (r) => Object.entries(r.roles).map(([k, v]) => `${k}×${v}`).join(' ') },
          { k: 'cruise_count', label: 'cruises', w: '50px' },
          { k: 'upcoming_count', label: 'upcoming', w: '60px' },
          { k: 'first_cruise', render: (r) => r.first_cruise?.slice(0, 10) },
          { k: 'last_cruise', render: (r) => r.last_cruise?.slice(0, 10) },
          { k: 'vessels', render: (r) => Object.entries(r.vessels).map(([k, v]) => `${k} (${v})`).join(', ') },
          { k: 'cruise_ids', label: 'cruises', render: (r) => r.cruise_ids.slice(0, 6).map((id: number) => <Link key={id} href={`?id=${id}&all=1`} className="underline mr-1">{id}</Link>) },
        ]}
      />
    </div>
  )
}

export function OrganizationsTab({ q, source, kind }: { q: string; source: string; kind: string }) {
  const d = readEntity('organizations')
  let rows: any[] = d.organizations
  if (q) rows = rows.filter((o) => `${o.name} ${o.examples.join(' ')} ${o.vessels.join(' ')}`.toLowerCase().includes(q))
  if (source) rows = rows.filter((o) => o.sources[source])
  if (kind) rows = rows.filter((o) => o.kinds.includes(kind))
  const dupNames = new Set<string>(Object.values(d.near_duplicates_by_key as Record<string, string[]>).flat())
  return (
    <div>
      <Filter
        tab="organizations"
        q={q}
        placeholder="name / example person / vessel"
        note={`${rows.length} of ${d.count} strings · by source: ${Object.entries(d.by_source).map(([k, v]) => `${k} ${v}`).join(' · ')} · red = exact near-duplicate (case/punctuation)`}
        extra={
          <>
            <select name="source" defaultValue={source} className="border rounded px-2 py-1">
              <option value="">any source</option>
              {Object.keys(d.by_source).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <select name="kind" defaultValue={kind} className="border rounded px-2 py-1">
              <option value="">any kind</option>
              {['operator', 'institution', 'funding_agency', 'owner', 'affiliation'].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </>
        }
      />
      <Table
        keyOf={(r) => r.name}
        rows={rows}
        cols={[
          { k: 'name', render: (r) => <span className={dupNames.has(r.name) ? 'text-red-600 font-semibold' : 'font-medium'}>{r.name}</span> },
          { k: 'sources', render: (r) => Object.entries(r.sources).map(([k, v]) => <span key={k} className="inline-block bg-gray-100 rounded px-1 mr-1 mb-0.5">{k.replace(/^(mfp|vc)_/, '')} {v as number}</span>) },
          { k: 'kinds', render: (r) => r.kinds.join(', ') },
          { k: 'mfp_organisation_id', label: 'MFP org id', w: '60px' },
          { k: 'people_count', label: 'people', w: '50px' },
          { k: 'cruise_count', label: 'cruises', w: '50px' },
          { k: 'vessel_count', label: '#vessels', w: '50px' },
          { k: 'vessels', render: (r) => r.vessels.join(', ') + (r.vessel_count > r.vessels.length ? ` … +${r.vessel_count - r.vessels.length}` : '') },
          { k: 'examples', render: (r) => r.examples.join(' · ') },
        ]}
      />
    </div>
  )
}

export function EquipmentTab({ q, type, vessel }: { q: string; type: string; vessel: string }) {
  const d = readEntity('equipment')
  let rows: any[] = d.equipment
  if (q) rows = rows.filter((e) => `${e.Name} ${e.ModelNumber} ${e.Manufacturer} ${e.Group} ${e.Type}`.toLowerCase().includes(q))
  if (type) rows = rows.filter((e) => (e.Type || '').trim() === type)
  if (vessel) rows = rows.filter((e) => e.BaseVessel === vessel)
  return (
    <div>
      <Filter
        tab="equipment"
        q={q}
        placeholder="name / model / manufacturer / group"
        note={`${rows.length} of ${d.count} · ${Object.keys(d.types).length} types · pooled ${d.equipment.filter((e: any) => e.PooledEquipment).length}`}
        extra={
          <>
            <select name="type" defaultValue={type} className="border rounded px-2 py-1">
              <option value="">any type</option>
              {Object.entries(d.types).map(([k, v]) => (
                <option key={k} value={k}>{k} ({v as number})</option>
              ))}
            </select>
            <select name="vessel" defaultValue={vessel} className="border rounded px-2 py-1">
              <option value="">any base vessel</option>
              {Object.entries(d.by_vessel).map(([k, v]) => (
                <option key={k} value={k}>{k} ({v as number})</option>
              ))}
            </select>
          </>
        }
      />
      <Table
        keyOf={(r) => String(r.Equipment_id)}
        rows={rows}
        cols={[
          { k: 'Equipment_id', w: '60px' },
          { k: 'Name', render: (r) => <span className="font-medium">{r.Name}</span> },
          { k: 'Type' },
          { k: 'ModelNumber', label: 'Model' },
          { k: 'Manufacturer' },
          { k: 'Group' },
          { k: 'PooledEquipment', label: 'pooled', w: '50px', render: (r) => (r.PooledEquipment ? 'yes' : '') },
          { k: 'BaseVessel', label: 'base vessel' },
          { k: 'BaseLocation', label: 'base location (raw)' },
          { k: 'Institution' },
        ]}
      />
    </div>
  )
}
