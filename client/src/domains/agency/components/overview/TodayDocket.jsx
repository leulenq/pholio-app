import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const spring = { type: 'spring', stiffness: 55, damping: 16 };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function dateLine() {
  const d = new Date();
  const wd = d.toLocaleDateString('en-US', { weekday: 'long' });
  const mo = d.toLocaleDateString('en-US', { month: 'long' });
  return `${wd} · ${d.getDate()} ${mo}`;
}

// Today's Front Desk — the agency's daybook hero. A tracked-caps wordmark of the
// house name sits over a warm gold light-wash; the greeting is the serif
// headline; the day reads as a ruled ledger of serif figures (one gold lead),
// each column a link into its view.
export default function TodayDocket({ firstName, agencyName, stats = [], allClear = false }) {
  const leadIndex = stats.findIndex((s) => s.value > 0);

  return (
    <motion.section
      className="ov-desk"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <div className="ov-desk-top">
        <span className="ov-desk-marque">{agencyName || 'Agency'}</span>
        <span className="ov-desk-date">{dateLine()}</span>
      </div>

      <motion.h1
        className="ov-desk-greet"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.06 }}
      >
        {greeting()}{firstName ? <>, <em>{firstName}</em></> : ''}
      </motion.h1>

      {allClear ? (
        <div className="ov-desk-clear">
          <p className="ov-desk-clear-line">Nothing waits on your read.</p>
          <Link to="/dashboard/agency/discover" className="ov-desk-clear-link">
            A good window to scout <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="ov-desk-stats">
          {stats.map((s, i) => (
            <motion.div
              key={s.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.12 + i * 0.06 }}
            >
              <Link
                to={s.to}
                className={`ov-desk-stat${i === leadIndex ? ' ov-desk-stat--lead' : ''}`}
              >
                <span className="ov-desk-lab">{s.label}</span>
                <span className="ov-desk-fig">{s.value}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </motion.section>
  );
}
