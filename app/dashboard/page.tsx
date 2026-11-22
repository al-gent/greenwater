import { permanentRedirect } from 'next/navigation'
import DashboardContent from './DashboardContent'

export const dynamic = 'force-dynamic'

export default function DashboardPage({ searchParams }: { searchParams: { tab?: string } }) {
  if (searchParams.tab === 'listings') permanentRedirect('/dashboard/listings')
  return <DashboardContent tab={searchParams.tab} />
}
