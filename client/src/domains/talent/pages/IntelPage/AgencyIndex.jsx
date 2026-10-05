import React, { forwardRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { approachLabel, standingLine, windowLine } from './placementModel';
import { SPRING } from './motion';

const TABS = [
  { id: 'go', label: 'Now' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'later', label: 'Later' },
  { id: 'not_now', label: 'Not now' },
  { id: 'represented', label: 'Represents you' },
];

const NOTE = {
  go: 'Nothing they publish excludes you, and none has turned you down recently.',
  waiting: 'Submitted and not yet answered.',
  later: 'Passed recently. Dates follow what each agency told you.',
  not_now: 'Their own published requirements, or what they told you, put these out of reach for now.',
};

function Approach({ agency }) {
  const label = approachLabel(agency);
  if (!label || !['go', 'later'].includes(agency.group)) return null;
  if (agency.approach.kind === 'pholio') {
    return <Link to={agency.approach.href} className="dk-go">{label}</Link>;
  }
  return (
    <a href={agency.approach.href} className="dk-go dk-go--out" target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

function Entry({ agency, index }) {
  const reduce = useReducedMotion();
  const standing = standingLine(agency);
  const where = [agency.location, agency.market && agency.market !== agency.location ? agency.market : null]
    .filter(Boolean)
    .join(' · ');
  const notes = [];
  if (standing) notes.push({ k: 's', text: standing, strong: true });
  if (agency.newFaces && agency.group !== 'not_now') notes.push({ k: 'n', text: 'Runs a new faces or development board' });
  for (const c of agency.conflicts) notes.push({ k: `c${c.id}`, text: `“${c.said}”`, quote: true });
  if (agency.group !== 'not_now') {
    for (const p of agency.preferences) notes.push({ k: `p${p.id}`, text: `Prefers “${p.said}”`, quote: true });
    for (const w of agency.callWindows) notes.push({ k: `w${w.id}`, text: windowLine(w) });
  }
  return (
    <motion.li
      className="dk-entry"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: Math.min(index, 12) * 0.03 }}
    >
      <div className="dk-entry-head">
        <span className="dk-entry-name">{agency.name}</span>
        {where && <span className="dk-entry-where">{where}</span>}
      </div>
      {notes.length > 0 && (
        <ul className="dk-entry-notes">
          {notes.map((n) => (
            <li key={n.k} className={n.strong ? 'is-strong' : n.quote ? 'is-quote' : ''}>{n.text}</li>
          ))}
        </ul>
      )}
      <Approach agency={agency} />
    </motion.li>
  );
}

/** Every agency, one tab per standing, so the list never becomes a scroll of names. */
const AgencyIndex = forwardRef(function AgencyIndex({ agencies }, ref) {
  const counts = Object.fromEntries(TABS.map((t) => [t.id, agencies.filter((a) => a.group === t.id).length]));
  const first = TABS.find((t) => counts[t.id] > 0)?.id || 'go';
  const [tab, setTab] = useState(counts.go ? 'go' : first);
  const visible = agencies.filter((a) => a.group === tab);

  return (
    <section className="dk-index" ref={ref} tabIndex={-1} aria-labelledby="dk-index-h">
      <div className="dk-index-head">
        <h2 id="dk-index-h" className="dk-h">Agencies</h2>
        <div className="dk-tabs" role="tablist" aria-label="Agencies by standing">
          {TABS.filter((t) => counts[t.id] > 0 || t.id === 'go').map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`dk-tab${tab === t.id ? ' is-on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span>{counts[t.id]}</span>
            </button>
          ))}
        </div>
      </div>
      {NOTE[tab] && <p className="dk-soft dk-index-note">{NOTE[tab]}</p>}
      <AnimatePresence mode="wait">
        <motion.ul
          key={tab}
          className={`dk-entries is-${tab}`}
          role="tabpanel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {visible.length === 0 ? (
            <li className="dk-soft">None right now.</li>
          ) : (
            visible.map((a, i) => <Entry key={a.key} agency={a} index={i} />)
          )}
        </motion.ul>
      </AnimatePresence>
    </section>
  );
});

export default AgencyIndex;
