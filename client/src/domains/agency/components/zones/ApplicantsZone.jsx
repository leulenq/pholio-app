import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApplicationDetails } from '../../api/agency';
import { PortfolioStrip } from './PortfolioStrip';
import { SectionSkeleton } from './SectionSkeleton';
import { buildProfileHydration } from './profileHydration';
import { SubmissionPackageDetails } from './SubmissionPackageDetails';
import './zones.css';

export const ApplicantsZone = ({ applicationId, onProfileHydrated }) => {
  const appQuery = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => getApplicationDetails(applicationId),
    enabled: !!applicationId,
  });

  useEffect(() => {
    const { profile, application } = appQuery.data || {};
    if (!profile) return;
    const hydration = buildProfileHydration(profile, profile.images);
    if (hydration) {
      onProfileHydrated?.({
        ...hydration,
        status: application?.status ?? null,
      });
    }
  }, [appQuery.data, onProfileHydrated]);

  if (appQuery.isLoading) {
    return (
      <div>
        <SectionSkeleton lines={1} height={16} />
        <SectionSkeleton lines={1} height={100} />
        <SectionSkeleton lines={3} />
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

  const { profile, submissionPackage } = appQuery.data || {};
  const images = profile?.images || [];

  return (
    <div>
      {images.length > 0 && (
        <div className="zone-section">
          <div className="zone-section-header">
            {submissionPackage ? 'Submitted book' : 'The book'} · {images.length} {images.length === 1 ? 'frame' : 'frames'}
          </div>
          <PortfolioStrip images={images} />
        </div>
      )}

      {submissionPackage && (
        <div className="zone-section">
          <div className="zone-section-header">Comp card &amp; submission</div>
          <SubmissionPackageDetails submissionPackage={submissionPackage} compact />
        </div>
      )}
    </div>
  );
};
