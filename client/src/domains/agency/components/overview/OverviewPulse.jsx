import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const spring = { type: 'spring', stiffness: 55, damping: 16 };

function PriorityBand({ hero }) {
  if (hero.kind === 'clear') {
    return (
      <div className="ov-pulse-priority ov-pulse-priority--clear">
        <span className="ov-pulse-eyebrow">Status</span>
        <div className="ov-pulse-priority-main ov-pulse-priority-main--clear">
          <div className="ov-pulse-priority-copy">
            <span className="ov-pulse-priority-headline">{hero.label}</span>
            {hero.sub && <span className="ov-pulse-priority-sub">{hero.sub}</span>}
            {hero.to && (
              <Link to={hero.to} className="ov-pulse-priority-cta">
                {hero.cta} <ArrowUpRight size={12} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link to={hero.to} className={`ov-pulse-priority ov-pulse-priority--${hero.tone}`}>
      <span className="ov-pulse-eyebrow">Today&apos;s priority</span>
      <div className="ov-pulse-priority-main">
        <div className="ov-pulse-priority-num-group">
          <span className="ov-pulse-priority-num">{hero.n}</span>
          {hero.context && (
            <span className="ov-pulse-priority-context">
              · {hero.context.n} {hero.context.label}
            </span>
          )}
        </div>
        <div className="ov-pulse-priority-copy">
          <span className="ov-pulse-priority-label">{hero.label}</span>
          {hero.sub && <span className="ov-pulse-priority-sub">{hero.sub}</span>}
          <span className="ov-pulse-priority-cta">
            {hero.cta} <ArrowUpRight size={12} strokeWidth={1.75} aria-hidden="true" />
          </span>
        </div>
        <span className="ov-pulse-priority-go" aria-hidden="true">
          <ArrowUpRight size={16} strokeWidth={1.5} />
        </span>
      </div>
    </Link>
  );
}

export default function OverviewPulse({ hero, actions = [] }) {
  return (
    <motion.section
      className="ov-module ov-pulse"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <div className="ov-pulse-panel">
        <PriorityBand hero={hero} />
        {actions.length > 0 && (
          <div className="ov-pulse-queue" role="list">
            {actions.map((a, i) => (
              <motion.div
                key={a.key}
                role="listitem"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...spring, delay: 0.05 + i * 0.04 }}
              >
                <Link to={a.to} className={`ov-pulse-queue-tile ov-pulse-queue-tile--${a.tone}`}>
                  <span className="ov-pulse-queue-n">{a.n}</span>
                  <span className="ov-pulse-queue-label">{a.label}</span>
                  {a.sub && <span className="ov-pulse-queue-sub">{a.sub}</span>}
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.section>
  );
}
