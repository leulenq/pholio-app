import { useMemo } from 'react';
import { AgencyPermissionsContext } from './agency-permissions-context';

export function AgencyPermissionsProvider({ session, children }) {
  const value = useMemo(() => {
    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    const set = new Set(permissions);

    return {
      permissions,
      presetRole: session?.presetRole || session?.agencyMembershipRole || null,
      membershipId: session?.agencyMembershipId || null,
      can: (key) => set.has(key),
      canAny: (keys) => keys.some((k) => set.has(k)),
      canAll: (keys) => keys.every((k) => set.has(k)),
    };
  }, [session]);

  return (
    <AgencyPermissionsContext.Provider value={value}>
      {children}
    </AgencyPermissionsContext.Provider>
  );
}
