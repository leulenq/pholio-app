import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import HouseBrief from './HouseBrief';
import { useHouseBrief } from './useHouseBrief';
import { boardList, reachName } from '../../lib/marketFormat';

/**
 * One house, one band.
 *
 * Closed, it is a name at poster scale and the single line of fact worth
 * carrying at a glance. Open, it becomes ink and states the whole brief in
 * place — no navigation, no panel, no modal. The band you were reading is the
 * band that answers.
 */

const EASE = [0.22, 1, 0.36, 1];

/**
 * The dateline — where this house is, set above its name.
 *
 * Geography stopped being another string in a metadata row and became the thing
 * that locates the entry before you read it, the way a show listing or an
 * auction lot is located. `primaryMarket` already resolves the seat city, and
 * falls back to the scope a house works at when it publishes no office.
 *
 * A city and a scope are different kinds of fact, so they are not set alike:
 * a place is ink, a scope is lighter and tracked wider. Nothing else — the
 * further offices a house keeps are dossier material, and hanging "+3 offices"
 * off a city was the tack-on that made the line look assembled rather than set.
 */
function dateline(house) {
  return {
    text: house.market,
    isPlace: house.cities.length > 0,
  };
}

export default function HouseBand({
  house,
  isOpen,
  onToggle,
  images,
  isCoreReady,
  isSendReady,
  applied,
  onOpenFlow,
  onOutbound,
}) {
  const reduce = useReducedMotion();
  const brief = useHouseBrief(house, { imageIds: images, enabled: isOpen });
  const place = dateline(house);
  const boards = boardList(house.boards, 4);
  const territory = house.reaches[0];
  // Never repeat the dateline down in the metadata.
  const showTerritory =
    territory && reachName(territory) && reachName(territory) !== place.text;
  const panelId = `house-${house.key}`;

  return (
    <article className={`hbnd${isOpen ? ' hbnd--open' : ''}`}>
      <button
        type="button"
        className="hbnd__face"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => onToggle(house.key)}
      >
        <span className="hbnd__identity">
          <span className={`hbnd__dateline${place.isPlace ? '' : ' hbnd__dateline--scope'}`}>
            {place.text}
          </span>
          <span className="hbnd__name">{house.name}</span>

          {boards.length || showTerritory ? (
            <span className="hbnd__meta">
              {boards.length ? (
                <span className="hbnd__boards">
                  {boards.map((board) => (
                    <span key={board}>{board}</span>
                  ))}
                </span>
              ) : null}
              {showTerritory ? (
                /*
                  Codes only where the territory genuinely is a set of countries
                  the house hand-picked. A region and a country both have proper
                  names — "North America", "United Kingdom" — and printing them
                  as `CA US` or `GB` is the raw-string habit this treatment
                  exists to kill.
                */
                territory.kind === 'selected' && (territory.codes || []).length ? (
                  <span className="hbnd__terr">
                    {territory.codes.map((code) => (
                      <span key={code}>{code}</span>
                    ))}
                  </span>
                ) : (
                  <span className="hbnd__scope">{reachName(territory)}</span>
                )
              ) : null}
            </span>
          ) : null}
        </span>

        <span className="hbnd__route">
          {applied ? (
            <span className="hbnd__state">In your ledger</span>
          ) : null}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            id={panelId}
            className="hbnd__panel"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.42, ease: EASE }}
          >
            <HouseBrief
              house={house}
              brief={brief}
              isCoreReady={isCoreReady}
              isSendReady={isSendReady}
              onCompose={() => onOpenFlow(house.pholio)}
              onPrepare={() => onOpenFlow(house.researched[0])}
              onOutbound={() => onOutbound(house.researched[0] || house.pholio)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}
