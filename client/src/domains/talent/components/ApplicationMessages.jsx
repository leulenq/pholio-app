import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from '../../../shared/components/NotificationCenter/NotificationCenter';
import { talentApi } from '../api/talent';
import './ApplicationMessages.css';

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function timeLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ApplicationMessages({ applicationId, agencyName }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const threadKey = ['application-messages', applicationId];
  const threadQuery = useQuery({
    queryKey: threadKey,
    queryFn: () => talentApi.getApplicationMessages(applicationId),
    enabled: !!applicationId,
    staleTime: 1000 * 15,
  });
  const messages = asList(threadQuery.data);

  const send = useMutation({
    mutationFn: (text) => talentApi.sendApplicationMessage(applicationId, text),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: threadKey });
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
    },
    onError: (err) => toast.error(err?.message || 'Could not send your message'),
  });

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };

  return (
    <div className="app-msg">
      <span className="app-msg__title">Messages</span>

      {threadQuery.isLoading ? (
        <p className="app-msg__empty">Loading conversation…</p>
      ) : messages.length === 0 ? (
        <p className="app-msg__empty">
          No messages yet. Send {agencyName || 'the agency'} a note below.
        </p>
      ) : (
        <ol className="app-msg__thread">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`app-msg__bubble app-msg__bubble--${
                m.sender_type === 'TALENT' ? 'me' : 'them'
              }`}
            >
              <p className="app-msg__text">{m.message}</p>
              <span className="app-msg__time">{timeLabel(m.created_at)}</span>
            </li>
          ))}
        </ol>
      )}

      <form className="app-msg__compose" onSubmit={submit}>
        <textarea
          className="app-msg__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${agencyName || 'the agency'}…`}
          rows={2}
          maxLength={4000}
        />
        <button
          type="submit"
          className="app-msg__send"
          disabled={!draft.trim() || send.isPending}
          aria-label="Send message"
        >
          {send.isPending ? (
            <Loader2 size={14} className="app-spin" aria-hidden />
          ) : (
            <Send size={14} aria-hidden />
          )}
        </button>
      </form>
    </div>
  );
}
