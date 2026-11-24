import type { VesselOrganization } from '@/lib/vessel-utils'

/** What the site shows for an organization: its display_name (NOAA, UNOLS) with the full name on hover, else the full name. */
export default function OrgName({ org }: { org: Pick<VesselOrganization, 'name' | 'display_name'> }) {
  if (!org.display_name || org.display_name === org.name) return <>{org.name}</>
  return <span title={org.name}>{org.display_name}</span>
}
