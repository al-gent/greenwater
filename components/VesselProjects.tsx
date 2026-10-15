import { getUpcomingCruises, getPastCruises } from '@/lib/cruises'
import { projectCardsForCruises } from '@/lib/project-cards'
import VesselProjectsRow from '@/components/VesselProjectsRow'

const PAST_PAGE = 12

/**
 * The research this vessel has done, is doing, and will do, as one row of project cards in
 * date order. Server-renders every upcoming project and the last page of past ones; the row
 * loads older pages as you scroll left. Renders nothing for a vessel with no cruises.
 */
export default async function VesselProjects({ vesselId }: { vesselId: number }) {
  const [upcoming, past] = await Promise.all([getUpcomingCruises({ vesselId }), getPastCruises({ vesselId, page: 1, limit: PAST_PAGE })])
  if (!upcoming.length && !past.cruises.length) return null
  const [pastCards, upcomingCards] = await Promise.all([projectCardsForCruises([...past.cruises].reverse()), projectCardsForCruises(upcoming)])
  return (
    <VesselProjectsRow
      vesselId={vesselId}
      pastCards={pastCards} upcomingCards={upcomingCards}
      pastCruisesTotal={past.total} pastPagesLoaded={1} pastPageSize={PAST_PAGE}
    />
  )
}
