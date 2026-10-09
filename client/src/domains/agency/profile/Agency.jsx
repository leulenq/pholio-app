import React, { Fragment, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowUp, ChevronDown } from 'lucide-react';
import {
  addTag, createNote, getBoards, getMessages, getNotes, removeTag, sendMessage,
} from '../api/agency';
import { useAgencyPermissions } from '../hooks/useAgencyPermissions';
import { useDeclineReasons } from '../hooks/useDeclineReasons';
import { ago, date } from './read';

const asList = (d) => (Array.isArray(d) ? d : d?.data ?? []);

async function downloadCompCard(slug) {
  const res = await fetch(`/pdf/${slug}?download=1`, { credentials: 'include' });
  if (!res.ok) throw new Error('The comp card is not available');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: `${slug}-comp-card.pdf` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ── Actions ─────────────────────────────────────────────────────────── */

export function Actions({ s, actions }) {
  const { can } = useAgencyPermissions();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('main');
  const [armed, setArmed] = useState(null);
  const [reason, setReason] = useState(null);
  const ref = useRef(null);
  const { reasons } = useDeclineReasons({ enabled: view === 'pass' });
  const { data: boards = [] } = useQuery({
    queryKey: ['agency', 'boards'],
    queryFn: getBoards,
    select: (d) => (Array.isArray(d) ? d : []),
    enabled: open && can('boards.assign_application'),
    staleTime: 60_000,
  });

  const close = () => { setOpen(false); setView('main'); setArmed(null); };
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setView('main'); setArmed(null); } };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); setView('main'); setArmed(null); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const st = s.standing.status;
  const offerOut = st === 'accepted' || st === 'development';
  const settled = ['represented', 'passed', 'declined', 'withdrawn', 'declined_by_talent', 'confirmed'].includes(st);
  const busy = actions.isPending;
  const canStatus = can('applications.update_status') && !settled;

  // Anything the talent is told takes a second press.
  const items = [
    can('applications.accept') && !settled && (offerOut
      ? { key: 'confirm', label: 'Mark as represented', confirm: 'Confirm — the agreement is signed', run: actions.confirmRepresentation }
      : { key: 'offer', label: 'Offer representation', confirm: 'Send the offer', run: actions.accept }),
    canStatus && { key: 'shortlist', label: 'Shortlist', run: actions.shortlist, current: st === 'shortlisted' },
    canStatus && { key: 'more', label: 'Ask for new digitals', confirm: 'Send the request', run: actions.requestMore, current: st === 'requested_more' },
    canStatus && { key: 'meet', label: 'Ask to meet', confirm: 'Send the invitation', run: actions.requestMeeting, current: st === 'meeting_requested' },
    canStatus && !offerOut && { key: 'dev', label: 'Offer development', confirm: 'Send the offer', run: actions.offerDevelopment },
    canStatus && { key: 'file', label: 'Keep on file', run: actions.keepOnFile, current: st === 'kept_on_file' },
  ].filter(Boolean);

  const press = (it) => {
    if (it.confirm && armed !== it.key) { setArmed(it.key); return; }
    it.run.mutate();
    close();
  };

  if (!items.length && !can('applications.decline') && !can('boards.assign_application') && !(s.slug && can('talent.download_comp_card'))) {
    return null;
  }

  return (
    <div className="pf-actions" ref={ref}>
      <button type="button" className="pf-actions__btn" aria-expanded={open} aria-haspopup="menu" onClick={() => (open ? close() : setOpen(true))}>
        Actions <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="pf-menu"
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            {view === 'main' && (
              <>
                {items.map((it) => (
                  <button key={it.key} type="button" role="menuitem" className={armed === it.key ? 'is-armed' : undefined} disabled={busy || it.current} onClick={() => press(it)}>
                    {armed === it.key ? it.confirm : it.label}
                    {it.current && <i>current</i>}
                  </button>
                ))}
                {can('applications.decline') && !settled && (
                  <button type="button" role="menuitem" onClick={() => setView('pass')}>Pass…</button>
                )}
                {can('boards.assign_application') && boards.length > 0 && (
                  <>
                    <span className="pf-menu__head">File to a board</span>
                    {boards.map((bd) => (
                      <button key={bd.id} type="button" role="menuitem" disabled={busy || bd.id === s.standing.boardId} onClick={() => { actions.addToBoard.mutate(bd.id); close(); }}>
                        {bd.name}{bd.id === s.standing.boardId && <i>filed</i>}
                      </button>
                    ))}
                  </>
                )}
                {s.slug && can('talent.download_comp_card') && (
                  <>
                    <span className="pf-menu__rule" />
                    <button type="button" role="menuitem" onClick={() => { close(); downloadCompCard(s.slug).catch((e) => toast.error(e.message)); }}>
                      Download comp card
                    </button>
                  </>
                )}
              </>
            )}
            {view === 'pass' && (
              <>
                <span className="pf-menu__head">Pass on {s.name.first} — reason, if any</span>
                {[{ id: null, label: 'No reason' }, ...reasons].map((r) => (
                  <button key={r.id ?? 'none'} type="button" className={reason === r.id ? 'is-on' : undefined} aria-pressed={reason === r.id} onClick={() => setReason(r.id)}>
                    {r.label}
                  </button>
                ))}
                {reasons.find((r) => r.id === reason)?.talentMessage && (
                  <p className="pf-menu__quote">They will read: “{reasons.find((r) => r.id === reason).talentMessage}”</p>
                )}
                <button type="button" className="pf-menu__go" disabled={actions.decline.isPending} onClick={() => actions.decline.mutate(reason, { onSuccess: close })}>
                  {actions.decline.isPending ? 'Passing…' : 'Pass'}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Record ──────────────────────────────────────────────────────────── */

function Tags({ applicationId, tags }) {
  const qc = useQueryClient();
  const { can } = useAgencyPermissions();
  const [draft, setDraft] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['talent-dossier', applicationId] });
  const add = useMutation({
    mutationFn: (t) => addTag(applicationId, t),
    onSuccess: () => { refresh(); setDraft(null); },
    onError: (e) => toast.error(e?.message || 'Could not add the tag'),
  });
  const drop = useMutation({
    mutationFn: (id) => removeTag(applicationId, id),
    onSuccess: refresh,
    onError: (e) => toast.error(e?.message || 'Could not remove the tag'),
  });
  return (
    <span className="pf-tags">
      {tags.map((t) => (
        <span key={t.id} className="pf-tag">
          {t.tag || t.name}
          {can('tags.remove') && (
            <button type="button" onClick={() => drop.mutate(t.id)} aria-label={`Remove ${t.tag || t.name}`}>×</button>
          )}
        </span>
      ))}
      {can('tags.add') && (draft === null ? (
        <button type="button" className="pf-tag pf-tag--add" onClick={() => setDraft('')}>+ Tag</button>
      ) : (
        <input
          className="pf-tag pf-tag--input"
          autoFocus
          value={draft}
          aria-label="New tag"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (!draft.trim()) setDraft(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) add.mutate(draft.trim());
            if (e.key === 'Escape') setDraft(null);
          }}
        />
      ))}
    </span>
  );
}

