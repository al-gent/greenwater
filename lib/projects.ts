/**
 * Projects: the researcher's object. Server-only loaders. Types, constants and the field
 * validators are in lib/project-utils.ts (client-safe).
 */
import { cache } from 'react'
import { supabase } from './supabase'
import { supabaseAdmin } from './supabase-admin'
import type { Project, ProjectGearLine, ProjectPerson, ProjectBid } from './project-utils'
import { getOperatedVesselIds } from './operators'
import { PROJECT_COLS, slugify, isUuid } from './project-utils'

export * from './project-utils'

// Routes use the slug; a uuid still resolves so old links redirect.
const byKey = (key: string) => (isUuid(key) ? { col: 'id', val: key } : { col: 'slug', val: key })

/** Public read (RLS: published, or attached to a published cruise). */
export const getProject = cache(async (key: string): Promise<Project | null> => {
  const k = byKey(key)
  const { data } = await supabase.from('projects').select(PROJECT_COLS).eq(k.col, k.val).is('deleted_at', null).maybeSingle()
  return (data as Project | null) ?? null
})

/** Owner/admin read, RLS bypassed; caller checks authorization. */
export async function getProjectAsAdmin(key: string): Promise<Project | null> {
  const k = byKey(key)
  const { data } = await supabaseAdmin.from('projects').select(PROJECT_COLS).eq(k.col, k.val).is('deleted_at', null).maybeSingle()
  return (data as Project | null) ?? null
}

/** A slug nobody has: the title's slug, then -2, -3… */
export async function uniqueProjectSlug(title: string): Promise<string> {
  const base = slugify(title) || 'project'
  const { data } = await supabaseAdmin.from('projects').select('slug').like('slug', `${base}%`)
  const taken = new Set((data ?? []).map((r: any) => r.slug))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

export async function getProjectGear(id: string, admin = false): Promise<ProjectGearLine[]> {
  const client = admin ? supabaseAdmin : supabase
  const { data } = await client.from('project_gear').select('id, label, equipment_type_id, quantity, notes').eq('project_id', id).order('created_at')
  return (data ?? []) as ProjectGearLine[]
}

export const getEquipmentTypes = cache(async (): Promise<{ id: string; name: string; category: string | null }[]> => {
  const { data } = await supabase.from('equipment_types').select('id, name, category').order('category').order('name')
  return (data ?? []) as any[]
})

export async function listMyProjects(userId: string): Promise<Project[]> {
  const { data } = await supabaseAdmin.from('projects').select(PROJECT_COLS).eq('created_by', userId).is('deleted_at', null).order('updated_at', { ascending: false })
  return (data ?? []) as Project[]
}

export async function getProjectPeople(id: string, admin = false): Promise<ProjectPerson[]> {
  const client = admin ? supabaseAdmin : supabase
  const { data } = await client.from('project_people').select('id, role_id, name, notes, role:cruise_roles(slug, label)').eq('project_id', id).order('created_at')
  return ((data ?? []) as any[]).map((r) => ({ ...r, role: Array.isArray(r.role) ? r.role[0] ?? null : r.role ?? null })) as ProjectPerson[]
}

// Which roles a project may list. Crew jobs (captain, mate, deckhand…) are the operator's to
// fill on the cruise, so they are left out here. Edit this list, not the database.
export const PROJECT_ROLE_SLUGS = ['pi', 'co_pi', 'chief_scientist', 'scientist', 'technician', 'student', 'observer', 'other'] as const

export const getProjectRoles = cache(async (): Promise<{ id: string; slug: string; label: string }[]> => {
  const { data } = await supabase.from('cruise_roles').select('id, slug, label')
  const rows = (data ?? []) as { id: string; slug: string; label: string }[]
  return PROJECT_ROLE_SLUGS.map((slug) => rows.find((r) => r.slug === slug)).filter(Boolean) as typeof rows
})

const BID_COLS = 'id, project_id, vessel_id, proposed_departure_at, proposed_arrival_at, tz, berths, cost_amount, cost_currency, notes, offered_at, offered_by, accepted_at, confirmed_at, declined_at, withdrawn_at, cruise_id, vessel:vessels(id, name, operator_name), gear:bid_gear(project_gear_id, answer, notes)'

/** Bids on a project, service-role read; the caller decides who may see which (author: all;
 *  an operator: those on vessels they operate). */
export async function getProjectBids(projectId: string, opts: { vesselIds?: number[] } = {}): Promise<ProjectBid[]> {
  let q = supabaseAdmin.from('project_bids').select(BID_COLS).eq('project_id', projectId).order('offered_at', { ascending: false })
  if (opts.vesselIds) { if (!opts.vesselIds.length) return []; q = q.in('vessel_id', opts.vesselIds) }
  const { data } = await q
  return ((data ?? []) as any[]).map((b) => ({ ...b, vessel: Array.isArray(b.vessel) ? b.vessel[0] ?? null : b.vessel ?? null, gear: b.gear ?? [] })) as ProjectBid[]
}

export interface MyProject extends Project { bids_open: number; bids_accepted: number; bids_total: number }

/** The user's own projects with a bid tally each (a handful of rows; counted here, not in SQL). */
export async function listMyProjectsWithBids(userId: string): Promise<MyProject[]> {
  const projects = await listMyProjects(userId)
  if (!projects.length) return []
  const { data: bids } = await supabaseAdmin.from('project_bids').select('project_id, accepted_at, confirmed_at, declined_at, withdrawn_at').in('project_id', projects.map((p) => p.id))
  const tally = new Map<string, { open: number; accepted: number; total: number }>()
  for (const b of (bids ?? []) as any[]) {
    const t = tally.get(b.project_id) ?? { open: 0, accepted: 0, total: 0 }
    t.total++
    if (!b.accepted_at && !b.confirmed_at && !b.declined_at && !b.withdrawn_at) t.open++
    if ((b.accepted_at || b.confirmed_at) && !b.declined_at && !b.withdrawn_at) t.accepted++
    tally.set(b.project_id, t)
  }
  return projects.map((p) => { const t = tally.get(p.id) ?? { open: 0, accepted: 0, total: 0 }; return { ...p, bids_open: t.open, bids_accepted: t.accepted, bids_total: t.total } })
}

export interface MyBid extends ProjectBid { project: { id: string; slug: string; title: string; created_by: string | null; cruise_id: string | null } | null; cruise_slug: string | null }

/** Bids from vessels the user operates, newest first, with the project they are on. */
export async function listMyBids(userId: string): Promise<MyBid[]> {
  const vesselIds = await getOperatedVesselIds(userId)
  if (!vesselIds.length) return []
  const { data } = await supabaseAdmin.from('project_bids').select(`${BID_COLS}, project:projects(id, slug, title, created_by, cruise_id), cruise:cruises(slug)`).in('vessel_id', vesselIds).order('offered_at', { ascending: false })
  return ((data ?? []) as any[]).map((b) => ({
    ...b, vessel: Array.isArray(b.vessel) ? b.vessel[0] ?? null : b.vessel ?? null, gear: b.gear ?? [],
    project: Array.isArray(b.project) ? b.project[0] ?? null : b.project ?? null,
    cruise_slug: (Array.isArray(b.cruise) ? b.cruise[0] : b.cruise)?.slug ?? null,
  })) as MyBid[]
}
