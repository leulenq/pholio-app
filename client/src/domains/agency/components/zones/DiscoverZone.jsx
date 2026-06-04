import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProfileDetails } from '../../api/agency';
import { PortfolioGrid } from './PortfolioGrid';
import { SectionSkeleton } from './SectionSkeleton';
import './zones.css';

const formatMeasurement = (val) => (val != null ? `${val} cm` : '—');

export const DiscoverZone = ({ profileId, onImagesLoaded }) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['profile', profileId],
    queryFn: () => fetchProfileDetails(profileId),
    enabled: !!profileId,
  });

  // Hydrate hero carousel once images are available
  useEffect(() => {
    if (data?.profile?.images?.length > 0) {
      onImagesLoaded?.(data.profile.images);
    }
  }, [data, onImagesLoaded]);

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
  const bio = profile.bio_curated || profile.bio_raw;
  // Columns are flat: height_cm, bust_cm, waist_cm, hips_cm (integers in cm)
  const hasAttributes = profile.eye_color || profile.hair_color || profile.nationality;

  return (
    <div>
      {/* Portfolio Grid */}
      <div className="zone-section">
        <PortfolioGrid images={images} />
      </div>

      {/* Bio */}
      {bio && (
        <div className="zone-section">
          <div className="zone-section-header">Bio</div>
          <p className="zone-bio">{bio}</p>
        </div>
      )}

      {/* Measurements — flat columns from profiles table */}
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

      {/* Attributes */}
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
