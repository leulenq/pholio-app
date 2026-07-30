import { useMemo, useState } from 'react';
import {
  filterNotifications,
  getDetailCardText,
  getFilterTabs,
  getHeadlineParts,
} from './notificationHelpers';
import './NotificationInbox.css';

/**
 * The notification inbox.
 *
 * Written fresh rather than adjusted: the previous panel had accumulated a
 * decorative gold-and-violet header wash, a haloed bell medallion for "nothing
 * happened", a full-width mono footer restating a tab above it, and per-type
 * accent icons — and it leaned on shared button components whose inherited
 * colours went invisible once the header changed.
 *
 * The rules here:
 *   · Paper, not chrome. One surface, hairline rules, no nested boxes.
 *   · Unread is a single gold dot on the reading edge. Not a pill, not a tinted
 *     row, not a "New" chip.
 *   · Every control is a plain element with fully-declared styles, so nothing
 *     inherits from the global talent button reset.
 *   · Nothing appears that has no work to do — no footer over an empty inbox,
 *     no "mark all read" with nothing unread.
 */
export default function NotificationInbox({
  notifications = [],
  unreadCount = 0,
  isLoading = false,
  isError = false,
  variant = 'talent',
  footerLabel = 'View all activity',
  footerHref = null,
  onFooterClick,
  onMarkAllRead,
  onItemClick,
  markAllPending = false,
  className = '',
}) {
  const [activeFilter, setActiveFilter] = useState('all');
  const filters = getFilterTabs(variant);
  const titleId = 'ni-title';

  const visibleItems = useMemo(
    () => filterNotifications(notifications, activeFilter, variant),
    [notifications, activeFilter, variant],
  );

  const hasItems = visibleItems.length > 0;
  const showFoot = hasItems && (footerHref || onFooterClick);

  return (
    <div
      className={`ni ${className}`.trim()}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
    >
      <header className="ni__head">
        <div className="ni__title-row">
          <h2 id={titleId} className="ni__title">Notifications</h2>
          {unreadCount > 0 ? (
            <span className="ni__unread">{unreadCount} unread</span>
          ) : null}
          {unreadCount > 0 ? (
            <button
              type="button"
              className="ni__markall"
              disabled={markAllPending}
              onClick={onMarkAllRead}
            >
              Mark all read
            </button>
          ) : null}
        </div>

        <div className="ni__filters" role="tablist" aria-label="Filter notifications">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={activeFilter === filter.id}
              className="ni__filter"
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      <div className="ni__body">
        {isLoading ? (
          <div className="ni__loading" role="status" aria-live="polite">
            <div className="ni__sk" />
            <div className="ni__sk" />
            <div className="ni__sk" />
          </div>
        ) : null}

        {!isLoading && isError ? (
          <p className="ni__error">Could not load notifications.</p>
        ) : null}

        {!isLoading && !isError && !hasItems ? (
          <div className="ni__empty">
            <p className="ni__empty-title">Nothing yet</p>
            <p className="ni__empty-copy">
              When an agency opens your book, replies, or moves an application,
              it arrives here.
            </p>
          </div>
        ) : null}

        {!isLoading && !isError && hasItems ? (
          <ul className="ni__list">
            {visibleItems.map((item) => {
              const detail = getDetailCardText(item);
              const headline = getHeadlineParts(item);
              const label = `${headline.before}${headline.emphasis}${headline.after}${item.isRead ? '' : ', unread'}`;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="ni__item"
                    onClick={() => onItemClick?.(item)}
                    aria-label={label}
                  >
                    <span
                      className={`ni__dot${item.isRead ? ' ni__dot--read' : ''}`}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="ni__text">
                        {headline.before || headline.after ? (
                          <>
                            {headline.before}
                            <strong>{headline.emphasis}</strong>
                            {headline.after}
                          </>
                        ) : (
                          headline.emphasis
                        )}
                      </span>
                      {detail ? <span className="ni__meta">{detail}</span> : null}
                      <span className="ni__time">{item.timeAgo || 'Recently'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {showFoot ? (
        <footer className="ni__foot">
          {footerHref ? (
            <a href={footerHref} className="ni__foot-link" onClick={onFooterClick}>
              {footerLabel}
            </a>
          ) : (
            <button type="button" className="ni__foot-link" onClick={onFooterClick}>
              {footerLabel}
            </button>
          )}
        </footer>
      ) : null}
    </div>
  );
}
