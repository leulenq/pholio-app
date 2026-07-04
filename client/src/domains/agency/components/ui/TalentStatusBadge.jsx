import React from 'react';
import './TalentStatusBadge.css';

/**
 * TalentStatusBadge — calm, static status indicator (no pulsing dot).
 * @param {Object} props
 * @param {string} props.status
 * @param {boolean} [props.onDark] - render for a dark/portrait background
 */
const STATUS = {
  available:   { label: 'Available',    tone: 'sage' },
  booking:     { label: 'On Booking',   tone: 'gold' },
  hold:        { label: 'On Hold',      tone: 'slate' },
  submitted:   { label: 'Submitted',    tone: 'slate' },
  underReview: { label: 'Under Review', tone: 'gold' },
  shortlisted: { label: 'Shortlisted',  tone: 'ink' },
  booked:      { label: 'Represented',  tone: 'sage' },
  represented: { label: 'Represented',  tone: 'sage' },
  accepted:    { label: 'Signed',       tone: 'sage' },
  development: { label: 'New Face',     tone: 'sage' },
  declined:    { label: 'Passed',       tone: 'muted' },
  inactive:    { label: 'Inactive',     tone: 'muted' },
};

export const TalentStatusBadge = ({ status, onDark }) => {
  if (!status) return null;
  const s = STATUS[status] || STATUS.available;
  return (
    <span className={`ts-badge ts-badge--${s.tone}${onDark ? ' ts-badge--on-dark' : ''}`}>
      {s.label}
    </span>
  );
};
