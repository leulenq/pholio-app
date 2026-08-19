import React, { useCallback, useEffect, useRef } from 'react';
import styles from './RequirementsPage.module.css';

/**
 * The market index — one row per agency, the Settings movements idiom.
 *
 * A row is a real button, full row width, so a long house name breaks between
 * words instead of mid-word the way it did inside a narrow table column head.
 * Inter, never serif: this is a control, and display type in a control reads as
 * costume (the talent system's Editorial Serif Rule).
 *
 * Two shapes, one component. Wide: a vertical tablist driving the pane beside
 * it, with a roving tabindex — a twenty-five-agency rail that costs twenty-five
 * tab presses to step past is not navigable by keyboard, only survivable.
 * Narrow: the same rows as an accordion, each agency's detail opening under its
 * own row, because a stacked rail with the detail below all of it would put the
 * answer a screen and a half from the question.
 */

function RailRow({ agency }) {
  return (
    <>
      <span className={styles.railName}>{agency.agencyName}</span>
      <span className={styles.railMeta}>
        {agency.marketLabel ? (
          <span className={styles.railMarket}>{agency.marketLabel}</span>
        ) : null}
        {/*
          Stated in words, never as a chip. A talent who reads this and then
          cannot find a Send button has been misled by the interface, so the
          sentence arrives before they build a package, not after.
        */}
        <span className={styles.railChannel}>
          {agency.acceptsPholioSubmissions
            ? 'Accepts Pholio submissions'
            : agency.appliesByEmail
              ? 'Applies by email'
              : 'Applies on their site'}
        </span>
      </span>
      {/*
        The compact coverage figure. An agency that publishes no shot list says
        so — a fake "0 of 0" would read as a failing score against a requirement
        nobody set.
      */}
      <span className={styles.railFigure}>
        {agency.hasShotList ? (
          <>
            <span className={styles.railCount}>
              {agency.covered} of {agency.published}
            </span>
            <span className={styles.railCountWord}>shots in your set</span>
          </>
        ) : (
          <span className={styles.railNone}>
            No shot list published — form details only
          </span>
        )}
      </span>
    </>
  );
}

export default function MarketRail({
  agencies,
  selectedSeriesId,
  onSelect,
  panelId,
  stacked = false,
  renderPanel,
}) {
  const buttons = useRef(new Map());

  const register = useCallback(
    (seriesId) => (node) => {
      if (node) buttons.current.set(seriesId, node);
      else buttons.current.delete(seriesId);
    },
    [],
  );

  useEffect(() => {
    const known = new Set(agencies.map((agency) => agency.seriesId));
    buttons.current.forEach((_, key) => {
      if (!known.has(key)) buttons.current.delete(key);
    });
  }, [agencies]);

  const move = (index) => {
    const target = agencies[(index + agencies.length) % agencies.length];
    if (!target) return;
    onSelect(target.seriesId);
    buttons.current.get(target.seriesId)?.focus();
  };

  const onKeyDown = (event, index) => {
    const moves = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: agencies.length - 1,
    };
    if (!Object.hasOwn(moves, event.key)) return;
    event.preventDefault();
    move(moves[event.key]);
  };

  if (stacked) {
    return (
      <div className={styles.stack}>
        {agencies.map((agency, index) => {
          const open = agency.seriesId === selectedSeriesId;
          return (
            <div key={agency.seriesId} className={styles.stackItem}>
              <button
                type="button"
                id={`market-tab-${index}`}
                aria-expanded={open}
                aria-controls={panelId}
                className={`${styles.railRow}${open ? ` ${styles.railRowOn}` : ''}`}
                onClick={() => onSelect(agency.seriesId)}
              >
                <RailRow agency={agency} />
              </button>
              {open ? renderPanel?.(`market-tab-${index}`) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={styles.rail}
      role="tablist"
      aria-orientation="vertical"
      aria-label="Agencies"
    >
      {agencies.map((agency, index) => {
        const selected = agency.seriesId === selectedSeriesId;
        return (
          <button
            key={agency.seriesId}
            ref={register(agency.seriesId)}
            type="button"
            role="tab"
            id={`market-tab-${index}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className={`${styles.railRow}${selected ? ` ${styles.railRowOn}` : ''}`}
            onClick={() => onSelect(agency.seriesId)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <RailRow agency={agency} />
          </button>
        );
      })}
    </div>
  );
}
