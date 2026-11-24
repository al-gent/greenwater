import { organizationMatchReason, primaryOrganization, ROLE_PHRASE, type Vessel, type VesselOrganization } from '@/lib/vessel-utils'
import OrgName from './OrgName'

/**
 * A vessel's institution, plus why it matched an organization search when that
 * isn't the institution: "WHOI · owned by U.S. Navy". Null when there's nothing to show.
 */
export default function VesselOrgLine({ vessel, matched }: { vessel: Pick<Vessel, 'organizations'>; matched?: VesselOrganization[] }) {
  const shown = primaryOrganization(vessel)
  const reason = matched ? organizationMatchReason(vessel, matched) : null
  if (!shown && !reason) return null
  const phrase = reason ? ROLE_PHRASE[reason.role] : ''
  return (
    <>
      {shown && <OrgName org={shown} />}
      {reason && <>{shown ? ` · ${phrase} ` : `${phrase[0].toUpperCase()}${phrase.slice(1)} `}<OrgName org={reason} /></>}
    </>
  )
}
