import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Loader2, Send, MessageSquare, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  bootstrapReplySession,
  getReplyThread,
  issueReplySessionToken,
  sendReplyMessage,
} from '../api/reply';
import './ReplyPage.css';

function formatTime(isoString) {
  return new Date(isoString).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ReplyPage() {
  const { token } = useParams();
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reply-thread', token],
    queryFn: () => getReplyThread(token),
    enabled: !!token,
    retry: false,
  });

  const openDashboard = useMutation({
    mutationFn: async () => {
      const issued = await issueReplySessionToken(token);
      return bootstrapReplySession(issued.token);
    },
    onSuccess: ({ redirectTo }) => {
      window.location.assign(redirectTo);
    },
    onError: (err) => {
      toast.error(err.message || 'Could not open the dashboard');
    },
  });

  const send = useMutation({
    mutationFn: (text) => sendReplyMessage(token, text),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['reply-thread', token] });
      toast.success('Message sent');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to send message');
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages]);

  const handleSend = () => {
    const text = draft.trim();
    if (text) send.mutate(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) {
    return (
      <div className="reply-page">
        <div className="reply-page__center">
          <Loader2 className="reply-page__spinner" aria-hidden />
          <p>Loading conversation…</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="reply-page">
        <div className="reply-page__center reply-page__center--error">
          <AlertCircle size={32} aria-hidden />
          <h1>Link expired or invalid</h1>
          <p>{error?.message || 'This reply link is no longer valid.'}</p>
          <Link to="/login" className="reply-page__link-btn">
            Sign in to Pholio
          </Link>
        </div>
      </div>
    );
  }

  const { agencyName, talentName, messages = [] } = data;

  return (
    <div className="reply-page">
      <motion.header
        className="reply-page__header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="reply-page__brand">Pholio</div>
        <div className="reply-page__header-copy">
          <h1>Message from {agencyName}</h1>
          <p>Replying as {talentName || 'you'} — no password needed</p>
        </div>
        <button
          type="button"
          className="reply-page__dashboard-link"
          onClick={() => openDashboard.mutate()}
          disabled={openDashboard.isPending}
        >
          {openDashboard.isPending ? 'Opening…' : 'Open dashboard'}
          {!openDashboard.isPending && <ExternalLink size={14} aria-hidden />}
        </button>
      </motion.header>

      <main className="reply-page__main">
        <div className="reply-page__thread">
          {messages.length === 0 ? (
            <div className="reply-page__empty">
              <MessageSquare size={28} aria-hidden />
              <p>No messages yet</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isAgency = msg.sender_type === 'AGENCY';
              return (
                <motion.div
                  key={msg.id}
                  className={`reply-page__msg ${isAgency ? 'reply-page__msg--in' : 'reply-page__msg--out'}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="reply-page__bubble">{msg.message}</div>
                  <div className="reply-page__meta">
                    {isAgency ? agencyName : 'You'} · {formatTime(msg.created_at)}
                  </div>
                </motion.div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="reply-page__composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write your reply…"
            rows={3}
            disabled={send.isPending}
            aria-label="Your reply"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || send.isPending}
            className="reply-page__send"
          >
            {send.isPending ? (
              <Loader2 size={18} className="reply-page__spinner" aria-hidden />
            ) : (
              <Send size={18} aria-hidden />
            )}
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
