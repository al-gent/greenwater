'use client'

// The vessel page's project row. Holds the loaded cards; pulls an older page of past
// projects from the API whenever the row is scrolled to its left edge.
import { useCallback, useState } from 'react'
import CardRow from '@/components/CardRow'
import ProjectCard from '@/components/ProjectCard'
import type { ProjectCardData } from '@/lib/project-cards'

export default function VesselProjectsRow({ vesselId, pastCards, upcomingCards, pastCruisesTotal, pastPagesLoaded, pastPageSize }: {
  vesselId: number; pastCards: ProjectCardData[]; upcomingCards: ProjectCardData[]; pastCruisesTotal: number; pastPagesLoaded: number; pastPageSize: number
}) {
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
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-navy">Projects</h2>
        <p className="text-xs text-gray-400">{loading ? 'Loading earlier…' : counts}</p>
      </div>
      <CardRow startIndex={past.length} cardWidth={300} onReachStart={morePast ? loadOlder : undefined}>
        {cards.map((x) => <ProjectCard key={x.project.id} {...x} showPhoto={false} />)}
      </CardRow>
    </section>
  )
}
