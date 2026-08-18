import React, { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessagesSquare, PenLine, SendHorizontal, Plus } from 'lucide-react';
import { getMessages, sendMessage, getNotes, createNote } from '../../api/agency';
import './TalentThread.css';
import { MetaLine, Moment, Notation } from '../meta';

const fmtDay = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

function Composer({ value, onChange, onSubmit, placeholder, pending, icon: Icon }) {
  const submit = () => { if (value.trim() && !pending) onSubmit(); };
  return (
    <div className="tt-composer">
      <textarea
        className="tt-composer-input"
        rows={1}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
      />
      <button className="tt-composer-send" disabled={!value.trim() || pending} onClick={submit} aria-label="Send">
        <Icon size={16} />
      </button>
    </div>
  );
}

function Empty({ icon: Icon, children }) {
  return (
    <div className="tt-empty">
      <Icon size={26} strokeWidth={1.5} />
      <span className="tt-empty-text">{children}</span>
    </div>
  );
}

function Conversation({ applicationId }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', applicationId],
    queryFn: () => getMessages(applicationId),
    enabled: !!applicationId,
    select: (d) => (Array.isArray(d) ? d : d?.data ?? []),
  });
  const send = useMutation({
    mutationFn: (text) => sendMessage(applicationId, text),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messages', applicationId] }); setDraft(''); },
    onError: () => toast.error('Message failed to send'),
  });

  return (
    <div className="tt-pane">
      <div className="tt-stream">
        {isLoading && <Empty icon={MessagesSquare}>Loading conversation…</Empty>}
        {!isLoading && messages.length === 0 && (
          <Empty icon={MessagesSquare}>No messages yet — say hello below.</Empty>
        )}
        {messages.map((m, i) => {
          const day = new Date(m.created_at).toDateString();
          const showDay = i === 0 || day !== new Date(messages[i - 1].created_at).toDateString();
          const out = m.sender_type === 'AGENCY';
          return (
            <Fragment key={m.id}>
              {showDay && <div className="tt-day"><span>{fmtDay(m.created_at)}</span></div>}
              <div className={`tt-msg ${out ? 'tt-msg--out' : 'tt-msg--in'}`}>
                <div className="tt-bubble">{m.message}</div>
                <MetaLine className="tt-meta" size="sm">
                  {out ? 'You' : m.sender_name || 'Talent'}
                  <Moment value={m.created_at} as="time" size="sm" />
                </MetaLine>
              </div>
            </Fragment>
          );
        })}
      </div>
      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={() => send.mutate(draft.trim())}
        pending={send.isPending}
        placeholder="Write a message to the talent…"
        icon={SendHorizontal}
      />
    </div>
  );
}

function Notes({ applicationId }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const { data: notes = [] } = useQuery({
    queryKey: ['notes', applicationId],
    queryFn: () => getNotes(applicationId),
    enabled: !!applicationId,
    select: (d) => (Array.isArray(d) ? d : d?.data ?? []),
  });
  const add = useMutation({
    mutationFn: (text) => createNote(applicationId, text),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notes', applicationId] }); setDraft(''); },
    onError: () => toast.error('Could not save note'),
  });

  return (
    <div className="tt-pane">
      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={() => add.mutate(draft.trim())}
        pending={add.isPending}
        placeholder="Log a decision or internal note…"
        icon={Plus}
      />
      <p className="tt-note-guidance">
        Internal only. Record work-relevant facts and decisions; do not include protected-class commentary.
      </p>
      <div className="tt-log">
        {notes.length === 0 && <Empty icon={PenLine}>No notes yet. Track decisions here.</Empty>}
        {notes.map((n, i) => (
          <div key={n.id || i} className="tt-note">
            <div className="tt-note-text">{n.note || n.text}</div>
            <MetaLine className="tt-meta" size="sm">
              <Notation attributed size="sm">{n.created_by || 'Former team member'}</Notation>
              <Moment value={n.created_at} as="date" size="sm" />
              {n.edited ? 'edited' : null}
            </MetaLine>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { key: 'messages', label: 'Conversation', icon: MessagesSquare },
  { key: 'notes', label: 'Notes', icon: PenLine },
];

export function TalentThread({ applicationId }) {
  const [tab, setTab] = useState('messages');
  if (!applicationId) return null;
  return (
    <div className="tt" id="talent-thread">
      <div className="tt-tabs" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`tt-tab${tab === key ? ' tt-tab--on' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={13} strokeWidth={1.8} /> {label}
          </button>
        ))}
      </div>
      {tab === 'messages' && <Conversation applicationId={applicationId} />}
      {tab === 'notes' && <Notes applicationId={applicationId} />}
    </div>
  );
}
