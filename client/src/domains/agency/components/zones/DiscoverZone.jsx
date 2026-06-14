import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProfileDetails } from '../../api/agency';
import { PortfolioGrid } from './PortfolioGrid';
import { SectionSkeleton } from './SectionSkeleton';
import { buildProfileHydration } from './profileHydration';
import './zones.css';

const formatMeasurement = (val) => (val != null ? `${val} cm` : '—');

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
        <SectionSkeleton lines={4} height={120} />
        <SectionSkeleton lines={3} />
        <SectionSkeleton lines={1} height={44} />
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
  const hasAttributes = profile.eye_color || profile.hair_color || profile.nationality;

  return (
    <div>
      <div className="zone-section">
        <PortfolioGrid images={images} />
      </div>

      <div className="measure-strip">
        {[
          { label: 'Height', value: profile.height_cm },
          { label: 'Bust',   value: profile.bust_cm   },
          { label: 'Waist',  value: profile.waist_cm  },
          { label: 'Hips',   value: profile.hips_cm   },
        ].map(({ label, value }) => (
          <div key={label} className="measure-chip">
            <span className="measure-label">{label}</span>
            <span className="measure-value">{formatMeasurement(value)}</span>
          </div>
        ))}
      </div>

      {hasAttributes && (
        <div className="attr-row">
          {profile.eye_color && (
            <span className="attr-pill">
              <span className="attr-pill-label">Eyes</span>{profile.eye_color}
            </span>
          )}
          {profile.hair_color && (
            <span className="attr-pill">
              <span className="attr-pill-label">Hair</span>{profile.hair_color}
            </span>
          )}
          {profile.nationality && (
            <span className="attr-pill">
              <span className="attr-pill-label">Nationality</span>{profile.nationality}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
