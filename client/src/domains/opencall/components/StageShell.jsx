import React, { useEffect } from 'react';
import './OpenCallStage.css';

/**
 * The dark stage every screen of the anonymous open-call flow stands on.
 *
 * Two ambient orbs, a black ground, and a single centered column. The document
 * surface is painted black for as long as the flow is mounted so the safe-area
 * strip does not render as a white bar above the stage — the same trick
 * `CastingCallPage` uses, with its own class so the two never fight.
 *
 * @param {string}    [label]     Accessible name for the <main> region.
 * @param {boolean}   [busy]      Marks the region aria-busy while loading.
 * @param {ReactNode} children
 */
export default function StageShell({ label, busy = false, children }) {
  useEffect(() => {
    document.body.classList.add('oc-dark-body');
    return () => document.body.classList.remove('oc-dark-body');
  }, []);

  return (
    <div className="oc">
      <div className="oc__orb oc__orb--1" aria-hidden="true" />
      <div className="oc__orb oc__orb--2" aria-hidden="true" />
      <main className="oc__stage" aria-label={label} aria-busy={busy || undefined}>
        {children}
      </main>
    </div>
  );
}
