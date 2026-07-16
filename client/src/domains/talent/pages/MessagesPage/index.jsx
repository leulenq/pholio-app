import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, MessageSquare } from 'lucide-react';
import { talentApi } from '../../api/talent';
import ApplicationMessages from '../../components/ApplicationMessages';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from '../../../../shared/components/NotificationCenter/talentNotifications';
import PholioButton from '../../../../shared/components/ui/PholioButton';
import './MessagesPage.css';

const TALENT_THREADS_QUERY_KEY = ['talent', 'message-threads'];

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

export default function MessagesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get('thread');

  const { data, isLoading, isError } = useQuery({
    queryKey: TALENT_THREADS_QUERY_KEY,
    queryFn: () => talentApi.getMessageThreads(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const threads = useMemo(() => data?.threads ?? [], [data]);
  const totalUnread = data?.unreadCount ?? 0;

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) || null,
    [threads, activeId],
  );

  // Deep-link fallback: if the URL names a thread that isn't in the list yet
  // (e.g. arriving from a notification before the list loads), keep the id so
  // the conversation still opens once threads resolve.
  const selectThread = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('thread', id);
    else next.delete('thread');
    setSearchParams(next, { replace: false });
  };

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

  return (
    <div className="tmx" data-pane={activeThread ? 'conversation' : 'list'}>
      <header className="tmx__masthead">
        <h1 className="tmx__title">Messages</h1>
        <p className="tmx__sub">
          {isLoading
            ? 'Loading your conversations…'
            : !hasThreads
              ? 'Your agency conversations will appear here.'
              : totalUnread > 0
                ? `${threads.length} ${threads.length === 1 ? 'conversation' : 'conversations'} · ${totalUnread} unread`
                : `${threads.length} ${threads.length === 1 ? 'conversation' : 'conversations'}`}
        </p>
      </header>

      <div className="tmx__workspace">
        <aside className="tmx__list" aria-label="Conversations">
          {isLoading ? (
            <div className="tmx__list-loading" role="status" aria-live="polite">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="tmx__row-skel">
                  <span className="tmx__skel-avatar" />
                  <span className="tmx__skel-lines">
                    <span className="tmx__skel-line" />
                    <span className="tmx__skel-line tmx__skel-line--short" />
                  </span>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="tmx__list-state">Could not load your conversations.</div>
          ) : !hasThreads ? (
            <div className="tmx__list-state tmx__list-state--empty">
              No conversations yet.
            </div>
          ) : (
            <ul className="tmx__rows">
              {threads.map((thread) => {
                const isActive = thread.id === activeId;
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
                        <span className="tmx__row-bottom">
                          <span className="tmx__row-preview">{previewFor(thread)}</span>
                          {thread.unreadCount > 0 ? (
                            <span className="tmx__row-unread">
                              {thread.unreadCount} new
                            </span>
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
                  <span className="tmx__convo-meta">Submission conversation</span>
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
              <div className="tmx__convo-body">
                <ApplicationMessages
                  key={activeThread.id}
                  applicationId={activeThread.id}
                  agencyName={activeThread.agencyName}
                  hideTitle
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
                    Choose an agency on the left to read and reply to your messages.
                  </p>
                </>
              ) : (
                <>
                  <p className="tmx__placeholder-title">No conversations yet</p>
                  <p className="tmx__placeholder-copy">
                    When an agency replies to one of your submissions, the
                    conversation opens here — reply from the same place they reach you.
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
