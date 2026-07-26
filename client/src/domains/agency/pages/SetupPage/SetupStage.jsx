import React, { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import PholioBillingWordmark from '../../../../shared/components/billing/PholioBillingWordmark';
import { CHAPTERS } from './chapters';

/**
 * The threshold shell: a dark stage carrying one lit paper panel.
 *
 * The paper holds the work for the current chapter; the stage beside it holds
 * the sequence, the house voice, and the agency lockup as it forms. Only the
 * chapter body changes between beats — the frame never moves.
 */
export default function SetupStage({
  chapterIndex,
  agencyName,
  agencyMarket,
  isBusy,
  canContinue,
  error,
  onBack,
  onContinue,
  onSignOut,
  children,
}) {
  const chapter = CHAPTERS[chapterIndex];
  const isFinalChapter = chapterIndex === CHAPTERS.length - 1;
  const titleRef = useRef(null);
  const hasMountedRef = useRef(false);

  // Move focus to the new chapter title so keyboard and screen-reader users
  // land on the beat they just advanced to. Skipped on first paint.
  useEffect(() => {
    if (hasMountedRef.current) titleRef.current?.focus();
    else hasMountedRef.current = true;
  }, [chapterIndex]);

  return (
    <main className="thr-stage">
      <div className="thr-stage__light" aria-hidden="true" />

      <div className="thr-shell">
        <section className="thr-paper" aria-labelledby="thr-chapter-title">
          <header className="thr-paper__head">
            <div className="thr-paper__wordmark" role="img" aria-label="Pholio">
              <PholioBillingWordmark variant="on-cream" size="sm" />
            </div>
            <p className="thr-paper__marker">
              Chapter {chapterIndex + 1} of {CHAPTERS.length}
            </p>
          </header>

          <div className="thr-progress" aria-hidden="true">
            <span style={{ '--thr-progress': (chapterIndex + 1) / CHAPTERS.length }} />
          </div>

          <div key={chapter.id} className="thr-beat">
            <h1 id="thr-chapter-title" ref={titleRef} tabIndex={-1}>{chapter.title}</h1>
            <p className="thr-paper__lede">{chapter.lede}</p>
            <div className="thr-body">{children}</div>
          </div>

          <footer className="thr-dock">
            {error ? (
              <p className="thr-dock__error" role="alert">{error}</p>
            ) : null}
            <div className="thr-dock__actions">
              <button
                type="button"
                className="thr-button thr-button--ghost"
                onClick={onBack}
                disabled={chapterIndex === 0 || isBusy}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                className="thr-button thr-button--primary"
                onClick={onContinue}
                disabled={isBusy || !canContinue}
              >
                {isBusy
                  ? 'Saving…'
                  : isFinalChapter
                    ? 'Open the workspace'
                    : 'Continue'}
                {isBusy ? null : <ArrowRight size={15} aria-hidden="true" />}
              </button>
            </div>
          </footer>
        </section>

        <aside className="thr-side">
          <nav className="thr-sequence" aria-label="Agency setup chapters">
            <ol>
              {CHAPTERS.map((entry, index) => {
                const state = index < chapterIndex
                  ? 'is-done'
                  : index === chapterIndex
                    ? 'is-current'
                    : '';
                return (
                  <li key={entry.id} className={state} aria-current={index === chapterIndex ? 'step' : undefined}>
                    <span className="thr-sequence__rule" aria-hidden="true" />
                    <span className="thr-sequence__name">{entry.name}</span>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div key={`${chapter.id}-voice`} className="thr-voice">
            <h2>{chapter.voice.heading}</h2>
            <p>{chapter.voice.body}</p>
          </div>

          <div className="thr-side__foot">
            {/* The lockup forms as the agency names itself in chapter one. */}
            <div className={`thr-lockup${agencyName ? '' : ' is-unnamed'}`}>
              <strong>{agencyName || 'Your agency'}</strong>
              <span>{agencyMarket || 'Private workspace'}</span>
            </div>
            <button type="button" className="thr-signout" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
