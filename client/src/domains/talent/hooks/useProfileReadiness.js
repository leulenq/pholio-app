import { useMemo } from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { calculateProfileStrength, getReadinessThreshold } from '../../../shared/utils/profileScoring';
import { buildReadinessLists } from '../components/profileReadinessItems';

/**
 * Derives the factual submission checklist plus the 0–100 readiness score that
 * anchors the sidebar and the overview card. `threshold` carries the band label
 * ("In progress" / "Core complete" / "Submission-ready") and the numeral tone;
 * neither is ever rendered as a badge or pill.
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
    const threshold = getReadinessThreshold(strength.score);
    return {
      score: threshold.value,
      threshold,
      fieldCompletion: strength.fieldCompletion,
      isRequiredComplete: strength.isRequiredComplete,
      topGaps,
      totalGaps: missingRequired.length + missingImprove.length,
      missingRequiredCount: missingRequired.length,
    };
  }, [profile, images]);

  return {
    isLoading,
    score: auditData.score,
    threshold: auditData.threshold,
    thresholdLabel: auditData.threshold.label,
    fieldCompletion: auditData.fieldCompletion,
    topGaps: auditData.topGaps,
    totalGaps: auditData.totalGaps,
    missingRequiredCount: auditData.missingRequiredCount,
    isRequiredComplete: auditData.isRequiredComplete,
  };
}
