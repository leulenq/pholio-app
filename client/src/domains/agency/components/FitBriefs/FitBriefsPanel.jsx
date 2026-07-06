import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { rankBoard } from '../../api/agency';
import './FitBriefsPanel.css';

/**
 * FitBriefsPanel — decision-support ranked shortlist for a casting board.
 *
 * A person decides; this only explains. Every candidate is framed as a brief:
 * the case for, the watch-outs, what would change the read, the tradeoffs, and
 * the interaction between signals. Fit index + confidence are quiet plain text,
 * never a headline chip. Ineligible talent are kept visible with their reason.
 */

const POSTURE_LABEL = {
  advance: 'Advance',
  consider: 'Consider',
  hold: 'Hold',
  'not-for-this': 'Not for this brief',
  ineligible: 'Not eligible',
};

const BAND_LABEL = {
  strong: 'Strong fit',
  possible: 'Possible fit',
  stretch: 'A stretch',
  ineligible: 'Ineligible',
};

function fullName(c) {
  return [c?.first_name, c?.last_name].filter(Boolean).join(' ').trim() || 'Unnamed talent';
}

function confidenceWord(confidence) {
  if (confidence == null) return null;
  if (confidence >= 0.75) return 'high confidence';
  if (confidence >= 0.45) return 'moderate confidence';
  return 'low confidence';
}

function DimensionLine({ item }) {
  // A single case-for / case-against reason rendered as plain readable text.
  const label = item?.dimension ? `${item.dimension}` : null;
  return (
    <li className="fb-line">
      {label && <span className="fb-line-dim">{label}</span>}
      <span className="fb-line-note">{item?.note || ''}</span>
    </li>
  );
}

function FitBriefCard({ brief, nameOf, index }) {
  const posture = POSTURE_LABEL[brief.posture] || brief.posture || 'Review';
  const band = BAND_LABEL[brief.band] || brief.band || null;
  const conf = confidenceWord(brief.confidence);

  const caseFor = Array.isArray(brief.case_for) ? brief.case_for.filter((x) => x?.note) : [];
  // Watch-outs: non-blocking reservations (eligible talent won't carry blocking ones here).
  const caseAgainst = Array.isArray(brief.case_against)
    ? brief.case_against.filter((x) => x?.note && !x.blocking)
    : [];

  const whatWouldChange = [
    ...(Array.isArray(brief.what_would_change_this) ? brief.what_would_change_this : []),
    ...(Array.isArray(brief.missing) ? brief.missing.map((m) => `Missing: ${m}`) : []),
  ].filter(Boolean);

  const interactions = Array.isArray(brief.interaction_notes)
    ? brief.interaction_notes.filter((x) => x?.note)
    : [];

  const tradeoffNames = (brief.comparability?.tradeoff_with || [])
    .map((id) => nameOf(id))
    .filter(Boolean);

  const casesNote = brief.cases?.note || null;
  const reasoning = brief.reasoning && brief.reasoning.rationale ? brief.reasoning : null;

  return (
    <motion.article
      className="fb-card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 55, damping: 16, delay: Math.min(index * 0.04, 0.3) }}
    >
      <header className="fb-card-head">
        <span className="fb-rank">{index + 1}</span>
        <div className="fb-ident">
          <h3 className="fb-name">{fullName(brief)}</h3>
          {brief.city && <span className="fb-city">{brief.city}</span>}
        </div>
        <div className="fb-read">
          <p className="fb-posture">
            {posture}{band ? ` · ${band}` : ''}
          </p>
          <p className="fb-fit">
            Fit {brief.fit_index}
            {conf ? ` · ${conf}` : ''}
          </p>
        </div>
      </header>

      {interactions.length > 0 && (
        <div className="fb-interactions">
          {interactions.map((it, i) => (
            <p className="fb-interaction" key={i}>{it.note}</p>
          ))}
        </div>
      )}

      <div className="fb-cases">
        {caseFor.length > 0 && (
          <section className="fb-block">
            <h4 className="fb-block-title">The case for</h4>
            <ul className="fb-list">
              {caseFor.map((item, i) => <DimensionLine key={i} item={item} />)}
            </ul>
          </section>
        )}

        {caseAgainst.length > 0 && (
          <section className="fb-block">
            <h4 className="fb-block-title">Watch-outs</h4>
            <ul className="fb-list">
              {caseAgainst.map((item, i) => <DimensionLine key={i} item={item} />)}
            </ul>
          </section>
        )}
      </div>

      {whatWouldChange.length > 0 && (
        <section className="fb-block fb-block--change">
          <h4 className="fb-block-title">What would change this</h4>
          <ul className="fb-list fb-list--plain">
            {whatWouldChange.map((line, i) => <li className="fb-line" key={i}><span className="fb-line-note">{line}</span></li>)}
          </ul>
        </section>
      )}

      {tradeoffNames.length > 0 && (
        <p className="fb-tradeoff">
          A genuine tradeoff with {tradeoffNames.join(', ')} — different strengths, not a clear win.
        </p>
      )}

      {casesNote && <p className="fb-note-line">{casesNote}</p>}

      {reasoning && (
        <div className="fb-reasoning">
          <p className="fb-reasoning-text">{reasoning.rationale}</p>
        </div>
      )}
    </motion.article>
  );
}

