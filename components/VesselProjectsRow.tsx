'use client'

// The vessel page's project row. Holds the loaded cards; pulls an older page of past
// projects from the API whenever the row is scrolled to its left edge.
import { useCallback, useId, useState, type ReactNode } from 'react'
import CardRow from '@/components/CardRow'
import ProjectCard from '@/components/ProjectCard'
import type { ProjectCardData } from '@/lib/project-cards'

export default function VesselProjectsRow({ vesselId, pastCards, upcomingCards, pastCruisesTotal, pastPagesLoaded, pastPageSize, timeline }: {
  vesselId: number; pastCards: ProjectCardData[]; upcomingCards: ProjectCardData[]; pastCruisesTotal: number; pastPagesLoaded: number; pastPageSize: number; timeline: ReactNode
}) {
  const [view, setView] = useState<'projects' | 'timeline'>('projects')
  const viewId = useId()
  const [past, setPast] = useState(pastCards)
  const [pages, setPages] = useState(pastPagesLoaded)
  const [loading, setLoading] = useState(false)
  const morePast = pages * pastPageSize < pastCruisesTotal

  const loadOlder = useCallback(async () => {
    if (loading || !morePast) return 0
    setLoading(true)
    try {
      const r = await fetch(`/api/vessels/${vesselId}/projects?page=${pages + 1}`)
      if (!r.ok) return 0
      const d = await r.json() as { cards: ProjectCardData[] }
      setPast((cur) => [...d.cards, ...cur])
      setPages((n) => n + 1)
      return d.cards.length
    } finally { setLoading(false) }
  }, [loading, morePast, vesselId, pages])

  const cards = [...past, ...upcomingCards]
  const counts = [past.length ? `${past.length}${morePast ? '+' : ''} past` : null, upcomingCards.length ? `${upcomingCards.length} upcoming` : null].filter(Boolean).join(' · ')
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-navy">Projects</h2>
        <div className="inline-flex rounded-xl border border-gray-200 p-0.5 bg-gray-50" role="group" aria-label="Vessel research view">
          {(['projects', 'timeline'] as const).map((option) => (
            <button key={option} type="button" aria-pressed={view === option} aria-controls={viewId} onClick={() => setView(option)}
              className={`px-3 py-1.5 rounded-[10px] text-sm font-medium transition-colors ${view === option ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-navy'}`}>
              {option === 'projects' ? 'Projects' : 'Timeline'}
            </button>
          ))}
        </div>
      </div>
      <div id={viewId}>
        {view === 'projects' ? (
          <>
            <p className="text-xs text-gray-400 mb-1" aria-live="polite">{loading ? 'Loading earlier…' : counts}</p>
            <CardRow startIndex={past.length} cardWidth={300} onReachStart={morePast ? loadOlder : undefined}>
              {cards.map((card) => <ProjectCard key={card.project.id} {...card} showPhoto={false} />)}
            </CardRow>
          </>
        ) : timeline}
      </div>
    </section>
  )
}
