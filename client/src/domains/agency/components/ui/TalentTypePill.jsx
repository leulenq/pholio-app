import React from 'react';

/**
 * TalentTypePill — Shared component for talent archetype display.
 * @param {Object} props
 * @param {'editorial' | 'runway' | 'commercial' | 'fitness' | 'plus'} props.type
 * @param {boolean} props.dark - If true, uses light text on dark background (for dark card overlays).
 */
export const TalentTypePill = ({ type, dark }) => {
  if (!type) return null;

  const config = {
    editorial:  { text: '#7C3AED', bg: 'rgba(124,58,237,0.09)' },
    commercial: { text: '#047857', bg: 'rgba(4,120,87,0.09)' },
    runway:    { text: '#9A7030', bg: 'rgba(201,165,90,0.12)' },
    fitness:    { text: '#1D4ED8', bg: 'rgba(29,78,216,0.09)' },
    plus:       { text: '#B91C1C', bg: 'rgba(185,28,28,0.08)' },
  };

  const style = config[type.toLowerCase()] || config.editorial;

  const pillStyle = dark 
    ? {
        color: 'rgba(255, 255, 255, 0.85)',
        background: 'rgba(255, 255, 255, 0.07)',
        backdropFilter: 'blur(4px)',
      }
    : {
        color: style.text,
        background: style.bg,
      };

  return (
    <span 
      className="talent-type-pill"
      style={{
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '3px 8px',
        borderRadius: '20px',
        display: 'inline-flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
        ...pillStyle
      }}
    >
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
};
