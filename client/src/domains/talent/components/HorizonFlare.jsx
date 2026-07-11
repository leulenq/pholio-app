import React, { useId } from 'react';
import { motion } from 'framer-motion';
import './HorizonFlare.css';

/**
 * HorizonFlare - Pholio's canonical AI Curation icon.
 * Features a horizontal gold-gradient divider sweep with a centered vertical marquise flare.
 *
 * @param {boolean} evaluating - Toggles the active breathing animation cycle.
 * @param {boolean} hoverable - Enables hover scaling and drop-shadow glow effects.
 * @param {string} className - Additional CSS class names.
 * @param {object} style - Inline styles.
 */
export default function HorizonFlare({
  evaluating = false,
  hoverable = true,
  className = '',
  style = {},
  onClick,
  ...props
}) {
  const gradientId = useId();

  // Canonical Framer Motion Spring config (stiffness: 55, damping: 16)
  const springConfig = { stiffness: 55, damping: 16 };

  // When given an onClick, this is an interactive control and must be
  // reachable by the accessibility tree and keyboard, not presentation.
  const interactive = typeof onClick === 'function';
  const handleKeyDown = interactive
    ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(event);
        }
      }
    : undefined;

  return (
    <div
      className={`horizon-flare-container ${hoverable ? 'is-hoverable' : ''} ${evaluating ? 'is-evaluating' : ''} ${className}`}
      style={style}
      role={interactive ? 'button' : 'presentation'}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      {...props}
    >
      <svg 
        viewBox="0 0 100 40" 
        className="horizon-flare-svg"
      >
        <defs>
          <linearGradient id={`g-horizon-${gradientId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--ag-gold)" stopOpacity="0" />
            <stop offset="40%" stopColor="var(--ag-gold)" stopOpacity="0.8" />
            <stop offset="50%" stopColor="var(--ag-gold)" stopOpacity="1" />
            <stop offset="60%" stopColor="var(--ag-gold)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--ag-gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Horizontal Divider Line Sweep */}
        <motion.line 
          className="horizon-flare-line"
          x1="5" 
          y1="20" 
          x2="95" 
          y2="20" 
          stroke={`url(#g-horizon-${gradientId})`} 
          strokeWidth="1.5" 
          strokeLinecap="round"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ type: "spring", ...springConfig, delay: 0.1 }}
        />
        
        {/* Centered Vertical Marquise Curation Flare */}
        <motion.path 
          className="horizon-flare-core"
          d="M 50 8 C 50 16, 46.5 20, 50 32 C 50 24, 53.5 20, 50 8 Z"
          fill="currentColor"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ 
            scaleY: evaluating ? [1, 1.15, 1] : 1,
            opacity: evaluating ? [1, 0.5, 1] : 1
          }}
          transition={evaluating ? {
            repeat: Infinity,
            duration: 1.2,
            ease: "easeInOut"
          } : { type: "spring", ...springConfig }}
        />
      </svg>
    </div>
  );
}
