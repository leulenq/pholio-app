import { useMemo } from 'react';
import VerdictBar from '../../components/verdict/VerdictBar';

/**
 * The signing board's verdict bar — the shared `VerdictBar` holding the
 * board's verb set.
 *
 * The bar itself (arming, keys, the ink register) moved to
 * `components/verdict/VerdictBar` when the submissions desk adopted the same
 * language. What stays here is the only thing that was ever the board's: WHICH
 * verbs a board meeting has. The wall marks talent represented and never files
 * to a board or shortlists a batch; the inbox does the reverse. One idiom, two
 * decks.
 *
 * Spec: docs/superpowers/specs/2026-09-01-signing-board-design.md §2.2, §4.3.
 */
export function BoardVerdictBar({ vocab, ...rest }) {
  /* `Mark represented` is the one label the board's own vocabulary writes: a
     package board confirms talent for a client brief, it does not represent
     them, and that difference has to survive into the verb. */
  const packageBoard = vocab?.decidedLower === 'confirmed';

  const verbs = useMemo(() => [
    { action: 'open', label: 'Open', key: 'Enter', kind: 'plain' },
    { action: 'lineup', label: 'Line up', key: 'L', kind: 'plain', bulk: true },
    { action: 'shortlist', label: 'Shortlist', key: 'S', kind: 'plain' },
    { action: 'request_digitals', label: 'Request digitals', key: 'D', kind: 'plain' },
    { action: 'invite_meeting', label: 'Invite to meet', key: 'M', kind: 'plain' },
    { action: 'keep_on_file', label: 'Keep on file', key: 'F', kind: 'plain', bulk: true },
    { action: 'reopen', label: 'Reopen', kind: 'plain' },
    { action: 'clear', label: 'Clear', key: 'Esc', kind: 'plain', single: false, bulk: true },
    { action: 'pass', label: 'Pass', key: 'X', kind: 'arm', armLabel: 'Confirm pass', bulk: true },
    {
      action: 'represent',
      label: packageBoard ? 'Confirm for package' : 'Mark represented',
      key: 'R',
      kind: 'primary',
    },
    { action: 'offer', label: 'Offer representation', key: 'A', kind: 'arm' },
  ], [packageBoard]);

  return <VerdictBar verbs={verbs} {...rest} />;
}

export default BoardVerdictBar;
