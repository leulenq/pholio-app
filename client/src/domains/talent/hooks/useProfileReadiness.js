import { useMemo } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { calculateProfileStrength } from '../../../shared/utils/profileScoring';
import { buildReadinessLists } from '../components/profileReadinessItems';

/**
 * Derives factual submission requirements and optional profile context.
 * No percentage or qualitative strength label is exposed.
 */
export function useProfileReadiness() {
  const { profile, images, isLoading } = useAuth();

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
      missingRequiredCount: missingRequired.length,
    };
  }, [profile, images]);

  return {
    isLoading,
    fieldCompletion: auditData.fieldCompletion,
    topGaps: auditData.topGaps,
    totalGaps: auditData.totalGaps,
    missingRequiredCount: auditData.missingRequiredCount,
    isRequiredComplete: auditData.isRequiredComplete,
  };
}
