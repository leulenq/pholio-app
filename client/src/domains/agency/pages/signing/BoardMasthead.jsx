import React from 'react';
import { Palette } from 'lucide-react';
import { calendarDate } from '../../components/meta/metaFormat';

/**
 * BoardMasthead — the board states what it is, once, at the top.
 *
 * The identity plate is ported from the casting room (`resolveBoardIdentity`,
 * `boardIdentityStyle`, `[data-letterform]`, `[data-treatment]`): the client's
 * name set as a wordmark in the client's own material. Pholio gold never
 * appears here — the house ink is the client's voice, gold is the platform's,
 * and mixing them is how a board stops reading as the client's board.
 *
 * Under it the board name in Playfair (the one serif on this screen), the
 * brief in Inter, and the docket: the working counts as a ruled <dl>, not
 * stat tiles. A stat tile is a card, and this surface has no cards.
 */

function closeRow(board, wrapped) {
  const ts = board?.closes_at;
  if (!ts) return null;
  const date = calendarDate(ts);
  if (!date) return null;
  if (wrapped) return { key: 'Wrapped', value: date };
  return new Date(ts).getTime() < Date.now()
    ? { key: 'Closed', value: date }
    : { key: 'Closes', value: date };
}

export default function BoardMasthead({
  board,
  identity,
  vocab,
  groups,
  onEditIdentity,
}) {
  const wrapped = board?.is_active === false;
  const target = Number(board?.target_slots) || 0;

  const inPlay = (groups.decide?.length || 0)
    + (groups.waiting?.length || 0)
    + (groups.offer?.length || 0);
  const representedCount = groups.represented?.length || 0;

  const docket = [
    { key: 'In play', value: inPlay },
    (groups.waiting?.length || 0) > 0 && { key: 'Waiting on talent', value: groups.waiting.length },
    (groups.offer?.length || 0) > 0 && { key: 'Offers out', value: groups.offer.length },
    {
      key: vocab.decided,
      value: target > 0 ? `${representedCount} of ${target}` : representedCount,
    },
    closeRow(board, wrapped),
  ].filter(Boolean);

  return (
    <header className="sb-masthead">
      <div className="sb-plate">
        {identity.logoUrl
          ? <img className="sb-plate-logo" src={identity.logoUrl} alt={identity.label} />
          : <span className="sb-wordmark">{identity.label}</span>}
        {board && (
          <button type="button" className="sb-idbtn" onClick={onEditIdentity}>
            <Palette size={13} aria-hidden="true" /> Identity
          </button>
        )}
      </div>

      <div className="sb-masthead-body">
        <div className="sb-masthead-id">
          {/* A board that failed to load has no name, and printing the word
              "Board" would state something the surface does not know. The
              error script below carries the fact instead. */}
          {board?.name ? <h1 className="sb-title">{board.name}</h1> : null}
          {board?.description && <p className="sb-brief">{board.description}</p>}
        </div>
        <dl className="sb-docket">
          {docket.map((row) => (
            <div key={row.key} className="sb-docket-row">
              <dt>{row.key}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}
