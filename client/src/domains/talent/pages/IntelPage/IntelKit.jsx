import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Lock, Radio } from 'lucide-react';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import { SECTION_EASE } from './intelUtils';

/**
 * A full-width Intel zone that reveals on scroll. Reduced motion collapses the
 * spring travel to a plain crossfade. Title accepts JSX so instruments can gild
 * a word with <em>.
 */
export function ZoneSection({ id, title, children, className = '' }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      id={id}
      className={`intel2-zone ${className}`.trim()}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: reduce ? 0.3 : 0.6, ease: SECTION_EASE }}
    >
      {title != null && (
        <header className="intel2-zone-head">
          <h2 className="intel2-zone-title">{title}</h2>
        </header>
      )}
      {children}
    </motion.section>
  );
}

/** Quiet Studio+ upsell — never fake data behind it. */
export function LockCard({ zone, children }) {
  return (
    <div className="intel2-lock">
      <Lock size={20} className="intel2-lock-icon" aria-hidden />
      <span className="intel2-lock-title">Studio+ · {zone}</span>
      <p className="intel2-lock-copy">{children}</p>
      <PholioButton to="/dashboard/talent/settings/subscription" variant="meta">
        Upgrade to Studio+
      </PholioButton>
    </div>
  );
}

/**
 * Designed calibrating / listening state — same ink and craft as live data,
 * explicit about what the instrument is waiting for. Never a grey empty box.
 */
export function Calibrating({ children }) {
  return (
    <div className="intel2-calibrating">
      <Radio size={15} className="intel2-calibrating-icon" aria-hidden />
      <p className="intel2-calibrating-copy">{children}</p>
    </div>
  );
}
