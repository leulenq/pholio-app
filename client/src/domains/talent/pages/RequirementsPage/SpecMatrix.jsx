import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MATRIX_CELL } from '../../lib/specRegistry';
import styles from './RequirementsPage.module.css';

/**
 * The market as one grid — shots down, agencies across.
 *
 * Every other view of this data answers "what does Elite want?", one agency at
 * a time. That is the question a directory can answer, and it is not the
 * question a talent has. Theirs is the inverse: *what should I shoot next* —
 * and it is only answerable by looking at every agency at once. A model put it
 * plainly in the research: "you think you have all you need but then on one
 * agency site they request an angle you didn't take, so you have to re-do the
 * whole set."
 *
 * So the grid is the surface, and the per-agency plate hangs off it rather than
 * the other way round. It is also the only shape that can carry B2's promise —
 * *shoot your digitals once, we know what every agency wants* — because the
 * leverage of one shot across ten agencies is a fact about the whole row, not
 * about any single entry in a list.
 *
 * Cells are filled, outlined or empty rather than coloured dots: a status dot
 * is a banned pattern here, and an ink fill reads as a spec sheet, which is
 * what this is.
 */

function cellLabel(state, agencyName, shotLabel) {
  if (state === MATRIX_CELL.COVERED) return `${agencyName}: ${shotLabel} covered`;
  if (state === MATRIX_CELL.WANTED) return `${agencyName}: ${shotLabel} still needed`;
  return `${agencyName}: does not ask for ${shotLabel}`;
}

export default function SpecMatrix({
  matrix,
  selectedSeriesId,
  onSelectAgency,
  hoveredShot,
  onHoverShot,
}) {
  const reduceMotion = useReducedMotion();
  if (!matrix?.shots?.length || !matrix.columns.length) return null;

  return (
    <motion.section
      className={styles.matrix}
      aria-labelledby="spec-matrix-title"
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : { type: 'spring', stiffness: 52, damping: 17, delay: 0.08 }
      }
    >
      <div className={styles.matrixHead}>
        <h2 id="spec-matrix-title" className={styles.matrixTitle}>
          Your set across the market
        </h2>
        {/* The sentence a directory cannot produce. */}
        {matrix.recommendation ? (
          <p className={styles.matrixLede}>
            One <em>{matrix.recommendation.label}</em> would satisfy{' '}
            {matrix.recommendation.unlocks} more{' '}
            {matrix.recommendation.unlocks === 1 ? 'agency' : 'agencies'}.
          </p>
        ) : (
          <p className={styles.matrixLede}>
            Every shot the agencies below publish is already covered.
          </p>
        )}
      </div>

      <div className={styles.matrixScroll}>
        <table className={styles.matrixTable}>
          <caption className={styles.visuallyHidden}>
            Shots each agency publishes, and whether your current set covers them.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.matrixCorner}>
                <span className={styles.visuallyHidden}>Shot</span>
              </th>
              {matrix.columns.map((column, index) => {
                const selected = column.seriesId === selectedSeriesId;
                return (
                  <th
                    key={column.seriesId}
                    scope="col"
                    className={`${styles.matrixColHead}${selected ? ` ${styles.matrixColHeadOn}` : ''}`}
                  >
                    {/* The column head is the agency selector — the grid is
                        the navigation, so there is no second index to keep in
                        sync with it. */}
                    <button
                      type="button"
                      className={styles.matrixColButton}
                      aria-pressed={selected}
                      onClick={() => onSelectAgency?.(column.seriesId)}
                    >
                      <span className={styles.matrixColName}>{column.agencyName}</span>
                      {/* The number sits closest to the cells it labels. */}
                      <span className={styles.matrixColIndex} aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </button>
                  </th>
                );
              })}
              <th scope="col" className={styles.matrixLeverageHead}>
                <span>Still needed by</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.shots.map((shot, rowIndex) => {
              const active = hoveredShot === shot.key;
              return (
                <tr
                  key={shot.key}
                  className={`${styles.matrixRow}${active ? ` ${styles.matrixRowOn}` : ''}`}
                  style={{ '--rq-row-index': rowIndex }}
                  onMouseEnter={() => onHoverShot?.(shot.key)}
                  onMouseLeave={() => onHoverShot?.(null)}
                >
                  <th scope="row" className={styles.matrixRowHead}>
                    {shot.label}
                  </th>
                  {shot.cells.map((cell) => (
                    <td key={cell.seriesId} className={styles.matrixCell}>
                      <span
                        className={`${styles.mark} ${
                          cell.state === MATRIX_CELL.COVERED
                            ? styles.markCovered
                            : cell.state === MATRIX_CELL.WANTED
                              ? styles.markWanted
                              : styles.markNone
                        }`}
                      >
                        <span className={styles.visuallyHidden}>
                          {cellLabel(
                            cell.state,
                            matrix.columns.find((c) => c.seriesId === cell.seriesId)?.agencyName,
                            shot.label,
                          )}
                        </span>
                      </span>
                    </td>
                  ))}
                  <td className={styles.matrixLeverage}>
                    {shot.unlocks > 0 ? (
                      <span className={styles.matrixLeverageValue}>{shot.unlocks}</span>
                    ) : (
                      <span className={styles.matrixLeverageDone}>covered</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className={styles.legend}>
        <div>
          <dt><span className={`${styles.mark} ${styles.markCovered}`} aria-hidden="true" /></dt>
          <dd>In your set</dd>
        </div>
        <div>
          <dt><span className={`${styles.mark} ${styles.markWanted}`} aria-hidden="true" /></dt>
          <dd>Published, not yet covered</dd>
        </div>
        <div>
          <dt><span className={`${styles.mark} ${styles.markNone}`} aria-hidden="true" /></dt>
          <dd>Not asked for</dd>
        </div>
      </dl>
    </motion.section>
  );
}
