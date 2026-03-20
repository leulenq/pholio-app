import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Send, 
  User,
  Inbox,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMessageThreads, getMessages, sendMessage, markMessageAsRead } from '../../api/agency';
import './MessagesPage.css';

/** Returns initials from a full name */
function getInitials(name = '') {
  if (!name.trim()) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Formats an ISO timestamp nicely */
function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

export default function MessagesPage() {
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  // 1. Fetch Threads
  const { data: threads = [], isLoading: isThreadsLoading } = useQuery({
    queryKey: ['agency', 'messages', 'threads'],
    queryFn: getMessageThreads,
    refetchInterval: 30000,
  });

  // 2. Fetch Messages for active thread
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery({
    queryKey: ['agency', 'messages', 'thread', activeThreadId],
    queryFn: () => getMessages(activeThreadId),
    enabled: !!activeThreadId,
    refetchInterval: 10000,
  });

  // 3. Mark as read when thread becomes active or new messages arrive
  useEffect(() => {
    if (activeThreadId && messages.length > 0) {
      const unread = messages.filter(m => !m.is_read && m.sender_type === 'TALENT');
      if (unread.length > 0) {
        // Mark all as read
        Promise.all(unread.map(m => markMessageAsRead(m.id))).then(() => {
          queryClient.invalidateQueries(['agency', 'messages', 'threads']);
        });
      }
    }
  }, [activeThreadId, messages, queryClient]);

  // 4. Send Message Mutation
  const sendMutation = useMutation({
    mutationFn: (text) => sendMessage(activeThreadId, text),
    onSuccess: () => {
      setMessageInput('');
      queryClient.invalidateQueries(['agency', 'messages', 'thread', activeThreadId]);
      queryClient.invalidateQueries(['agency', 'messages', 'threads']);
    }
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e?.preventDefault();
    if (!messageInput.trim() || sendMutation.isPending) return;
    sendMutation.mutate(messageInput.trim());
  };

  const filteredThreads = threads.filter(t => 
    t.senderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.applicationLabel.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeThread = threads.find(t => t.id === activeThreadId);

  // Set first thread as active initially if none selected
  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThreadId(threads[0].id);
    }
  }, [threads, activeThreadId]);

  return (
    <div className="st-messages-page">
      <div className="st-page-grain" />
      <div className="st-messages-container">
        {/* Left Sidebar: Threads List */}
        <aside className="st-inbox-sidebar">
          <header className="st-inbox-header">
            <h1 className="st-inbox-title">Inbox</h1>
            <div className="st-inbox-actions">
              <div className="st-search-wrapper">
                <Search size={16} />
                <input 
                  type="text" 
                  placeholder="Search messages..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </header>

          <div className="st-threads-list">
            {isThreadsLoading ? (
              <div className="st-messages-state">
                <Loader2 className="animate-spin" />
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="st-messages-state">
                <Inbox size={40} strokeWidth={1} />
                <p>No messages found</p>
              </div>
            ) : (
              filteredThreads.map(thread => (
                <button
                  key={thread.id}
                  className={`st-thread-item ${activeThreadId === thread.id ? 'active' : ''} ${thread.unread ? 'unread' : ''}`}
                  onClick={() => setActiveThreadId(thread.id)}
                >
                  <div className="st-thread-avatar">
                    {thread.senderAvatar ? (
                      <img src={thread.senderAvatar} alt={thread.senderName} />
                    ) : (
                      <div className="st-avatar-placeholder">
                        {getInitials(thread.senderName)}
                      </div>
                    )}
                    {thread.unread && <span className="st-unread-dot" />}
                  </div>
                  <div className="st-thread-info">
                    <div className="st-thread-top">
                      <span className="st-thread-name">{thread.senderName}</span>
                      <span className="st-thread-time">{formatTime(thread.timestamp)}</span>
                    </div>
                    <div className="st-thread-label">{thread.applicationLabel}</div>
                    <div className="st-thread-preview">{thread.preview}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Right Pane: Message Thread */}
        <main className="st-message-pane">
          {activeThread ? (
            <>
              <header className="st-active-thread-header">
                <div className="st-active-user-info">
                  <div className="st-active-avatar">
                    {activeThread.senderAvatar ? (
                      <img src={activeThread.senderAvatar} alt={activeThread.senderName} />
                    ) : (
                      <div className="st-avatar-placeholder">
                        {getInitials(activeThread.senderName)}
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="st-active-name">{activeThread.senderName}</h2>
                    <p className="st-active-context">{activeThread.applicationLabel}</p>
                  </div>
                </div>
                <div className="st-active-actions">
                  <button className="st-icon-btn"><User size={18} /></button>
                  <button className="st-icon-btn"><MoreHorizontal size={18} /></button>
                </div>
              </header>

              <div className="st-messages-viewport">
                <div className="st-messages-scroll-area">
                  {isMessagesLoading && !messages.length ? (
                    <div className="st-messages-state">
                      <Loader2 className="animate-spin" />
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, idx) => {
                        const isAgency = msg.sender_type === 'AGENCY';
                        const showDate = idx === 0 || 
                          new Date(messages[idx-1].created_at).toDateString() !== new Date(msg.created_at).toDateString();
                        
                        return (
                          <React.Fragment key={msg.id}>
                            {showDate && (
                              <div className="st-date-divider">
                                <span>{new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </div>
                            )}
                            <div className={`st-msg-bubble-wrapper ${isAgency ? 'agency' : 'talent'}`}>
                              <div className="st-msg-bubble">
                                <p className="st-msg-text">{msg.message}</p>
                                <div className="st-msg-meta">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {isAgency && (
                                    <span className="st-msg-status">
                                      {msg.is_read ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>
              </div>

              <footer className="st-message-input-area">
                <form className="st-message-form" onSubmit={handleSend}>
                  <textarea 
                    placeholder="Type a message..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <button 
                    type="submit" 
                    className="st-send-btn"
                    disabled={!messageInput.trim() || sendMutation.isPending}
                  >
                    {sendMutation.isPending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                  </button>
                </form>
              </footer>
            </>
          ) : (
            <div className="st-empty-state">
              <Inbox size={64} strokeWidth={0.5} />
              <h3>Your Conversations</h3>
              <p>Select a message thread from the sidebar to start chatting with talent.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
