import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerUser } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getProjectAsAdmin, getProjectGear, getProjectPeople, getEquipmentTypes, getProjectRoles } from '@/lib/projects'
import ProjectForm from '@/components/ProjectForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit project — VesselConnect', robots: { index: false, follow: false } }

export default async function EditProjectPage({ params }: { params: { slug: string } }) {
  const user = await getServerUser()
  if (!user) redirect(`/auth/signin?next=/projects/${params.slug}/edit`)
  const project = await getProjectAsAdmin(params.slug)
  if (!project) notFound()
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (project.created_by !== user.id && !profile?.is_admin) notFound()
  const [gear, people, equipmentTypes, roles] = await Promise.all([getProjectGear(project.id, true), getProjectPeople(project.id, true), getEquipmentTypes(), getProjectRoles()])
  return (
    <div className="pt-[88px] bg-white min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <p className="text-sm text-gray-400 mb-2"><Link href={`/projects/${project.slug}`} className="hover:text-navy">← Back to the project</Link></p>
        <h1 className="text-3xl font-bold text-navy leading-tight">Edit project</h1>
        <p className="text-sm text-gray-500 mt-1 mb-8">{project.published_at ? 'Published. Changes are visible to operators as soon as you save.' : 'Draft. Only you can see this until you publish.'}</p>
        <ProjectForm project={project} gear={gear} people={people} equipmentTypes={equipmentTypes} roles={roles} />
      </div>
    </div>
  )
}
