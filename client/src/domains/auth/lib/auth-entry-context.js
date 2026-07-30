import { createContext } from 'react';

/**
 * Control surface for the app-level post-login transition. Provided by
 * AuthEntryTransitionProvider; read through the hooks in
 * `domains/auth/hooks/useAuthEntry.js`.
 */
export const AuthEntryContext = createContext(null);

/**
 * A destination shell only *reports* to the transition, so rendering one
 * without the provider (unit tests, the splash preview route) is legitimate and
 * must not throw the way an entry point calling useAuthEntry would.
 */
export const INERT_ENTRY = {
  isEntryActive: false,
  startEntryTransition: () => {},
  cancelEntryTransition: () => {},
  reportEntryReady: () => {},
  reportEntryIdentity: () => {},
};
