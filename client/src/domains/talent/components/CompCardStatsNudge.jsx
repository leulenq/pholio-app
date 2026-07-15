import React from 'react';
import { Link } from 'react-router-dom';
import { PholioIconButton } from '../../../shared/components/ui/PholioButton';
import { compCardStatsNudgeCopy, getMissingCompCardStats } from './compCardStatsNudgeHelpers';

const APPEARANCE_URL = '/dashboard/talent/profile?tab=appearance';

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
