import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MATRIX_CELL } from '../../lib/specRegistry';
import { SpecMark, SpecMarkLegend } from '../../components/spec-marks';
import styles from './RequirementsPage.module.css';

/**
 * The requirements ledger — shots down, agencies across.
 *
 * Every other view of this data answers "what does Elite want?", one agency at
 * a time. That is the question a directory can answer, and it is not the
 * question a talent has. Theirs is the inverse — *what should I shoot next* —
 * and it is only answerable by reading every agency at once. A model put it
 * plainly in the research: "you think you have all you need but then on one
 * agency site they request an angle you didn't take, so you have to re-do the
 * whole set."
 *
 * So the ledger is the surface and the plate hangs off it: the column head is
 * the agency selector, which means there is no second index to keep in sync
 * with the grid.
 */

function cellDescription(state, agencyName, shotLabel) {
  if (state === MATRIX_CELL.COVERED) return `${agencyName}: ${shotLabel} covered`;
  if (state === MATRIX_CELL.WANTED) return `${agencyName}: ${shotLabel} still needed`;
  return `${agencyName}: does not ask for ${shotLabel}`;
}

export default function SpecLedger({
  matrix,
  routes = [],
  selectedSeriesId,
  onSelectAgency,
}) {
  const reduceMotion = useReducedMotion();
  const [crosshair, setCrosshair] = useState({ row: null, column: null });

  const columns = matrix?.columns || [];
  if (!columns.length) return null;

  const shots = matrix?.shots || [];
  const marketFor = (seriesId) =>
    routes.find((route) => route.seriesId === seriesId)?.marketLabel || null;
  const agencyNameFor = (seriesId) =>
    columns.find((column) => column.seriesId === seriesId)?.agencyName || 'This agency';

  // Rows arrive sorted by leverage, so the first row with anything left to
  // unlock is the highest-leverage shot on the page.
  const leadShotKey = shots.find((shot) => shot.unlocks > 0)?.key || null;

  const enter = (row, column) => setCrosshair({ row, column });
  const leave = () => setCrosshair({ row: null, column: null });

  return (
    <motion.section
      className={styles.ledger}
      aria-labelledby="spec-ledger-title"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 55, damping: 16 }
      }
    >
      <div className={styles.ledgerHead}>
        <h2 id="spec-ledger-title" className={styles.ledgerTitle}>
          Your set across the market
        </h2>
        {/* The sentence a directory of agencies cannot produce. */}
        {matrix.recommendation ? (
          <p className={styles.ledgerLede}>
            One <em>{matrix.recommendation.label}</em> would satisfy{' '}
            {matrix.recommendation.unlocks} more{' '}
            {matrix.recommendation.unlocks === 1 ? 'agency' : 'agencies'}.
          </p>
        ) : shots.length ? (
          <p className={styles.ledgerLede}>
            Every shot these agencies publish is already covered.
          </p>
        ) : null}
      </div>

      {/* The card scrolls, never the page. */}
      <div className={styles.ledgerScroll}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Shots each agency publishes, and whether your current set covers them.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.corner}>
                <span className={styles.srOnly}>Shot</span>
              </th>
              {columns.map((column) => {
                const selected = column.seriesId === selectedSeriesId;
                const market = marketFor(column.seriesId);
                return (
                  <th
                    key={column.seriesId}
                    scope="col"
                    className={`${styles.colHead}${selected ? ` ${styles.colHeadOn}` : ''}${
                      crosshair.column === column.seriesId ? ` ${styles.colHeadHot}` : ''
                    }`}
                  >
                    <button
                      type="button"
                      className={styles.colButton}
                      aria-pressed={selected}
                      onClick={() => onSelectAgency?.(column.seriesId)}
                      onFocus={() => enter(crosshair.row, column.seriesId)}
                      onBlur={leave}
                      onMouseEnter={() => enter(null, column.seriesId)}
                      onMouseLeave={leave}
                    >
                      <span className={styles.colName}>{column.agencyName}</span>
                      {market ? <span className={styles.colMarket}>{market}</span> : null}
                    </button>
                  </th>
                );
              })}
              <th scope="col" className={styles.railHead}>
                Unlocks
              </th>
            </tr>
          </thead>
          <tbody>
            {shots.length ? (
              shots.map((shot) => {
                const hot = crosshair.row === shot.key;
                return (
                  <tr
                    key={shot.key}
                    className={`${styles.row}${hot ? ` ${styles.rowHot}` : ''}`}
                  >
                    <th scope="row" className={styles.rowHead}>
                      {shot.key === leadShotKey ? (
                        <em className={styles.rowHeadLead}>{shot.label}</em>
                      ) : (
                        shot.label
                      )}
                    </th>
                    {shot.cells.map((cell) => (
                      <td
                        key={cell.seriesId}
                        className={`${styles.cell}${
                          cell.seriesId === selectedSeriesId ? ` ${styles.cellSelected}` : ''
                        }${crosshair.column === cell.seriesId ? ` ${styles.cellHot}` : ''}`}
                        onMouseEnter={() => enter(shot.key, cell.seriesId)}
                        onMouseLeave={leave}
                      >
                        <SpecMark
                          state={cell.state}
                          size={14}
                          label={cellDescription(
                            cell.state,
                            agencyNameFor(cell.seriesId),
                            shot.label,
                          )}
                        />
                      </td>
                    ))}
                    <td className={styles.rail}>
                      {shot.unlocks > 0 ? (
                        <span className={styles.railValue}>
                          Still needed by {shot.unlocks}
                        </span>
                      ) : (
                        <span className={styles.railDone}>Covered</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                {/* Honest, not a placeholder grid: these agencies publish
                    everything except a shot list, and saying so is the whole
                    answer. Their column heads still open their plate. */}
                <td className={styles.emptyRow} colSpan={columns.length + 2}>
                  None of these agencies publishes a shot list yet. Open one to read
                  what it does publish.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SpecMarkLegend className={styles.ledgerLegend} />
    </motion.section>
  );
}
