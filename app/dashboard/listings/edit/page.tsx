import DashboardContent from '../../DashboardContent'
import VesselEditor from './VesselEditor'

export default function EditVesselPage({ searchParams }: { searchParams: { vessel?: string; welcome?: string } }) {
  const query = new URLSearchParams()
  if (searchParams.vessel) query.set('vessel', searchParams.vessel)
  if (searchParams.welcome) query.set('welcome', searchParams.welcome)
  const href = '/dashboard/listings/edit' + (query.size ? `?${query}` : '')
  return (
    <DashboardContent section="listings" currentPage={{ label: 'Edit vessel', href }}>
      <VesselEditor />
    </DashboardContent>
  )
}
