/* eslint-disable react-refresh/only-export-components -- context + provider + hooks are colocated by design (single import path for all steps) */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';

/**
 * ActionDock context — the single fixed bottom action for the onboarding flow.
 *
 * A step publishes its action config (label / enabled / onAdvance / optional
 * skip link) via `useActionDock(...)`; the always-mounted `<ActionDock />`
 * reads the current config and renders it. The config is cleared automatically
 * when the publishing step unmounts, so the dock is empty (but keeps its
 * reserved height) between steps.
 */

const ActionDockContext = createContext(null);

function dockPrimitivesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.label === b.label &&
    a.enabled === b.enabled &&
    (!!a.skip) === (!!b.skip) &&
    (a.skip?.label ?? null) === (b.skip?.label ?? null)
  );
}

export function ActionDockProvider({ children }) {
  const [config, setConfig] = useState(null);

  const publish = useCallback((cfg) => {
    setConfig((prev) => (dockPrimitivesEqual(prev, cfg) ? prev : cfg));
  }, []);

  const clear = useCallback(() => setConfig(null), []);

  const value = useMemo(() => ({ config, publish, clear }), [config, publish, clear]);

  return (
    <ActionDockContext.Provider value={value}>
      {children}
    </ActionDockContext.Provider>
  );
}

/** Read the current dock config (used by <ActionDock />). Null when unset. */
export function useActionDockConfig() {
  const ctx = useContext(ActionDockContext);
  return ctx ? ctx.config : null;
}

/**
 * Publish this step's dock action.
 *
 * @param {object}   cfg
 * @param {string}   cfg.label      Button label (e.g. "Continue" / "Confirm").
 * @param {boolean}  cfg.enabled    Lights the button gold when true; dimmed + disabled when false.
 * @param {Function} cfg.onAdvance  Called when the (enabled) button is pressed.
 * @param {object}  [cfg.skip]      Optional "Skip for now" text link: { label?, onClick }.
 *
 * The config is re-published whenever these values change, and cleared when the
 * calling step unmounts.
 */
export function useActionDock({ label = null, enabled = false, onAdvance, skip } = {}) {
  const ctx = useContext(ActionDockContext);

  const onAdvanceRef = useRef(onAdvance);
  const skipRef = useRef(skip);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
    skipRef.current = skip;
  });

  const stableOnAdvance = useCallback((...args) => onAdvanceRef.current?.(...args), []);
  const stableSkipClick = useCallback((...args) => skipRef.current?.onClick?.(...args), []);

  const hasSkip = !!skip;
  const skipLabel = skip?.label ?? null;

  const stableSkip = useMemo(
    () => (hasSkip ? { label: skipLabel, onClick: stableSkipClick } : undefined),
    [hasSkip, skipLabel, stableSkipClick],
  );

  const publishRef = useRef(ctx?.publish);
  const clearRef = useRef(ctx?.clear);

  useEffect(() => {
    publishRef.current = ctx?.publish;
    clearRef.current = ctx?.clear;
  });

  useEffect(() => {
    publishRef.current?.({
      label,
      enabled,
      onAdvance: stableOnAdvance,
      skip: stableSkip,
    });
  }, [label, enabled, stableOnAdvance, stableSkip]);

  useEffect(() => () => clearRef.current?.(), []);
}
