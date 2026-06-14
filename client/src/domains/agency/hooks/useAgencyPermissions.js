import { useAgencyPermissions } from '../context/AgencyPermissionsProvider';

export { useAgencyPermissions };

export function useCanManageTeam() {
  const { canAny } = useAgencyPermissions();
  return canAny(['team.invite', 'team.assign_role', 'team.deactivate']);
}

export function useCanManageOrg() {
  const { canAny } = useAgencyPermissions();
  return canAny(['org.edit_profile', 'org.edit_branding', 'org.edit_settings']);
}
