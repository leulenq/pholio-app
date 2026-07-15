import { createContext, useContext } from 'react';

export const AgencyPermissionsContext = createContext({
  permissions: [],
  presetRole: null,
  membershipId: null,
  can: () => false,
  canAny: () => false,
  canAll: () => false,
});

export function useAgencyPermissionsContext() {
  return useContext(AgencyPermissionsContext);
}
