import DashboardContent from '../../../DashboardContent'
import { notFound, redirect } from 'next/navigation'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getProjectAsAdmin, getProjectGear, getProjectPeople, getEquipmentTypes, getProjectRoles } from '@/lib/projects'
import ProjectForm from '@/components/ProjectForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit project — VesselConnect', robots: { index: false, follow: false } }

async function EditProjectPage({ params }: { params: { slug: string } }) {
  const user = await getServerUser()
  if (!user) redirect(`/auth/signin?next=/dashboard/projects/${params.slug}/edit`)
  const project = await getProjectAsAdmin(params.slug)
  if (!project || project.source === 'demo') notFound()
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (project.created_by !== user.id && !profile?.is_admin) notFound()
  const [gear, people, equipmentTypes, roles] = await Promise.all([getProjectGear(project.id, true), getProjectPeople(project.id, true), getEquipmentTypes(), getProjectRoles()])
  return (
    <section className="mx-auto max-w-3xl rounded-2xl bg-white p-4 shadow-card sm:p-6">
        <h1 className="text-3xl font-bold text-navy leading-tight">Edit project</h1>
        <p className="text-sm text-gray-500 mt-1 mb-8">{project.published_at ? 'Published. Changes are visible to operators as soon as you save.' : 'Draft. Only you can see this until you publish.'}</p>
        <ProjectForm project={project} gear={gear} people={people} equipmentTypes={equipmentTypes} roles={roles} />
    </section>
  )
}

export default function Page({ params }: { params: { slug: string } }) {
  const href = `/dashboard/projects/${encodeURIComponent(params.slug)}/edit`
  return (
    <DashboardContent section="projects" currentPage={{ label: 'Edit project', href }}>
      <EditProjectPage params={params} />
    </DashboardContent>
  )
}
