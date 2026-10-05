import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../../../api/talent';
import { pholioToast } from '../../../../../shared/lib/pholio-toast';
import { Section, ActionLink } from './Section';
import { rise } from './motion';

function StillAccurate() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await talentApi.confirmMeasurementsCurrent();
      await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      pholioToast.success('Stats marked current');
    } catch (error) {
      pholioToast.error(error?.message || 'Could not update your stats. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="ov-act ov-act--button" onClick={confirm} disabled={busy}>
      <span className="ov-act-label">{busy ? 'Saving' : 'Still accurate'}</span>
    </button>
  );
}

const VISIBLE = 4;

/**
 * Your move: what is waiting on the talent, and only that. Agency asks,
 * answer-by times and gaps in the package, one sentence each, most
 * time-bound first. When nothing is waiting, the section says so in one line.
 */
export default function YourMove({ moves, liveCount, loading }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? moves : moves.slice(0, VISIBLE);
  const hidden = moves.length - shown.length;
  return (
    <Section id="ov-move-heading" title="Your" accent="move." className="ov-move">
      {loading ? (
        <motion.div className="ov-move-list" variants={rise} aria-busy>
          <span className="ov-skel ov-skel--move" aria-hidden />
          <span className="ov-skel ov-skel--move" aria-hidden />
        </motion.div>
      ) : moves.length === 0 ? (
        <motion.div className="ov-move-clear" variants={rise}>
          <p className="ov-move-clear-line">Nothing is waiting on you.</p>
          <p className="ov-move-context">
            {liveCount > 0
              ? `${liveCount} ${liveCount === 1 ? 'agency has' : 'agencies have'} your package. When one of them moves, it shows here first.`
              : 'Your package is complete. When an agency asks for something, it shows here first.'}
          </p>
        </motion.div>
      ) : (
        <ol className="ov-move-list">
          {shown.map((move, index) => (
            <motion.li key={move.key} className="ov-move-item" variants={rise}>
              <span className="ov-move-num" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="ov-move-body">
                <p className="ov-move-title">{move.title}</p>
                <p className="ov-move-context">{move.context}</p>
              </div>
              <div className="ov-move-actions">
                {move.confirmStats && <StillAccurate />}
                <ActionLink to={move.action.to}>{move.action.label}</ActionLink>
              </div>
            </motion.li>
          ))}
          {hidden > 0 && (
            <motion.li className="ov-move-more" variants={rise}>
              <button type="button" className="ov-sec-link ov-move-more-btn" onClick={() => setExpanded(true)}>
                {hidden} more
              </button>
            </motion.li>
          )}
        </ol>
      )}
    </Section>
  );
}
