import React from 'react';
import { Link } from 'react-router-dom';
import { PholioIconButton } from '../../../shared/components/ui/PholioButton';

const APPEARANCE_URL = '/dashboard/talent/profile?tab=appearance';

function isPresent(val) {
  if (val === null || val === undefined || val === '') return false;
  if (typeof val === 'string') return val.trim() !== '';
  return true;
}

export function getMissingCompCardStats(profile) {
  const missing = [];
  if (!isPresent(profile?.eye_color)) missing.push('eye');
  if (!isPresent(profile?.hair_color)) missing.push('hair');
  if (!isPresent(profile?.shoe_size)) missing.push('shoe');
  return missing;
}

export function compCardStatsNudgeCopy(missing) {
  if (!missing.length) return null;

  const hasEye = missing.includes('eye');
  const hasHair = missing.includes('hair');
  const hasShoe = missing.includes('shoe');

  if (hasEye && hasHair && !hasShoe) {
    return 'Add eye and hair color so your card matches agency stats sheets.';
  }
  if (!hasEye && !hasHair && hasShoe) {
    return 'Your comp card stats block is missing shoe size.';
  }
  if (hasEye && !hasHair && !hasShoe) {
    return 'Your comp card stats block is missing eye color.';
  }
  if (!hasEye && hasHair && !hasShoe) {
    return 'Your comp card stats block is missing hair color.';
  }
  if (hasEye && hasHair && hasShoe) {
    return 'Add eye and hair color and shoe size so your card matches agency stats sheets.';
  }
  if (hasEye && !hasHair && hasShoe) {
    return 'Your comp card stats block is missing eye color and shoe size.';
  }
  if (!hasEye && hasHair && hasShoe) {
    return 'Your comp card stats block is missing hair color and shoe size.';
  }
  return 'Add appearance details so your card matches agency stats sheets.';
}

export default function CompCardStatsNudge({ profile }) {
  const [dismissed, setDismissed] = React.useState(false);

  const missing = React.useMemo(() => getMissingCompCardStats(profile), [profile]);
  const copy = compCardStatsNudgeCopy(missing);

  if (dismissed || !copy) return null;

  return (
    <div className="cc-stats-nudge" role="note">
      <p className="cc-stats-nudge__copy">
        {copy}{' '}
        <Link to={APPEARANCE_URL} className="cc-stats-nudge__link">
          Add to profile
        </Link>
      </p>
      <PholioIconButton
        label="Dismiss stats reminder"
        className="cc-stats-nudge__dismiss"
        onClick={() => setDismissed(true)}
      >
        ×
      </PholioIconButton>
    </div>
  );
}
