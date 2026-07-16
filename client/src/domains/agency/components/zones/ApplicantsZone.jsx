import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { getApplicationDetails, getTimeline } from '../../api/agency';
import { PortfolioStrip } from './PortfolioStrip';
import { SectionSkeleton } from './SectionSkeleton';
import { buildProfileHydration } from './profileHydration';
import { SubmissionPackageDetails } from './SubmissionPackageDetails';
import './zones.css';

const formatDate = (ts) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const timeAgo = (ts) => {
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
};

export const ApplicantsZone = ({ applicationId, onProfileHydrated }) => {
  const [showAllTimeline, setShowAllTimeline] = useState(false);

  const appQuery = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationDetails(applicationId),
    enabled: !!applicationId,
  });

  const timelineQuery = useQuery({
    queryKey: ['timeline', applicationId],
    queryFn: () => getTimeline(applicationId),
    enabled: !!applicationId,
  });

  useEffect(() => {
    const { profile } = appQuery.data || {};
    if (!profile) return;
    const hydration = buildProfileHydration(profile, profile.images);
    if (hydration) {
      onProfileHydrated?.({
        ...hydration,
        matchScore: appQuery.data?.application?.match_score ?? null,
      });
    }
  }, [appQuery.data, onProfileHydrated]);

  if (appQuery.isLoading) {
    return (
      <div>
        <SectionSkeleton lines={1} height={72} />
        <SectionSkeleton lines={1} height={100} />
        <SectionSkeleton lines={3} />
        <SectionSkeleton lines={4} />
      </div>
    );
  }

  if (appQuery.isError) {
    return (
      <div className="zone-error">
        Couldn't load application details.
        <br />
        <button className="zone-error-retry" onClick={() => appQuery.refetch()}>Try again</button>
      </div>
    );
  }

  const { application, profile, submissionPackage } = appQuery.data || {};
  const images = profile?.images || [];
  const timeline = timelineQuery.data || [];
  const visibleTimeline = showAllTimeline ? timeline : timeline.slice(0, 5);

  return (
    <div>
      {application && (
        <div className="app-status-card">
          <div className="app-status-card-label">Submission status</div>
          <span className="app-status-text">{application.status}</span>
          <div className="app-status-card-date">Applied {formatDate(application.created_at)}</div>
        </div>
      )}

      {images.length > 0 && (
        <div className="zone-section">
          <div className="zone-section-header">
            {submissionPackage ? 'Submitted package' : 'Portfolio'}
          </div>
          <PortfolioStrip images={images} />
          <SubmissionPackageDetails
            submissionPackage={submissionPackage}
            compact
          />
        </div>
      )}

      <div className="zone-section">
        <div className="zone-section-header"><Clock size={13} /> Activity</div>
        {timeline.length === 0 ? (
          <p className="timeline-empty">No activity yet.</p>
        ) : (
          <div className="timeline-list">
            {visibleTimeline.map((entry, i) => (
              <div key={entry.id || i} className="timeline-entry">
                <Clock size={13} className="timeline-icon" />
                <span className="timeline-label">{entry.description || entry.action || entry.label}</span>
                <span className="timeline-time">{timeAgo(entry.created_at)}</span>
              </div>
            ))}
            {!showAllTimeline && timeline.length > 5 && (
              <button className="timeline-show-more" onClick={() => setShowAllTimeline(true)}>
                Show {timeline.length - 5} more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
