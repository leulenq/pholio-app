import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, MessageSquare } from 'lucide-react';
import { talentApi } from '../../api/talent';
import ApplicationMessages from '../../components/ApplicationMessages';
import { statusConfig } from '../../utils/applicationStatus';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from '../../../../shared/components/NotificationCenter/talentNotifications';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import './MessagesPage.css';

const TALENT_THREADS_QUERY_KEY = ['talent', 'message-threads'];
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'awaiting', label: 'Awaiting you' },
];

function relativeTime(value) {
  if (!value) return '';
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return '';
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return 'AG';
}

function previewFor(thread) {
  const body = thread.preview || '';
  if (!body) return 'No messages yet';
  const prefix = thread.lastSenderType === 'TALENT' ? 'You: ' : '';
  return `${prefix}${body}`;
}

function isAwaitingTalent(thread) {
  return thread.lastSenderType === 'AGENCY';
}

function pickDefaultThreadId(threads) {
  if (!threads.length) return null;
  const unread = threads.find((t) => t.unreadCount > 0);
  if (unread) return unread.id;
  const awaiting = threads.find(isAwaitingTalent);
  if (awaiting) return awaiting.id;
  return threads[0].id;
}

function useIsDesktopInbox() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 881px)').matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 881px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

export default function MessagesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get('thread');
  const [filter, setFilter] = useState('all');
  const isDesktop = useIsDesktopInbox();
  const autoSelectedRef = useRef(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: TALENT_THREADS_QUERY_KEY,
    queryFn: () => talentApi.getMessageThreads(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const threads = useMemo(() => data?.threads ?? [], [data]);
  const totalUnread = data?.unreadCount ?? 0;
  const awaitingCount = useMemo(
    () => threads.filter(isAwaitingTalent).length,
    [threads],
  );

  const filteredThreads = useMemo(() => {
    if (filter === 'unread') return threads.filter((t) => t.unreadCount > 0);
    if (filter === 'awaiting') return threads.filter(isAwaitingTalent);
    return threads;
  }, [threads, filter]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) || null,
    [threads, activeId],
  );

  const activeStatus = activeThread ? statusConfig(activeThread.status) : null;

  const selectThread = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('thread', id);
    else next.delete('thread');
    setSearchParams(next, { replace: false });
  };

  // Desktop: open the most useful thread so the page is ready to work.
  // Mobile keeps the list first so people can scan before committing.
  useEffect(() => {
    if (!isDesktop || isLoading || activeId || autoSelectedRef.current) return;
    if (!threads.length) return;
    autoSelectedRef.current = true;
    const nextId = pickDefaultThreadId(threads);
    if (!nextId) return;
    const next = new URLSearchParams(searchParams);
    next.set('thread', nextId);
    setSearchParams(next, { replace: true });
  }, [isDesktop, isLoading, activeId, threads, searchParams, setSearchParams]);

  // Opening a thread marks its agency messages (and the matching bell
  // notification) read on the server; reflect that here without a full refetch
  // race by optimistically clearing this thread's unread, then reconciling.
  const openedRef = useRef(null);
  useEffect(() => {
    if (!activeId || openedRef.current === activeId) return;
    const target = threads.find((t) => t.id === activeId);
    if (!target || !target.unreadCount) return;
    openedRef.current = activeId;

    queryClient.setQueryData(TALENT_THREADS_QUERY_KEY, (prev) => {
      if (!prev?.threads) return prev;
      const nextThreads = prev.threads.map((t) =>
        t.id === activeId ? { ...t, unread: false, unreadCount: 0 } : t,
      );
      const unreadCount = nextThreads.reduce((n, t) => n + t.unreadCount, 0);
      return { ...prev, threads: nextThreads, unreadCount };
    });

    const settle = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: TALENT_THREADS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
    }, 700);
    return () => clearTimeout(settle);
  }, [activeId, threads, queryClient]);

  const hasThreads = threads.length > 0;
  const hasFiltered = filteredThreads.length > 0;

  const mastheadSub = (() => {
    if (isLoading) return 'Loading your conversations…';
    if (!hasThreads) return 'Agency replies to your submissions land here.';
    const parts = [
      `${threads.length} ${threads.length === 1 ? 'conversation' : 'conversations'}`,
    ];
    if (totalUnread > 0) parts.push(`${totalUnread} unread`);
    if (awaitingCount > 0) parts.push(`${awaitingCount} awaiting you`);
    return parts.join(' · ');
  })();

  return (
    <div className="tmx" data-pane={activeThread ? 'conversation' : 'list'}>
      <header className="tmx__masthead">
        <div className="tmx__masthead-copy">
          <h1 className="tmx__title">Messages</h1>
          <p className="tmx__sub">{mastheadSub}</p>
        </div>

        {hasThreads ? (
          <div className="tmx__filters" role="tablist" aria-label="Filter conversations">
            {FILTERS.map((item) => {
              const isActive = filter === item.id;
              const count =
                item.id === 'unread'
                  ? totalUnread
                  : item.id === 'awaiting'
                    ? awaitingCount
                    : threads.length;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`tmx__filter${isActive ? ' is-active' : ''}`}
                  onClick={() => setFilter(item.id)}
                >
                  <span>{item.label}</span>
                  <span className="tmx__filter-count">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      <div className="tmx__workspace">
        <aside className="tmx__list" aria-label="Conversations">
          {isLoading ? (
            <div className="tmx__list-loading" role="status" aria-live="polite">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="tmx__row-skel">
                  <span className="tmx__skel-avatar" />
                  <span className="tmx__skel-lines">
                    <span className="tmx__skel-line" />
                    <span className="tmx__skel-line tmx__skel-line--mid" />
                    <span className="tmx__skel-line tmx__skel-line--short" />
                  </span>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="tmx__list-state">Could not load your conversations.</div>
          ) : !hasThreads ? (
            <div className="tmx__list-state tmx__list-state--empty">
              <p className="tmx__list-state-title">No conversations yet</p>
              <p className="tmx__list-state-copy">
                When an agency replies to a submission, the thread opens here.
              </p>
            </div>
          ) : !hasFiltered ? (
            <div className="tmx__list-state">
              <p className="tmx__list-state-title">Nothing in this view</p>
              <p className="tmx__list-state-copy">
                {filter === 'unread'
                  ? 'You are caught up — no unread messages.'
                  : 'No agency notes are waiting on a reply.'}
              </p>
              <button
                type="button"
                className="tmx__list-state-action"
                onClick={() => setFilter('all')}
              >
                Show all
              </button>
            </div>
          ) : (
            <ul className="tmx__rows">
              {filteredThreads.map((thread) => {
                const isActive = thread.id === activeId;
                const status = statusConfig(thread.status);
                const awaiting = isAwaitingTalent(thread);
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      className={`tmx__row${isActive ? ' is-active' : ''}${thread.unread ? ' is-unread' : ''}`}
                      onClick={() => selectThread(thread.id)}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <span className="tmx__avatar" aria-hidden>
                        {thread.agencyLogo ? (
                          <img src={thread.agencyLogo} alt="" />
                        ) : (
                          <span>{initialsFor(thread.agencyName)}</span>
                        )}
                      </span>
                      <span className="tmx__row-body">
                        <span className="tmx__row-top">
                          <span className="tmx__row-name">{thread.agencyName}</span>
                          <span className="tmx__row-time">{relativeTime(thread.timestamp)}</span>
                        </span>
                        <span className="tmx__row-preview">{previewFor(thread)}</span>
                        <span className="tmx__row-meta">
                          <span className={`tmx__status tmx__status--${status.tone}`}>
                            {status.short}
                          </span>
                          {thread.unreadCount > 0 ? (
                            <span className="tmx__row-flag">
                              {thread.unreadCount === 1
                                ? '1 new'
                                : `${thread.unreadCount} new`}
                            </span>
                          ) : awaiting ? (
                            <span className="tmx__row-flag">Your reply</span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="tmx__conversation" aria-label="Conversation">
          {activeThread ? (
            <>
              <div className="tmx__convo-head">
                <button
                  type="button"
                  className="tmx__back"
                  onClick={() => selectThread(null)}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={16} strokeWidth={1.75} />
                </button>
                <span className="tmx__convo-avatar" aria-hidden>
                  {activeThread.agencyLogo ? (
                    <img src={activeThread.agencyLogo} alt="" />
                  ) : (
                    <span>{initialsFor(activeThread.agencyName)}</span>
                  )}
                </span>
                <span className="tmx__convo-identity">
                  <span className="tmx__convo-name">{activeThread.agencyName}</span>
                  <span className="tmx__convo-meta">
                    <span className={`tmx__status tmx__status--${activeStatus.tone}`}>
                      {activeStatus.label}
                    </span>
                    <span className="tmx__convo-sep" aria-hidden>
                      ·
                    </span>
                    <span>Submission thread</span>
                  </span>
                </span>
                <PholioButton
                  as="a"
                  href={`/dashboard/talent/applications?application=${activeThread.id}`}
                  variant="tertiary"
                  className="tmx__convo-link"
                >
                  <span>View submission</span>
                  <ExternalLink size={13} aria-hidden />
                </PholioButton>
              </div>

              {activeStatus?.next ? (
                <p className="tmx__convo-cue">{activeStatus.next}</p>
              ) : null}

              <div className="tmx__convo-body">
                <ApplicationMessages
                  key={activeThread.id}
                  applicationId={activeThread.id}
                  agencyName={activeThread.agencyName}
                  hideTitle
                  variant="workspace"
                />
              </div>
            </>
          ) : (
            <div className="tmx__placeholder">
              <span className="tmx__placeholder-icon" aria-hidden>
                <MessageSquare size={22} strokeWidth={1.5} />
              </span>
              {hasThreads ? (
                <>
                  <p className="tmx__placeholder-title">Select a conversation</p>
                  <p className="tmx__placeholder-copy">
                    Pick an agency on the left to read the thread and reply.
                  </p>
                </>
              ) : (
                <>
                  <p className="tmx__placeholder-title">Waiting on agency replies</p>
                  <p className="tmx__placeholder-copy">
                    Conversations stay tied to each submission. When a booker
                    writes back, reply from the same place they reach you.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
