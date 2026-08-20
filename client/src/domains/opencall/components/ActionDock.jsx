import React, { useEffect } from 'react';

/**
 * The Action Dock — one fixed home for the primary action
 * (`client/src/domains/onboarding/DESIGN.md` §3).
 *
 * Fixed bottom-center, reserved height, ALWAYS rendered. It never mounts or
 * unmounts between screens and never moves; it only changes state, dimmed until
 * the current screen is satisfiable. Back is a quiet text control beneath it,
 * and an optional field's "Skip" sits in the same quiet row.
 *
 * Progress, when it is worth stating at all, is words — never dots.
 *
 * @param {string}   label
 * @param {boolean}  [enabled]
 * @param {Function} onAdvance
 * @param {{label?: string, onClick: Function}} [back]
 * @param {{label?: string, onClick: Function}} [skip]
 * @param {string}   [progress]  e.g. "3 of 9".
 */
export default function ActionDock({
  label,
  enabled = false,
  onAdvance,
  back = null,
  skip = null,
  progress = null,
}) {
  // Enter advances from anywhere that is not itself consuming the key. Mirrors
  // the casting flow's dock so the two surfaces behave identically.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Enter') return;
      const active = document.activeElement;
      if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) return;
      if (active && active.isContentEditable) return;
      if (!enabled || !onAdvance) return;
      event.preventDefault();
      onAdvance();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onAdvance]);

  return (
    <div className="oc-dock">
      <div className="oc-dock__inner">
        {progress ? <span className="oc-dock__count">{progress}</span> : null}
        <button
          type="button"
          className="oc-dock__cta"
          disabled={!enabled}
          onClick={enabled ? onAdvance : undefined}
        >
          <span>{label}</span>
          <span className="oc-dock__arrow" aria-hidden="true">
            →
          </span>
        </button>
        {skip ? (
          <button type="button" className="oc-dock__quiet" onClick={skip.onClick}>
            {skip.label || 'Skip for now'}
          </button>
        ) : null}
        {back ? (
          <button type="button" className="oc-dock__quiet" onClick={back.onClick}>
            {back.label || 'Back'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
