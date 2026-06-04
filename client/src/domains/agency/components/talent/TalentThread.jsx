import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessagesSquare, PenLine, BellRing } from 'lucide-react';
import {
  getMessages, sendMessage, getNotes, createNote,
  getReminders, createReminder,
} from '../../api/agency';
import './TalentThread.css';

const fmt = (ts) => new Date(ts).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const fmtDay = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
        {isLoading && <div className="tt-empty">Loading conversation…</div>}
        {!isLoading && messages.length === 0 && (
          <div className="tt-empty">No messages yet — start the conversation below.</div>
        )}
        {messages.map((m) => {
          const out = m.sender_type === 'AGENCY';
          return (
            <div key={m.id} className={`tt-msg ${out ? 'tt-msg--out' : 'tt-msg--in'}`}>
              <div className="tt-bubble">{m.message}</div>
              <div className="tt-meta">{out ? 'You' : (m.sender_name || 'Talent')} · {fmt(m.created_at)}</div>
            </div>
          );
        })}
      </div>
      <div className="tt-compose">
        <textarea rows={2} placeholder="Write a message to the talent…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="tt-send" disabled={!draft.trim() || send.isPending} onClick={() => send.mutate(draft.trim())}>
          {send.isPending ? 'Sending…' : 'Send'}
        </button>
      </div>
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
      <div className="tt-compose">
        <textarea rows={2} placeholder="Log a decision or internal note…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="tt-send" disabled={!draft.trim() || add.isPending} onClick={() => add.mutate(draft.trim())}>
          {add.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="tt-log">
        {notes.length === 0 && <div className="tt-empty">No notes yet.</div>}
        {notes.map((n, i) => (
          <div key={n.id || i} className="tt-note">
            <div className="tt-note-text">{n.note || n.text}</div>
            <div className="tt-meta">{n.created_by || 'You'} · {fmt(n.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Followup({ applicationId }) {
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const { data: reminders = [] } = useQuery({
    queryKey: ['reminders', applicationId],
    queryFn: () => getReminders({ application_id: applicationId }),
    enabled: !!applicationId,
    select: (d) => {
      const list = Array.isArray(d) ? d : d?.data ?? d?.reminders ?? [];
      return list.filter((r) => !r.application_id || r.application_id === applicationId);
    },
  });
  const create = useMutation({
    mutationFn: () => createReminder(applicationId, {
      reminder_type: 'follow_up',
      reminder_date: date,
      title: title.trim() || 'Follow up with talent',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders', applicationId] });
      qc.invalidateQueries({ queryKey: ['agency'] });
      setDate(''); setTitle('');
      toast.success('Follow-up scheduled');
    },
    onError: () => toast.error('Could not schedule follow-up'),
  });

  return (
    <div className="tt-pane">
      <div className="tt-followform">
        <input type="text" className="tt-input" placeholder="What's the follow-up?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="tt-followrow">
          <input type="date" className="tt-input tt-input--date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="tt-send" disabled={!date || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Setting…' : 'Set reminder'}
          </button>
        </div>
      </div>
      <div className="tt-log">
        {reminders.length === 0 && <div className="tt-empty">No follow-ups scheduled.</div>}
        {reminders.map((r, i) => (
          <div key={r.id || i} className="tt-note">
            <div className="tt-note-text">{r.title}{r.notes ? ` — ${r.notes}` : ''}</div>
            <div className="tt-meta">Due {fmtDay(r.reminder_date)}{r.status ? ` · ${r.status}` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { key: 'messages', label: 'Conversation', icon: MessagesSquare },
  { key: 'notes', label: 'Notes', icon: PenLine },
  { key: 'followup', label: 'Follow-up', icon: BellRing },
];

export function TalentThread({ applicationId }) {
  const [tab, setTab] = useState('messages');
  if (!applicationId) return null;
  return (
    <div className="tt" id="talent-thread">
      <div className="tt-tabs">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`tt-tab${tab === key ? ' tt-tab--on' : ''}`} onClick={() => setTab(key)}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      {tab === 'messages' && <Conversation applicationId={applicationId} />}
      {tab === 'notes' && <Notes applicationId={applicationId} />}
      {tab === 'followup' && <Followup applicationId={applicationId} />}
    </div>
  );
}
