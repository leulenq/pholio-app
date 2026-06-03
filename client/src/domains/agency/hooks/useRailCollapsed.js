import { useCallback, useEffect, useState } from 'react';

const KEY = 'pholio.agency.railCollapsed';

export function useRailCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  return { collapsed, toggle };
}
