import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from '../../../shared/components/NotificationCenter/NotificationCenter';
import ReportDialog from '../../../shared/components/ReportDialog';
import { talentApi } from '../api/talent';
import WritingAssistToolbar from '../../../shared/components/writing/WritingAssistToolbar';
import './ApplicationMessages.css';

const POLISH_MIN_LENGTH = 10;

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
  const [prePolishDraft, setPrePolishDraft] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);

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
      setPrePolishDraft(null);
      queryClient.invalidateQueries({ queryKey: threadKey });
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
    },
    onError: (err) => toast.error(err?.message || 'Could not send your message'),
  });

  const polish = useMutation({
    mutationFn: () =>
      talentApi.polishApplicationMessage({
        message: draft,
        agencyName: agencyName || undefined,
      }),
    onSuccess: (result) => {
      const polished = result?.message || result?.data?.message;
      if (!polished) {
        toast.error('Polish returned an empty result');
        return;
      }
      setPrePolishDraft(draft);
      setDraft(polished);
    },
    onError: (err) => {
      if (err?.status === 403) {
        toast.error('Message Polish requires a Studio+ subscription');
      } else {
        toast.error(err?.message || 'Could not polish your message');
      }
    },
  });

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };

  const handleUndo = () => {
    if (prePolishDraft !== null) {
      setDraft(prePolishDraft);
      setPrePolishDraft(null);
    }
  };

  const showToolbar = draft.length >= POLISH_MIN_LENGTH;
  const showUndo = prePolishDraft !== null;

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
              <div className="app-msg__footer">
                <span className="app-msg__time">{timeLabel(m.created_at)}</span>
                {m.sender_type !== 'TALENT' && m.id && (
                  <button
                    type="button"
                    className="app-msg__report"
                    onClick={() =>
                      setReportTarget({
                        targetType: 'message',
                        targetId: m.id,
                        targetLabel: `message from ${agencyName || 'agency'}`,
                      })
                    }
                  >
                    Report
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <form className="app-msg__compose" onSubmit={submit}>
        <div className="app-msg__compose-inner">
          {showToolbar && (
            <WritingAssistToolbar
              className="app-msg__toolbar"
              actions={[{ id: 'polish', label: 'Polish', onClick: () => polish.mutate() }]}
              busy={polish.isPending}
              busyLabel="Polishing…"
              onUndo={handleUndo}
              showUndo={showUndo}
            />
          )}
          <div className="app-msg__input-row">
            <textarea
              className="app-msg__input"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (prePolishDraft !== null) setPrePolishDraft(null);
              }}
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
          </div>
        </div>
      </form>

      <ReportDialog
        open={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        targetType={reportTarget?.targetType}
        targetId={reportTarget?.targetId}
        targetLabel={reportTarget?.targetLabel}
      />
    </div>
  );
}
