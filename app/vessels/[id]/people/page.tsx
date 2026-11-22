import { notFound, redirect } from 'next/navigation'
import VesselPeopleForm, { type VesselAssignment } from '@/components/VesselPeopleForm'
import { canOperateVessel } from '@/lib/operators'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function VesselPeoplePage({ params }: { params: { id: string } }) {
  const vesselId = Number(params.id)
  if (!Number.isSafeInteger(vesselId) || vesselId <= 0) notFound()
  const viewer = createServerSupabaseClient()
  const { data: { user } } = await viewer.auth.getUser()
  if (!user) redirect(`/auth/signin?next=/vessels/${vesselId}/people`)
  if (!await canOperateVessel(user.id, vesselId)) notFound()
  const [vessel, roster] = await Promise.all([
    viewer.from('vessels').select('name').eq('id', vesselId).maybeSingle(),
    viewer.from('vessel_people').select('id,role,starts_on,ends_on,person:people!inner(id,name)').eq('vessel_id', vesselId)
      .order('starts_on', { ascending: false, nullsFirst: false }).order('id').returns<VesselAssignment[]>(),
  ])
  if (vessel.error || roster.error) throw Error('Could not load vessel people')
  if (!vessel.data) notFound()
  return <main className="page-gutter max-w-3xl pb-12 pt-28">
    <h1 className="text-3xl font-bold text-navy">Vessel people</h1>
    <p className="mt-2 text-sm text-gray-600">Record crew and contacts for {vessel.data.name}. Platform access is managed separately.</p>
    <VesselPeopleForm vesselId={vesselId} assignments={roster.data ?? []} />
  </main>
}
