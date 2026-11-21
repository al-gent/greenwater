import type { SupabaseClient } from '@supabase/supabase-js'
import type { TimelineEntryRow } from './timeline-service'

interface VisibleEntry {
  id: string
  label: string | null
  cruise_id: string | null
  cruise: { title: string; slug: string } | null
}

export interface AvailabilityConflict {
  id: string | null
  start_at: string
  end_at: string
  label: string
  slug: string | null
  kind: 'busy' | 'cruise' | 'block'
}

/** All reservations block dates. Fetch display details under the viewer's RLS policies. */
export async function visibleConflicts(viewer: SupabaseClient, entries: TimelineEntryRow[], ignoreCruise: string | null = null) {
  const visible = new Map<string, VisibleEntry>()
  // Bound the PostgREST URL size for long availability windows.
  for (let offset = 0; offset < entries.length; offset += 100) {
    const ids = entries.slice(offset, offset + 100).map(entry => entry.id)
    const { data, error } = await viewer.from('timeline_entries')
      .select('id,label,cruise_id,cruise:cruises(title,slug)').in('id', ids).returns<VisibleEntry[]>()
    if (error) throw error
    for (const row of data ?? []) visible.set(row.id, row)
  }
  return entries.flatMap<AvailabilityConflict>(({ id, start_at, end_at }) => {
    const row = visible.get(id)
    if (!row || (row.cruise_id && !row.cruise)) {
      return [{ id: null, start_at, end_at, label: 'Busy', slug: null, kind: 'busy' }]
    }
    if (row.cruise && row.cruise_id === ignoreCruise) return []
    return [{ id, start_at, end_at, label: row.cruise?.title ?? row.label ?? 'Busy', slug: row.cruise?.slug ?? null, kind: row.cruise ? 'cruise' : 'block' }]
  })
}
