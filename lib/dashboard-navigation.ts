export type DashboardSection = 'projects' | 'listings' | 'fleet'
export type DashboardPage = { label: string; href: string }

export const newProject = { label: 'New Project', href: '/dashboard/projects/new' }
export const listVessel = { label: 'List a vessel', href: '/dashboard/listings/new' }
export const claimVessel = { label: 'Claim a vessel', href: '/dashboard/listings/claim' }

export type AdminTab = 'profileLinks' | 'analytics' | 'submissions' | 'claims' | 'scientists' | 'vessels' | 'messages' | 'changes'
export const ADMIN_TABS: { key: AdminTab; label: string }[] = [
  { key: 'analytics', label: 'Analytics' }, { key: 'submissions', label: 'Submissions' }, { key: 'claims', label: 'Operators' },
  { key: 'scientists', label: 'Users' }, { key: 'profileLinks', label: 'Profile links' }, { key: 'vessels', label: 'Vessels' }, { key: 'messages', label: 'All Messages' }, { key: 'changes', label: 'Changes' },
]

export function getDashboardTab(tab: string | null | undefined, admin: boolean, operator: boolean) {
  if (tab === 'listings' || tab === 'projects' || tab === 'messages' || tab === 'profile') return tab
  const adminTab = admin && ADMIN_TABS.find(item => tab === `admin:${item.key}`)
  if (adminTab) return `admin:${adminTab.key}` as const
  return admin ? 'admin:analytics' : operator ? 'listings' : 'projects'
}