function Compose({ value, onChange, onSend, busy, placeholder }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);
  const ok = Boolean(value.trim()) && !busy;
  return (
    <form className="pf-compose" onSubmit={(e) => { e.preventDefault(); if (ok) onSend(); }}>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ok) { e.preventDefault(); onSend(); } }}
      />
      <button type="submit" disabled={!ok} aria-label="Send"><ArrowUp size={15} /></button>
    </form>
  );
}

export function Record({ s, applicationId }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const st = s.standing;

  const { data: notes = [] } = useQuery({
    queryKey: ['notes', applicationId], queryFn: () => getNotes(applicationId), enabled: Boolean(applicationId), select: asList,
  });
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', applicationId], queryFn: () => getMessages(applicationId), enabled: Boolean(applicationId), select: asList,
  });
  const addNote = useMutation({
    mutationFn: (t) => createNote(applicationId, t),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', applicationId] });
      qc.invalidateQueries({ queryKey: ['talent-dossier', applicationId] });
      setNote('');
    },
    onError: () => toast.error('Could not save the note'),
  });
  const send = useMutation({
    mutationFn: (t) => sendMessage(applicationId, t),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messages', applicationId] }); setMsg(''); },
    onError: () => toast.error('Message failed to send'),
  });

  const facts = [
    ['Standing', st.word],
    ['Since', st.submittedAt && `${date(st.submittedAt)} · ${st.invited ? 'you invited them' : 'they applied'}`],
    ['Board', st.board?.name || 'None'],
    s.identity.fromSubmission && s.identity.emailVerified !== null && ['Email', s.identity.emailVerified ? 'Verified' : 'Unverified', !s.identity.emailVerified],
    s.minor && ['Guardian consent', s.consent ? date(s.consent) : 'Not on file', !s.consent],
  ].filter(Boolean);

  return (
    <div className="pf-record">
      <dl className="pf-record__facts">
        {facts.map(([k, v, warn]) => (
          <div key={k}><dt>{k}</dt><dd className={warn ? 'is-warn' : undefined}>{v}</dd></div>
        ))}
        <div><dt>Tags</dt><dd><Tags applicationId={applicationId} tags={st.tags} /></dd></div>
      </dl>

      <div className="pf-record__col">
        <h3>Notes</h3>
        <Compose value={note} onChange={setNote} onSend={() => addNote.mutate(note.trim())} busy={addNote.isPending} placeholder="Add a note for your team" />
        <ul className="pf-notes">
          {notes.map((n, i) => (
            <li key={n.id || i}>
              <p>{n.note || n.text}</p>
              <span>{n.created_by || 'Former team member'} · {ago(n.created_at)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pf-record__col">
        <h3>Messages</h3>
        <div className="pf-thread">
          {messages.length === 0 && <p className="pf-soft">No messages yet.</p>}
          {messages.map((m, i) => {
            const day = new Date(m.created_at).toDateString();
            const fresh = i === 0 || day !== new Date(messages[i - 1].created_at).toDateString();
            const mine = m.sender_type === 'AGENCY';
            return (
              <Fragment key={m.id || i}>
                {fresh && <span className="pf-thread__day">{date(m.created_at, { weekday: 'long', month: 'short', day: 'numeric' })}</span>}
                <div className={`pf-msg${mine ? ' is-mine' : ''}`}>
                  <p>{m.message}</p>
                  <span>{mine ? 'You' : m.sender_name || 'Talent'} · {new Date(m.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
              </Fragment>
            );
          })}
        </div>
        {s.identity.canMessage ? (
          <Compose value={msg} onChange={setMsg} onSend={() => send.mutate(msg.trim())} busy={send.isPending} placeholder="Write a message to the talent…" />
        ) : (
          <p className="pf-soft">No Pholio account yet — this applicant can&apos;t be messaged directly.</p>
        )}
      </div>
    </div>
  );
}
