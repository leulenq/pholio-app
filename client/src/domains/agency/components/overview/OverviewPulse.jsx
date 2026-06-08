import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const spring = { type: 'spring', stiffness: 55, damping: 16 };

function HeroPanel({ hero, solo }) {
  if (hero.kind === 'clear') {
    return (
      <div className={`ov-split-hero ov-split-hero--clear${solo ? ' ov-split-hero--full' : ''}`}>
        <span className="ov-split-eyebrow">Status</span>
        <span className="ov-split-hero-headline">{hero.label}</span>
        {hero.sub && <span className="ov-split-sub">{hero.sub}</span>}
        {hero.to && (
          <Link to={hero.to} className="ov-split-hero-cta">
            {hero.cta} <ArrowUpRight size={11} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <Link
      to={hero.to}
      className={`ov-split-hero ov-split-hero--${hero.tone}${solo ? ' ov-split-hero--full' : ''}`}
    >
      <span className="ov-split-eyebrow">Today&apos;s priority</span>
      <span className="ov-split-num">{hero.n}</span>
      {hero.context && (
        <span className="ov-split-context">· {hero.context.n} {hero.context.label}</span>
      )}
      <span className="ov-split-label">{hero.label}</span>
      {hero.sub && <span className="ov-split-sub">{hero.sub}</span>}
      <span className="ov-split-hero-cta">
        {hero.cta} <ArrowUpRight size={11} strokeWidth={1.75} aria-hidden="true" />
      </span>
    </Link>
  );
}

export default function OverviewPulse({ hero, actions = [] }) {
  const maxN = actions.length > 0 ? Math.max(...actions.map((a) => a.n), 1) : 1;
  const solo = actions.length === 0;

  return (
    <motion.section
      className="ov-module ov-pulse"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <div className="ov-pulse-panel">
        <div className={`ov-split${solo ? ' ov-split--solo' : ''}`}>
          <HeroPanel hero={hero} solo={solo} />
          {!solo && (
            <div className="ov-split-secondary">
              {actions.map((a, i) => {
                const pct = Math.round((a.n / maxN) * 100);
                return (
                  <motion.div
                    key={a.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ ...spring, delay: 0.07 + i * 0.05 }}
                  >
                    <Link to={a.to} className={`ov-split-sec-row ov-split-sec-row--${a.tone}`}>
                      <span className="ov-split-sec-num">{a.n}</span>
                      <div className="ov-split-sec-body">
                        <div className="ov-split-sec-track">
                          <div className="ov-split-sec-bar" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="ov-split-sec-label">{a.label}</span>
                        {a.sub && <span className="ov-split-sec-sub">{a.sub}</span>}
                      </div>
                      <ArrowUpRight size={13} strokeWidth={1.5} className="ov-split-sec-go" aria-hidden="true" />
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
