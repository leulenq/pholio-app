import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSignalDigest } from './talentSignalModel';
import './TalentSignalPanel.css';

/**
 * The talent bell.
 *
 * Three bands — waiting on you, what changed, who's looking — and nothing else.
 * The band a row sits in is the entire triage, so the panel does not also print
 * a verdict line above it, a count beside it, or a synthesised verb beneath each
 * row: every one of those said a third time what the band header and the
 * server's own copy had already said.
 *
 * It also has no title bar. A titled masthead above the first band rail was two
 * headers stacked, and the control the reader just pressed already names the
 * surface. "Mark all read" rides on the first rail instead of needing a bar of
 * its own.
 *
 * Hierarchy comes from density and weight rather than from furniture. An action
 * row runs two lines, an agency view one. Read rows recede — that is the whole
 * unread treatment: no dot, no stripe, no chip, no badge.
 *
 * Every control declares its own box, type and colour in full so nothing
 * inherits from the global button reset.
 */
export default function TalentSignalPanel({
  notifications = [],
  unreadCount = 0,
  isLoading = false,
  isError = false,
  markAllPending = false,
  onMarkAllRead,
  onItemClick,
  onRetry,
}) {
  const panelRef = useRef(null);
  const [expanded, setExpanded] = useState(() => ({}));

  const digest = useMemo(() => buildSignalDigest(notifications), [notifications]);
  const hasItems = digest.bands.length > 0;

  // A popup that opens under the keyboard should put the reader inside it; the
  // layout's Escape handler hands focus back to the bell on the way out.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  let rowIndex = 0;

  return (
    <div className="sig" ref={panelRef} tabIndex={-1} aria-label="Signals">
      <div className="sig__body">
        {isLoading ? (
          <div className="sig__ghosts" role="status" aria-label="Loading signals">
            {[0, 1, 2].map((i) => (
              <div className="sig__ghost" key={i}>
                <span className="sig__ghost-bar sig__ghost-bar--title" />
                <span className="sig__ghost-bar sig__ghost-bar--body" />
              </div>
            ))}
          </div>
        ) : null}

        {!isLoading && isError ? (
          <div className="sig__state">
            <p className="sig__state-title">Signals didn’t load</p>
            <p className="sig__state-copy">
              Nothing has been lost — the panel just couldn’t reach them.
            </p>
            {onRetry ? (
              <button type="button" className="sig__retry" onClick={onRetry}>
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        {!isLoading && !isError && !hasItems ? (
          <div className="sig__state">
            <p className="sig__state-title">No signals yet</p>
            <p className="sig__state-copy">
              When an agency opens your book, writes to you, or moves a
              submission forward, it lands here first.
            </p>
          </div>
        ) : null}

        {!isLoading && !isError && hasItems
          ? digest.bands.map((band, bandIndex) => {
              const isOpen = Boolean(expanded[band.id]);
              const visible = isOpen ? band.items : band.items.slice(0, band.previewLimit);
              const hidden = band.items.length - visible.length;

              return (
                <section className={`sig__band sig__band--${band.id}`} key={band.id}>
                  <div className="sig__band-rail">
                    <h3 className="sig__band-label">{band.label}</h3>
                    {bandIndex === 0 && unreadCount > 0 ? (
                      <button
                        type="button"
                        className="sig__markall"
                        disabled={markAllPending}
                        onClick={onMarkAllRead}
                      >
                        {markAllPending ? 'Marking…' : 'Mark all read'}
                      </button>
                    ) : null}
                  </div>

                  <ul className="sig__list">
                    {visible.map((item) => {
                      const { before, name, after } = item.title;
                      const repeats =
                        item.type === 'message_received' && item.occurrenceCount > 1
                          ? item.occurrenceCount
                          : null;
                      const label = [
                        `${before}${name}${after}`,
                        item.detail,
                        band.label,
                        item.isRead ? null : 'unread',
                      ]
                        .filter(Boolean)
                        .join(' — ');

                      rowIndex += 1;
                      return (
                        <li key={item.id} style={{ '--sig-i': Math.min(rowIndex, 10) }}>
                          <button
                            type="button"
                            className={`sig__row${item.isRead ? ' is-read' : ''}`}
                            onClick={() => onItemClick?.(item)}
                            aria-label={label}
                          >
                            <span className="sig__row-head">
                              <span className="sig__row-title">
                                {before}
                                <strong>{name}</strong>
                                {after}
                              </span>
                              <span className="sig__row-time">
                                {repeats ? (
                                  <span className="sig__row-repeats">{repeats}</span>
                                ) : null}
                                {item.time}
                              </span>
                            </span>

                            {item.detail ? (
                              <span className="sig__row-detail">{item.detail}</span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}

                    {hidden > 0 ? (
                      <li>
                        <button
                          type="button"
                          className="sig__more"
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [band.id]: true }))
                          }
                        >
                          Show {hidden} more
                        </button>
                      </li>
                    ) : null}
                  </ul>
                </section>
              );
            })
          : null}
      </div>
    </div>
  );
}
