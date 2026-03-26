import { useAuth } from '../../auth/hooks/useAuth';

/**
 * useProfileStrength Hook
 * 
 * Provides a consolidated source for the "official" profile strength score
 * from the backend. This should be used for display in the Header, 
 * Overview, and Sidebar headers.
 */
export function useProfileStrength() {
  const { completeness, isLoading } = useAuth();

  return {
    score: completeness?.percentage ?? 0,
    label: completeness?.label ?? 'Beginner',
    nextSteps: completeness?.nextSteps ?? [],
    coreReady: completeness?.coreReady ?? false,
    isComplete: completeness?.isComplete ?? false,
    isLoading,
  };
}
