import { useMemo } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { calculateProfileStrength } from '../../../shared/utils/profileScoring';
import { buildReadinessLists } from '../components/profileReadinessItems';

/**
 * useProfileReadiness Hook
 *
 * Provides the "official" profile readiness score from the backend (score field)
 * and derives per-field gap data client-side for the audit UI.
 * Used by Header, Overview, and Sidebar headers.
 */
export function useProfileReadiness() {
  const { completeness, profile, images, isLoading } = useAuth();

  const auditData = useMemo(() => {
    const strength = calculateProfileStrength({ ...profile, images: images ?? [] });
    const { missingRequired, missingImprove, topGaps } = buildReadinessLists(
      strength.fieldCompletion,
      profile,
      images ?? [],
    );
    return {
      fieldCompletion: strength.fieldCompletion,
      isRequiredComplete: strength.isRequiredComplete,
      topGaps,
      totalGaps: missingRequired.length + missingImprove.length,
    };
  }, [profile, images]);

  return {
    score: completeness?.percentage ?? 0,
    label: completeness?.label ?? 'Beginner',
    nextSteps: completeness?.nextSteps ?? [],
    coreReady: completeness?.coreReady ?? false,
    isComplete: completeness?.isComplete ?? false,
    isLoading,
    fieldCompletion: auditData.fieldCompletion,
    topGaps: auditData.topGaps,
    totalGaps: auditData.totalGaps,
    isRequiredComplete: auditData.isRequiredComplete,
  };
}
