import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import { getEquipmentTypes, getProjectRoles } from '@/lib/projects'
import ProjectForm from '@/components/ProjectForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New project — VesselConnect', robots: { index: false, follow: false } }

export default async function NewProjectPage() {
  const user = await getServerUser()
  if (!user) redirect('/auth/signin?next=/projects/new')
  const [equipmentTypes, roles] = await Promise.all([getEquipmentTypes(), getProjectRoles()])
  return (
    <div className="pt-[88px] bg-white min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <h1 className="text-3xl font-bold text-navy leading-tight">New project</h1>
        <p className="text-sm text-gray-500 mt-1 mb-8">Describe the research you want to do. Publish it when you&apos;re ready for operators to bid.</p>
        <ProjectForm equipmentTypes={equipmentTypes} roles={roles} />
      </div>
    </div>
  )
}
