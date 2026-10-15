// Server-only: turns a list of cruises into project cards (one per project aboard, in cruise order).
import type { CruiseListItem } from './cruises'
import { listProjectsForCruises, type BrowseProject } from './projects'

export interface ProjectCardData { project: BrowseProject; cruise: CruiseListItem | null; siblings: number }

export async function projectCardsForCruises(cruises: CruiseListItem[]): Promise<ProjectCardData[]> {
  if (!cruises.length) return []
  const projects = await listProjectsForCruises(cruises.map((c) => c.id))
  const order = new Map(cruises.map((c, i) => [c.id, i]))
  const byCruise = new Map(cruises.map((c) => [c.id, c]))
  const perCruise = new Map<string, number>()
  for (const p of projects) perCruise.set(p.cruise_id!, (perCruise.get(p.cruise_id!) ?? 0) + 1)
  return projects
    .sort((a, b) => (order.get(a.cruise_id!) ?? 0) - (order.get(b.cruise_id!) ?? 0))
    .map((project) => ({ project, cruise: byCruise.get(project.cruise_id!) ?? null, siblings: (perCruise.get(project.cruise_id!) ?? 1) - 1 }))
}
