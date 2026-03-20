import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * TalentMatchRing — Shared radial progress indicator for match scores.
 * @param {Object} props
 * @param {number} props.score - 0-100
 * @param {'sm' | 'md'} props.size - sm: 32px, md: 44px
 */
export const TalentMatchRing = ({ score = 0, size = 'sm' }) => {
  const [val, setVal] = useState(0);
  
  const outerSize = size === 'md' ? 44 : 32;
  const strokeWidth = 2.5;
  const center = outerSize / 2;
  const radius = (outerSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const timer = setTimeout(() => setVal(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  const getColor = (s) => {
    if (s >= 90) return '#C9A55A';
    if (s >= 75) return 'rgba(201, 165, 90, 0.6)';
    return '#94a3b8';
  };

  const color = getColor(score);
  const offset = circumference - (val / 100) * circumference;

  return (
    <div 
      className={`talent-match-ring talent-match-ring--${size}`}
      style={{ 
        position: 'relative', 
        width: outerSize, 
        height: outerSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <svg width={outerSize} height={outerSize} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDasharray: circumference, strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            filter: score >= 90 ? 'drop-shadow(0 0 3px rgba(201,165,90,0.4))' : 'none'
          }}
        />
      </svg>
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size === 'md' ? '11px' : '9px',
          fontWeight: 700,
          color: color,
          fontFamily: 'sans-serif'
        }}
      >
        {Math.round(score)}
      </div>
    </div>
  );
};
