import React from 'react';
import './zones.css';

export const SectionSkeleton = ({ lines = 3, height = 14 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className="skel-block"
        style={{ height, width: i === lines - 1 ? '60%' : '100%' }}
      />
    ))}
  </div>
);
