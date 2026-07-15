import { useAgencyPermissionsContext } from '../context/agency-permissions-context';

export const useAgencyPermissions = useAgencyPermissionsContext;

export function useCanManageTeam() {
  const { canAny } = useAgencyPermissions();
  return canAny(['team.invite', 'team.assign_role', 'team.deactivate']);
}

export function useCanManageOrg() {
  const { canAny } = useAgencyPermissions();
  return canAny(['org.edit_profile', 'org.edit_branding', 'org.edit_settings']);
}