function IneligibleRow({ item }) {
  const blocking = (item.case_against || []).filter((x) => x?.blocking && x?.note);
  const reason = blocking.length > 0
    ? blocking.map((x) => x.note).join('; ')
    : 'Does not meet a hard requirement for this brief';
  return (
    <div className="fb-inel-row">
      <span className="fb-inel-name">{fullName(item)}</span>
      <span className="fb-inel-reason">Not eligible — {reason}</span>
    </div>
  );
}

export default function FitBriefsPanel({ boardId }) {
  const [withCases, setWithCases] = useState(false);
  const [withReasoning, setWithReasoning] = useState(false);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['board-fit-briefs', boardId, withCases, withReasoning],
    queryFn: () => rankBoard(boardId, { withCases, withReasoning }),
    enabled: !!boardId,
    staleTime: 30000,
    keepPreviousData: true,
  });

  const ranked = useMemo(() => data?.ranked || [], [data]);
  const ineligible = useMemo(() => data?.ineligible || [], [data]);

  // Resolve profile ids → readable names for tradeoff / comparability copy.
  const nameOf = useMemo(() => {
    const map = new Map();
    [...ranked, ...ineligible].forEach((c) => {
      if (c?.profile_id) map.set(c.profile_id, fullName(c));
    });
    return (id) => map.get(id) || null;
  }, [ranked, ineligible]);

  const notice = data?.notice || null;

  return (
    <section className="fb">
      <div className="fb-bar">
        <p className="fb-lede">
          A ranked read of this board — decision support, best-first. Each brief explains its
          standing so a booker can make the call.
        </p>
        <div className="fb-toggles">
          <label className="fb-toggle">
            <input
              type="checkbox"
              checked={withCases}
              onChange={(e) => setWithCases(e.target.checked)}
            />
            <span className="fb-toggle-box" aria-hidden="true" />
            <span className="fb-toggle-text">Include past-case context</span>
          </label>
          <label className="fb-toggle">
            <input
              type="checkbox"
              checked={withReasoning}
              onChange={(e) => setWithReasoning(e.target.checked)}
            />
            <span className="fb-toggle-box" aria-hidden="true" />
            <span className="fb-toggle-text">Include AI read</span>
          </label>
        </div>
      </div>

      {notice && <p className="fb-notice">{notice}</p>}

      {isLoading && <div className="fb-state">Reading the board…</div>}
      {isError && <div className="fb-state">Couldn’t build the fit briefs for this board.</div>}

      {!isLoading && !isError && ranked.length === 0 && ineligible.length === 0 && (
        <div className="fb-empty">
          <p className="fb-empty-title">Nothing to rank yet</p>
          <p className="fb-empty-sub">Add applicants to this board and their fit briefs will appear here.</p>
        </div>
      )}

      {ranked.length > 0 && (
        <div className={`fb-grid${isFetching ? ' is-refreshing' : ''}`}>
          {ranked.map((brief, i) => (
            <FitBriefCard
              key={brief.profile_id || i}
              brief={brief}
              index={i}
              nameOf={nameOf}
            />
          ))}
        </div>
      )}

      {ineligible.length > 0 && (
        <section className="fb-inel">
          <h4 className="fb-inel-title">Not eligible for this brief</h4>
          <p className="fb-inel-sub">Kept visible so the reason is never hidden.</p>
          <div className="fb-inel-list">
            {ineligible.map((item, i) => (
              <IneligibleRow key={item.profile_id || i} item={item} />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
