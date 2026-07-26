import React, { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import PholioBillingWordmark from '../../../../shared/components/billing/PholioBillingWordmark';
import { CHAPTERS } from './chapters';

/**
 * The full-screen setup environment.
 *
 * There is no card and no second panel: the cream surface is the page. The
 * masthead, the progress rule, and the chapter index run the full width, the
 * work sits in the main column, and the house voice sits in the margin beside
 * it. Only the chapter content changes between beats.
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
    <div className="stg">
      <header className="stg-masthead">
        <div className="stg-masthead__inner">
          <div className="stg-wordmark" role="img" aria-label="Pholio">
            <PholioBillingWordmark variant="on-cream" size="sm" />
          </div>

          <div className="stg-masthead__end">
            <p className={`stg-lockup${agencyName ? '' : ' is-unnamed'}`}>
              <strong>{agencyName || 'Your agency'}</strong>
              <span>{agencyMarket || 'Private workspace'}</span>
            </p>
            <button type="button" className="stg-signout" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>

        <div className="stg-progress" aria-hidden="true">
          <span style={{ '--stg-progress': (chapterIndex + 1) / CHAPTERS.length }} />
        </div>
      </header>

      <nav className="stg-index" aria-label="Agency setup chapters">
        <ol>
          {CHAPTERS.map((entry, index) => (
            <li
              key={entry.id}
              className={
                index < chapterIndex ? 'is-done' : index === chapterIndex ? 'is-current' : ''
              }
              aria-current={index === chapterIndex ? 'step' : undefined}
            >
              {entry.name}
            </li>
          ))}
        </ol>
        <p className="stg-index__marker">
          Chapter {chapterIndex + 1} of {CHAPTERS.length}
        </p>
      </nav>

      <main key={chapter.id} className="stg-body">
        <div className="stg-column">
          <h1 ref={titleRef} tabIndex={-1}>{chapter.title}</h1>
          <p className="stg-lede">{chapter.lede}</p>
          <div className="stg-work">{children}</div>
        </div>

        {/* Marginalia, not a panel: same surface, no fill, no border. */}
        <aside className="stg-margin">
          <h2>{chapter.voice.heading}</h2>
          <p>{chapter.voice.body}</p>
        </aside>
      </main>

      <footer className="stg-dock">
        <div className="stg-dock__inner">
          {error ? <p className="stg-dock__error" role="alert">{error}</p> : null}
          <div className="stg-dock__actions">
            <button
              type="button"
              className="stg-button stg-button--ghost"
              onClick={onBack}
              disabled={chapterIndex === 0 || isBusy}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              className="stg-button stg-button--primary"
              onClick={onContinue}
              disabled={isBusy || !canContinue}
            >
              {isBusy ? 'Saving…' : isFinalChapter ? 'Open the workspace' : 'Continue'}
              {isBusy ? null : <ArrowRight size={15} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
