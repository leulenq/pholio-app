import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import PholioButton from '../../../shared/components/ui/PholioButton';
import { pholioToast } from '../../../shared/lib/pholio-toast';
import { talentApi } from '../api/talent';

const STALE_AFTER_DAYS = 90;
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

function daysSince(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function monthLabel(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'long' });
}

/**
 * Dashboard nudge (Discover WS9.2): when a talent's stats haven't been
 * touched in 90+ days, prompt a one-tap "still accurate?" confirm that
 * refreshes `measurements_updated_at` without editing any value, or a link to
 * the Measurements section to actually update them. Copy always says
 * "last updated" — never "confirmed" (only an agency's in-person
 * measurement earns that word).
 */
export function StatsCurrencyPrompt({ profile }) {
  const queryClient = useQueryClient();
  const shouldReduce = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const updatedAt = profile?.measurements_updated_at;
  const age = daysSince(updatedAt);

  if (dismissed || !updatedAt || age == null || age < STALE_AFTER_DAYS) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await talentApi.confirmMeasurementsCurrent();
      await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      pholioToast.success('Stats marked current');
      setDismissed(true);
    } catch (error) {
      pholioToast.error(error?.message || 'Could not update — try again');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <motion.div
      className="ov-stats-currency"
      initial={shouldReduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      role="status"
    >
      <p className="ov-stats-currency-copy">
        Stats last updated {monthLabel(updatedAt)} — still accurate?
      </p>
      <div className="ov-stats-currency-actions">
        <PholioButton variant="meta" tone="dark" onClick={handleConfirm} loading={confirming}>
          Still accurate
        </PholioButton>
        <PholioButton to="/dashboard/talent/profile?tab=appearance" variant="tertiary" tone="dark">
          Update stats
        </PholioButton>
      </div>
    </motion.div>
  );
}
