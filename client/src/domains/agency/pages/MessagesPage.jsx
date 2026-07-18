import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Send, Inbox, MessageSquare, ArrowUpRight } from 'lucide-react';
import { getMessageThreads, getMessages, sendMessage, markMessageAsRead } from '../api/agency';
import { AgencySkeleton } from '../components/ui/AgencySkeleton';
import { AgencyEmptyState } from '../components/ui/AgencyEmptyState';
import './MessagesPage.css';

/** Initials for the avatar fallback. */
function getInitials(name = '') {
  if (!name.trim()) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Compact relative time for the thread list. */
function formatThreadTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Clock time inside a bubble. */
function formatClock(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Serif-friendly date-rule label. */
function formatDateRule(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function ThreadAvatar({ name, src }) {
  return src ? (
    <img className="mc-avatar" src={src} alt="" loading="lazy" />
  ) : (
    <span className="mc-avatar mc-avatar--fallback" aria-hidden="true">
      {getInitials(name)}
    </span>
  );
}

export default function MessagesPage() {
  // BEHAVIOR FIX: no auto-selection. A thread only becomes active on an
  // explicit user click, which is what gates the mark-as-read flow below.
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);
  const queryClient = useQueryClient();

  // 1. Threads (inbox) — keys + interval preserved.
  const { data: threads = [], isLoading: isThreadsLoading } = useQuery({
    queryKey: ['agency', 'messages', 'threads'],
    queryFn: getMessageThreads,
    refetchInterval: 30000,
  });

  // 2. Messages for the explicitly selected thread — keys + interval preserved.
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery({
    queryKey: ['agency', 'messages', 'thread', activeThreadId],
    queryFn: () => getMessages(activeThreadId),
    enabled: !!activeThreadId,
    refetchInterval: 10000,
  });

  // 3. Mark talent messages read — only ever runs for an explicitly opened
  // thread (activeThreadId is set solely by a user click), never on load.
  useEffect(() => {
    if (!activeThreadId || messages.length === 0) return;
    const unread = messages.filter((m) => !m.is_read && m.sender_type === 'TALENT');
    if (unread.length === 0) return;
    Promise.all(unread.map((m) => markMessageAsRead(m.id))).then(() => {
      queryClient.invalidateQueries({ queryKey: ['agency', 'messages', 'threads'] });
    });
  }, [activeThreadId, messages, queryClient]);

  // 4. Send.
  const sendMutation = useMutation({
    mutationFn: (text) => sendMessage(activeThreadId, text),
    onSuccess: () => {
      setMessageInput('');
      queryClient.invalidateQueries({ queryKey: ['agency', 'messages', 'thread', activeThreadId] });
      queryClient.invalidateQueries({ queryKey: ['agency', 'messages', 'threads'] });
    },
  });

  // Auto-scroll to the latest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Single-line-growing composer.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [messageInput]);

  const handleSelectThread = (id) => {
    setActiveThreadId(id);
    setMessageInput('');
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (!messageInput.trim() || sendMutation.isPending || !activeThreadId) return;
    sendMutation.mutate(messageInput.trim());
  };

  const filteredThreads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        (t.senderName || '').toLowerCase().includes(q) ||
        (t.applicationLabel || '').toLowerCase().includes(q),
    );
  }, [threads, searchTerm]);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  return (
    <div className="mc-page">
      <header className="mc-header">
        <h1 className="mc-page-title">Messages</h1>
        <p className="mc-page-sub">Correspondence between your house and its talent</p>
      </header>

      <div className="mc-shell">
        {/* ── Thread list ── */}
        <aside className="mc-list" aria-label="Conversations">
          <div className="mc-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="text"
              className="mc-search-input"
              placeholder="Search talent or application…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search conversations"
            />
          </div>

          <div className="mc-threads">
            {isThreadsLoading ? (
              <div className="mc-threads-loading">
                <AgencySkeleton variant="row" count={6} />
              </div>
            ) : filteredThreads.length === 0 ? (
              <AgencyEmptyState
                icon={Inbox}
                title={searchTerm ? 'No matching conversations' : 'No conversations yet'}
                description={
                  searchTerm
                    ? 'No talent or application matches your search.'
                    : 'When talent reply to your outreach, their threads gather here.'
                }
              />
            ) : (
              filteredThreads.map((thread) => {
                const selected = activeThreadId === thread.id;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={`mc-thread${selected ? ' mc-thread--selected' : ''}${
                      thread.unread ? ' mc-thread--unread' : ''
                    }`}
                    onClick={() => handleSelectThread(thread.id)}
                    aria-pressed={selected}
                  >
                    <ThreadAvatar name={thread.senderName} src={thread.senderAvatar} />
                    <span className="mc-thread-body">
                      <span className="mc-thread-top">
                        <span className="mc-thread-name">{thread.senderName}</span>
                        <span className="mc-thread-time">{formatThreadTime(thread.timestamp)}</span>
                      </span>
                      <span className="mc-thread-context">{thread.applicationLabel}</span>
                      <span className="mc-thread-preview">{thread.preview}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── Thread pane ── */}
        <main className="mc-pane">
          {!activeThread ? (
            <div className="mc-pane-empty">
              <AgencyEmptyState
                icon={MessageSquare}
                title="Select a conversation"
                description="Choose a thread from the left to read and reply to your talent."
              />
            </div>
          ) : (
            <>
              <header className="mc-pane-head">
                <ThreadAvatar name={activeThread.senderName} src={activeThread.senderAvatar} />
                <div className="mc-pane-head-text">
                  <Link
                    to={`/dashboard/agency/talent/${activeThread.id}`}
                    className="mc-pane-name"
                  >
                    {activeThread.senderName}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                  <span className="mc-pane-context">{activeThread.applicationLabel}</span>
                </div>
              </header>

              <div className="mc-viewport">
                {isMessagesLoading && messages.length === 0 ? (
                  <div className="mc-viewport-loading">
                    <AgencySkeleton variant="row" count={4} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="mc-thread-empty">
                    <p>No messages in this thread yet. Send the first note below.</p>
                  </div>
                ) : (
                  <div className="mc-messages">
                    {messages.map((msg, idx) => {
                      const isAgency = msg.sender_type === 'AGENCY';
                      const prev = messages[idx - 1];
                      const showDate =
                        idx === 0 ||
                        new Date(prev.created_at).toDateString() !==
                          new Date(msg.created_at).toDateString();
                      return (
                        <React.Fragment key={msg.id}>
                          {showDate && (
                            <div className="mc-date-rule">
                              <span>{formatDateRule(msg.created_at)}</span>
                            </div>
                          )}
                          <div className={`mc-msg${isAgency ? ' mc-msg--agency' : ' mc-msg--talent'}`}>
                            <div className="mc-msg-body">
                              <p className="mc-msg-text">{msg.message}</p>
                              <span className="mc-msg-meta">
                                {formatClock(msg.created_at)}
                                {isAgency && (
                                  <span className="mc-msg-receipt">
                                    {msg.is_read ? '· Read' : '· Sent'}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <form className="mc-composer" onSubmit={handleSend}>
                <textarea
                  ref={composerRef}
                  className="mc-composer-input"
                  rows={1}
                  placeholder="Write a reply…"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  aria-label="Write a reply"
                />
                <button
                  type="submit"
                  className="mc-send"
                  disabled={!messageInput.trim() || sendMutation.isPending}
                  aria-label="Send message"
                >
                  <Send size={17} aria-hidden="true" />
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
