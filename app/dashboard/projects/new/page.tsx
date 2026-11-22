import { newProject } from '@/lib/dashboard-navigation'
import ProjectForm from '@/components/ProjectForm'
import { getEquipmentTypes, getProjectRoles } from '@/lib/projects'
import DashboardContent from '../../DashboardContent'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Create a project | VesselConnect', robots: { index: false, follow: false } }

async function CreateProjectPanel() {
  const [equipmentTypes, roles] = await Promise.all([getEquipmentTypes(), getProjectRoles()])
  return (
    <section className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-4 shadow-card sm:p-6">
      <h1 className="text-2xl font-bold text-navy">Create a project</h1>
      <p className="mt-1 mb-8 text-sm text-gray-600">Describe the research you want to do. Publish it when you’re ready for operators to bid.</p>
      <ProjectForm equipmentTypes={equipmentTypes} roles={roles} />
    </section>
  )
}

export default function CreateProjectPage() {
  return <DashboardContent section="projects" currentPage={newProject}><CreateProjectPanel /></DashboardContent>
}
