import DashboardContent from '../DashboardContent'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vessel Watchlist — VesselConnect', robots: { index: false, follow: false } }

export default function FleetPage({ searchParams }: { searchParams: { scale?: string; at?: string } }) {
  return <DashboardContent section="fleet" scale={searchParams.scale} at={searchParams.at} />
}
