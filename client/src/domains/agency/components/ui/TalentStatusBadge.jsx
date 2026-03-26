import React from 'react';

/**
 * TalentStatusBadge — Unified status indicator with animated dot.
 * @param {Object} props
 * @param {'available' | 'submitted' | 'underReview' | 'shortlisted' | 'booked' | 'inactive'} props.status
 */
export const TalentStatusBadge = ({ status }) => {
  if (!status) return null;

  const config = {
    available:   { label: 'Available',    dot: '#16a34a', pulse: true,  bg: 'rgba(22, 163, 74, 0.08)',  text: '#15803D' },
    submitted:   { label: 'Submitted',    dot: '#64748b', pulse: false, bg: 'rgba(100, 116, 139, 0.08)', text: '#475569' },
    underReview: { label: 'Under Review', dot: '#C9A55A', pulse: false, bg: 'rgba(201, 165, 90, 0.08)',  text: '#8A6E30' },
    shortlisted: { label: 'Shortlisted', dot: '#0f172a', pulse: false, bg: 'rgba(15, 23, 42, 0.08)',   text: '#0f172a' },
    booked:      { label: 'On Booking',   dot: '#10b981', pulse: false, bg: 'rgba(16, 185, 129, 0.08)', text: '#065F46' },
    inactive:    { label: 'Inactive',     dot: '#94a3b8', pulse: false, bg: 'rgba(148, 163, 184, 0.08)', text: '#64748B' },
  };

  const style = config[status] || config.available;

  return (
    <span 
      className={`ts-badge ts-badge--${status}`}
      style={{
        fontSize: '12px',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '20px',
        background: style.bg,
        color: style.text,
        whiteSpace: 'nowrap'
      }}
    >
      <span
        className="ts-dot" 
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: style.dot,
          animation: style.pulse ? 'ts-pulse 1.8s infinite ease-in-out' : 'none'
        }}
      />
      {style.label}
    </span>
  );
};
