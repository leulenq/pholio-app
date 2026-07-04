import { useMemo, useState } from 'react';
import { Bell, ChevronRight } from 'lucide-react';
import PholioButton, {
  PholioToggleButton,
  PholioToggleGroup,
} from '../ui/PholioButton';
import {
  filterNotifications,
  getDetailCardText,
  getFilterTabs,
  getHeadlineParts,
  getNotificationVisual,
} from './notificationHelpers';
import './NotificationCenter.css';

export default function NotificationPanel({
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
  const titleId = 'nc-dropdown-title';

  const visibleItems = useMemo(
    () => filterNotifications(notifications, activeFilter, variant),
    [notifications, activeFilter, variant],
  );

  return (
    <div
      className={`nc-dropdown ${className}`.trim()}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-label="Notification menu"
    >
      <header className="nc-dropdown__head">
        <div className="nc-dropdown__head-row">
          <div className="nc-dropdown__title-wrap">
            <h2 id={titleId} className="nc-dropdown__title">
              Notifications
            </h2>
            {unreadCount > 0 ? <span aria-label={`${unreadCount} unread`}>{unreadCount} unread</span> : null}
          </div>
          {unreadCount > 0 ? (
            <PholioButton
              type="button"
              variant="tertiary"
              className="nc-dropdown__mark-all"
              disabled={markAllPending}
              onClick={onMarkAllRead}
            >
              Mark all read
            </PholioButton>
          ) : null}
        </div>

        <PholioToggleGroup className="nc-dropdown__filters" role="tablist" aria-label="Filter notifications">
          {filters.map((filter) => (
            <PholioToggleButton
              key={filter.id}
              type="button"
              role="tab"
              active={activeFilter === filter.id}
              aria-selected={activeFilter === filter.id}
              className={`nc-dropdown__filter${activeFilter === filter.id ? ' is-active' : ''}`}
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label}
            </PholioToggleButton>
          ))}
        </PholioToggleGroup>
      </header>

      <div className="nc-dropdown__body">
        {isLoading && (
          <div className="nc-dropdown__state" role="status" aria-live="polite">
            <div className="nc-skeleton nc-skeleton--line" />
            <div className="nc-skeleton nc-skeleton--line nc-skeleton--line-short" />
            <div className="nc-skeleton nc-skeleton--line" />
          </div>
        )}

        {isError && (
          <div className="nc-dropdown__state nc-dropdown__state--error">
            Could not load notifications.
          </div>
        )}

        {!isLoading && !isError && visibleItems.length === 0 && (
          <div className="nc-dropdown__empty">
            <span className="nc-dropdown__empty-icon" aria-hidden>
              <Bell size={18} strokeWidth={1.75} />
            </span>
            <p className="nc-dropdown__empty-title">No notifications</p>
            <p className="nc-dropdown__empty-copy">
              Activity from agencies and applications will appear here.
            </p>
          </div>
        )}

        {!isLoading && !isError && visibleItems.length > 0 && (
          <nav className="nc-dropdown__list" aria-label="Notification list">
            <ul>
              {visibleItems.map((item) => {
                const detail = getDetailCardText(item);
                const headline = getHeadlineParts(item);
                const { accent, icon: Icon } = getNotificationVisual(item.type);
                const ariaLabel = `${headline.before}${headline.emphasis}${headline.after}${item.isRead ? '' : ', unread'}`;

                return (
                  <li key={item.id}>
                    <PholioButton
                      type="button"
                      variant="tertiary"
                      className={`nc-dropdown__item${item.isRead ? '' : ' is-unread'}`}
                      onClick={() => onItemClick?.(item)}
                      aria-label={ariaLabel}
                    >
                      <span className={`nc-dropdown__icon nc-dropdown__icon--${accent}`}>
                        <Icon size={14} strokeWidth={2} aria-hidden />
                      </span>
                      <span className="nc-dropdown__main">
                        <span className="nc-dropdown__text">
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
                        {detail ? <span className="nc-dropdown__detail">{detail}</span> : null}
                        <span className="nc-dropdown__time">{item.timeAgo || 'Recently'}</span>
                      </span>
                      {item.isRead ? null : (
                        <span className="nc-dropdown__unread-mark">New</span>
                      )}
                    </PholioButton>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>

      {footerHref || onFooterClick ? (
        <footer className="nc-dropdown__foot">
          {footerHref ? (
            <PholioButton as="a" href={footerHref} variant="meta" fullWidth className="nc-dropdown__foot-link" onClick={onFooterClick}>
              {footerLabel}
              <ChevronRight size={14} aria-hidden className="nc-dropdown__foot-chev" />
            </PholioButton>
          ) : (
            <PholioButton
              type="button"
              variant="meta"
              fullWidth
              className="nc-dropdown__foot-link"
              onClick={onFooterClick}
            >
              {footerLabel}
              <ChevronRight size={14} aria-hidden className="nc-dropdown__foot-chev" />
            </PholioButton>
          )}
        </footer>
      ) : null}
    </div>
  );
}
