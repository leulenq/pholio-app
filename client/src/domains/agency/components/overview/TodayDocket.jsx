import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import MatchScore from '../ui/MatchScore';

const spring = { type: 'spring', stiffness: 55, damping: 16 };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function dateLine() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

const TAGS = {
  review: 'Awaiting review',
  closing: 'Closing soon',
  new: 'New today',
  idle: 'Idle bench',
};

function FaceFan({ faces = [], extra }) {
  if (!faces.length) return null;
  return (
    <span className="ov-brief-faces" aria-hidden="true">
      {faces.map((src, i) => (
        <span
          key={i}
          className="ov-brief-face"
          style={{ backgroundImage: `url(${src})`, zIndex: faces.length - i }}
        />
      ))}
      {extra > 0 && <span className="ov-brief-face ov-brief-face--more">+{extra}</span>}
    </span>
  );
}

// Today's Brief — the editorial command surface at the top of the overview.
// Broadsheet on the cream canvas: gold masthead rule, serif greeting with an
// italic-gold name, then a dominant lead priority (metallic serif figure + real
// talent faces) beside a hairline-ruled ledger of the day's other moves.
export default function TodayDocket({ firstName, rows = [], allClear = false }) {
  const lead = rows[0] || null;
  const side = rows.slice(1, 4);

  return (
    <motion.section
      className="ov-brief"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <div className="ov-brief-topline" aria-hidden="true" />

      <header className="ov-brief-mast">
        <h1 className="ov-brief-greeting">
          {greeting()}, <em>{firstName}</em>.
        </h1>
        <span className="ov-brief-date">{dateLine()}</span>
      </header>

      {allClear || !lead ? (
        <div className="ov-brief-clear">
          <span className="ov-brief-clear-line">All clear.</span>
          <span className="ov-brief-clear-sub">
            Nothing needs your attention right now — a good moment to scout.
          </span>
          <Link to="/dashboard/agency/discover" className="ov-brief-cta">
            Scout talent <ArrowUpRight size={12} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className={`ov-brief-body${side.length ? '' : ' ov-brief-body--solo'}`}>
          {/* Lead priority */}
          <Link to={lead.to} className={`ov-brief-lead ov-brief-lead--${lead.tone}`}>
            <span className="ov-brief-tag">{TAGS[lead.key] || 'Today'}</span>
            <div className="ov-brief-lead-headline">
              <motion.span
                className="ov-brief-figure"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.08 }}
              >
                {lead.figure}
              </motion.span>
              <span className="ov-brief-statement">{lead.statement}</span>
            </div>

            {(lead.sub || lead.avgMatch != null) && (
              <span className="ov-brief-sub">
                {lead.sub}
                {lead.avgMatch != null && (
                  <>
                    {lead.sub ? '  ·  ' : ''}
                    <span className="ov-brief-avg">
                      avg match <MatchScore score={lead.avgMatch} size="sm" />
                    </span>
                  </>
                )}
              </span>
            )}

            <div className="ov-brief-lead-foot">
              {lead.faces && (
                <FaceFan faces={lead.faces} extra={lead.figure - lead.faces.length} />
              )}
              <span className="ov-brief-cta">
                {lead.cta} <ArrowUpRight size={12} strokeWidth={1.75} aria-hidden="true" />
              </span>
            </div>
          </Link>

          {/* Ledger of remaining moves */}
          {side.length > 0 && (
            <div className="ov-brief-ledger" role="list">
              {side.map((row, i) => (
                <motion.div
                  key={row.key}
                  role="listitem"
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: 0.16 + i * 0.06 }}
                >
                  <Link to={row.to} className={`ov-brief-beat ov-brief-beat--${row.tone}`}>
                    <span className="ov-brief-beat-head">
                      <span className="ov-brief-beat-tag">{TAGS[row.key] || 'Today'}</span>
                      <span className="ov-brief-beat-figure">{row.figure}</span>
                    </span>
                    <span className="ov-brief-beat-statement">{row.statement}</span>
                    {row.sub && <span className="ov-brief-beat-sub">{row.sub}</span>}
                    <ArrowUpRight className="ov-brief-beat-arrow" size={14} strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.section>
  );
}
