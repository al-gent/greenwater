import type { VesselOrganization } from '@/lib/vessel-utils'

/** An organization's acronym, with the full name on hover; the full name when there's no acronym. */
export default function OrgName({ org }: { org: Pick<VesselOrganization, 'name' | 'short_name'> }) {
  if (!org.short_name || org.short_name === org.name) return <>{org.name}</>
  return <span title={org.name}>{org.short_name}</span>
}
