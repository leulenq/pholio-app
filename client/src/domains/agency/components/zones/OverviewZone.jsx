import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApplicationDetails } from '../../api/agency';
import { PortfolioStrip } from './PortfolioStrip';
import { SectionSkeleton } from './SectionSkeleton';
import './zones.css';

const daysAgo = (ts) => {
  const diff = Date.now() - new Date(ts).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
};

const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—';

export const OverviewZone = ({ applicationId, onImagesLoaded }) => {
  const appQuery = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationDetails(applicationId),
    enabled: !!applicationId,
  });

  // Hydrate hero carousel once images are available
  useEffect(() => {
    if (appQuery.data?.profile?.images?.length > 0) {
      onImagesLoaded?.(appQuery.data.profile.images);
    }
  }, [appQuery.data, onImagesLoaded]);

  if (appQuery.isLoading) {
    return (
      <div>
        <SectionSkeleton lines={1} height={44} />
        <SectionSkeleton lines={1} height={100} />
        <SectionSkeleton lines={3} />
        <SectionSkeleton lines={3} />
      </div>
    );
  }

  if (appQuery.isError) {
    return (
      <div className="zone-error">
        Couldn't load details.
        <br />
        <button className="zone-error-retry" onClick={() => appQuery.refetch()}>Try again</button>
      </div>
    );
  }

  const { application, profile } = appQuery.data || {};
  const images = profile?.images || [];
  const bio = profile?.bio_curated || profile?.bio_raw;
  const matchScore = application?.match_score;

  return (
    <div>
      {/* Quick Stats */}
      <div className="quick-stats">
        <div className="quick-stat">
          <span className="quick-stat-label">Status</span>
          <span className="quick-stat-value">{capitalize(application?.status)}</span>
        </div>
        <div className="quick-stat">
          <span className="quick-stat-label">Match</span>
          <span className="quick-stat-value">
            {matchScore != null ? `${Math.round(matchScore)}%` : '—'}
          </span>
        </div>
        <div className="quick-stat">
          <span className="quick-stat-label">Days Active</span>
          <span className="quick-stat-value">
            {application?.created_at ? daysAgo(application.created_at) : '—'}
          </span>
        </div>
      </div>

      {/* Portfolio Strip */}
      {images.length > 0 && (
        <div className="zone-section">
          <div className="zone-section-header">Portfolio</div>
          <PortfolioStrip images={images} />
        </div>
      )}

      {/* Bio */}
      {bio && (
        <div className="zone-section">
          <div className="zone-section-header">Bio</div>
          <p className="zone-bio">{bio}</p>
        </div>
      )}
    </div>
  );
};
