import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProfileDetails } from '../../api/agency';
import { PortfolioStrip } from './PortfolioStrip';
import { SectionSkeleton } from './SectionSkeleton';
import { buildProfileHydration } from './profileHydration';
import './zones.css';

export const DiscoverZone = ({ profileId, onProfileHydrated }) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['profile', profileId],
    queryFn: () => fetchProfileDetails(profileId),
    enabled: !!profileId,
  });

  useEffect(() => {
    const profile = data?.profile;
    if (!profile) return;
    const hydration = buildProfileHydration(profile, profile.images);
    if (hydration) onProfileHydrated?.(hydration);
  }, [data, onProfileHydrated]);

  if (isLoading) {
    return (
      <div>
        <SectionSkeleton lines={1} height={16} />
        <SectionSkeleton lines={1} height={100} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="zone-error">
        Couldn't load profile details.
        <br />
        <button className="zone-error-retry" onClick={() => refetch()}>Try again</button>
      </div>
    );
  }

  const profile = data?.profile || {};
  const images = profile.images || [];

  if (images.length === 0) return null;

  return (
    <div className="zone-section">
      <div className="zone-section-header">The book · {images.length} {images.length === 1 ? 'frame' : 'frames'}</div>
      <PortfolioStrip images={images} />
    </div>
  );
};
