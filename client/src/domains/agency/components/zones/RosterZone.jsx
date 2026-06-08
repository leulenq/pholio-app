import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRosterProfile } from '../../api/agency';
import { PortfolioGrid } from './PortfolioGrid';
import { SectionSkeleton } from './SectionSkeleton';
import { buildProfileHydration } from './profileHydration';
import './zones.css';

const formatMeasurement = (val) => (val != null ? `${val} cm` : '—');

const formatBookingDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatCurrency = (val) => {
  if (val === null || val === undefined) return '—';
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export const RosterZone = ({ profileId, onProfileHydrated, insight }) => {
  const profileQuery = useQuery({
    queryKey: ['roster-profile', profileId],
    queryFn: () => fetchRosterProfile(profileId),
    enabled: !!profileId,
  });

  useEffect(() => {
    const profile = profileQuery.data?.profile;
    if (!profile) return;
    const hydration = buildProfileHydration(profile, profile.images);
    if (hydration) onProfileHydrated?.(hydration);
  }, [profileQuery.data, onProfileHydrated]);

  if (profileQuery.isLoading) {
    return (
      <div>
        <SectionSkeleton lines={4} height={120} />
        <SectionSkeleton lines={1} height={44} />
        <SectionSkeleton lines={1} height={72} />
        <SectionSkeleton lines={3} />
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="zone-error">
        Couldn't load profile.
        <br />
        <button className="zone-error-retry" onClick={() => profileQuery.refetch()}>Try again</button>
      </div>
    );
  }

  const { profile, bookings } = profileQuery.data || {};
  const images = profile?.images || [];

  return (
    <div>
      {insight && (
        <div className={`zone-advisory zone-advisory--${insight.type}`}>
          <div className="zone-advisory-accent" />
          <div className="zone-advisory-body">
            <span className="zone-advisory-label">
              {insight.type === 'attention' ? 'Attention' : insight.type === 'opportunity' ? 'Opportunity' : 'Growth'}
            </span>
            <p className="zone-advisory-text">{insight.text}</p>
          </div>
        </div>
      )}

      <div className="zone-section">
        <PortfolioGrid images={images} />
      </div>

      <div className="measure-strip">
        {[
          { label: 'Height', value: profile?.height_cm },
          { label: 'Bust',   value: profile?.bust_cm   },
          { label: 'Waist',  value: profile?.waist_cm  },
          { label: 'Hips',   value: profile?.hips_cm   },
        ].map(({ label, value }) => (
          <div key={label} className="measure-chip">
            <span className="measure-label">{label}</span>
            <span className="measure-value">{formatMeasurement(value)}</span>
          </div>
        ))}
      </div>

      <div className="booking-summary">
        <div className="booking-stat">
          <span className="booking-stat-label">Last Booking</span>
          <span className="booking-stat-value">{formatBookingDate(bookings?.last_booking_date)}</span>
        </div>
        <div className="booking-stat">
          <span className="booking-stat-label">Total Bookings</span>
          <span className="booking-stat-value">{bookings?.total_bookings ?? '—'}</span>
        </div>
        <div className="booking-stat">
          <span className="booking-stat-label">Commission</span>
          <span className="booking-stat-value">{formatCurrency(bookings?.commission_earned)}</span>
        </div>
      </div>
    </div>
  );
};
