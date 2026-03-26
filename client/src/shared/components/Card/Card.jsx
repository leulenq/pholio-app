import React from 'react';
import './Card.css';

export const Card = ({ children, className = '', padding = 'default' }) => {
  const paddingClass = {
    small: 'cardPaddingSmall',
    default: 'cardPaddingDefault',
    large: 'cardPaddingLarge'
  }[padding] || 'cardPaddingDefault';

  return (
    <div className={`card ${paddingClass} ${className}`}>
      {children}
    </div>
  );
};
