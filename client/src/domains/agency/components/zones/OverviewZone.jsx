import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApplicationDetails } from '../../api/agency';
import { PortfolioStrip } from './PortfolioStrip';
import { SectionSkeleton } from './SectionSkeleton';
import { buildProfileHydration } from './profileHydration';
import './zones.css';

export const OverviewZone = ({ applicationId, onProfileHydrated }) => {
  const appQuery = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationDetails(applicationId),
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
        <SectionSkeleton lines={1} height={100} />
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

  const { profile } = appQuery.data || {};
  const images = profile?.images || [];

  return (
    <div>
      {images.length > 0 && (
        <div className="zone-section">
          <div className="zone-section-header">Portfolio</div>
          <PortfolioStrip images={images} />
        </div>
      )}
    </div>
  );
};
