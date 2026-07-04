import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, Star, Check, X } from 'lucide-react';
import {
  getCastingBoardPipeline, acceptApplication, shortlistApplication, declineApplication,
} from '../api/agency';
import { TalentPanel } from '../components/TalentPanel';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import MatchScore from '../components/ui/MatchScore';
import './CastingPage.css';

const isNew = (s) => s === 'submitted' || s === 'pending' || !s;
const TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'new', label: 'New', match: isNew },
  { key: 'shortlisted', label: 'Shortlisted', match: (s) => s === 'shortlisted' },
  { key: 'development', label: 'New Faces', match: (s) => s === 'development' },
  { key: 'booked', label: 'Booked', match: (s) => s === 'booked' },
  { key: 'accepted', label: 'Signed', match: (s) => s === 'accepted' },
  { key: 'declined', label: 'Passed', match: (s) => s === 'declined' },
];

const closeText = (ts) => {
  if (!ts) return null;
  const days = (new Date(ts) - Date.now()) / 86400000;
  const date = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return { text: days < 0 ? `Closed ${date}` : `Closes ${date}`, soon: days >= 0 && days <= 7 };
};

function toTalent(c) {
  return {
    id: c.profileId,
    profileId: c.profileId,
    applicationId: c.applicationId ?? c.id,
    name: c.name,
    photo: c.avatar || null,
    type: c.archetype || 'editorial',
    status: c.backendStatus || 'submitted',
    location: c.location || null,
    match: c.score ?? null,
  };
}

function CandidateCard({ c, index, onOpen, onShortlist, onAccept, onDecline, busy }) {
  const status = c.backendStatus || 'submitted';
  const decided = status === 'accepted' || status === 'booked' || status === 'declined';
  const shortlisted = status === 'shortlisted';
  return (
    <motion.div
      className="cd-card"
      onClick={() => onOpen(c)}
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 55, damping: 16, delay: Math.min(index * 0.04, 0.3) }}
    >
      <div className="cd-photo" style={{ backgroundImage: c.avatar ? `url(${c.avatar})` : 'none' }}>
        {isNew(status) && <span className="cd-new">New</span>}
        <div className="cd-hover" onClick={(e) => e.stopPropagation()}>
          {!decided && (
            <>
              {!shortlisted && (
                <button className="cd-act" title="Shortlist" disabled={busy} onClick={() => onShortlist(c)}><Star size={15} /></button>
              )}
              <button className="cd-act cd-act--accept" title="Book" disabled={busy} onClick={() => onAccept(c)}><Check size={15} /></button>
              <button className="cd-act cd-act--decline" title="Pass" disabled={busy} onClick={() => onDecline(c)}><X size={15} /></button>
            </>
          )}
        </div>
      </div>
      <div className="cd-body">
        <div className="cd-name-row">
          <h4 className="cd-name">{c.name}</h4>
          {c.score != null && <MatchScore score={c.score} size="sm" />}
        </div>
        <span className="cd-meta">{c.archetype || 'editorial'}{c.location ? ` · ${c.location}` : ''}</span>
        <div className="cd-statusrow">{status}</div>
      </div>
    </motion.div>
  );
}

function CastingDetailPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['board-candidates', boardId],
    queryFn: () => getCastingBoardPipeline(boardId),
    enabled: !!boardId,
    staleTime: 30000,
  });

  const board = data?.board || null;
  const candidates = useMemo(() => data?.candidates || [], [data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['board-candidates', boardId] });
    qc.invalidateQueries({ queryKey: ['agency-boards'] });
  };
  const shortlist = useMutation({ mutationFn: (id) => shortlistApplication(id), onSuccess: () => { refresh(); toast.success('Shortlisted'); }, onError: () => toast.error('Action failed') });
  const accept = useMutation({ mutationFn: (id) => acceptApplication(id), onSuccess: () => { refresh(); toast.success('Booked'); }, onError: () => toast.error('Action failed') });
  const decline = useMutation({ mutationFn: (id) => declineApplication(id), onSuccess: () => { refresh(); toast.success('Passed'); }, onError: () => toast.error('Action failed') });
  const busyId = (shortlist.isPending && shortlist.variables) || (accept.isPending && accept.variables) || (decline.isPending && decline.variables) || null;

  const counts = useMemo(() => {
    const c = {};
    TABS.forEach((t) => { c[t.key] = candidates.filter((x) => t.match(x.backendStatus)).length; });
    return c;
  }, [candidates]);

  const filtered = useMemo(() => {
    const matcher = (TABS.find((t) => t.key === tab) || TABS[0]).match;
    return candidates.filter((x) => matcher(x.backendStatus));
  }, [candidates, tab]);

  const target = board?.target_slots || 0;
  const booked = board?.booked_count ?? counts.booked ?? 0;
  const closes = closeText(board?.closes_at);

  const ledger = [
    { label: 'In Pipeline', value: candidates.length, tone: 'ink' },
    { label: 'Awaiting Review', value: counts.new || 0, tone: (counts.new || 0) ? 'gold' : 'mute' },
    { label: 'Shortlisted', value: counts.shortlisted || 0, tone: 'ink' },
    { label: target ? 'Slots Filled' : 'Booked', value: target ? `${booked}/${target}` : booked, tone: 'ink' },
  ];

  return (
    <div className="cas cd">
      <button className="cn-back" onClick={() => navigate('/dashboard/agency/casting')}>
        <ArrowLeft size={15} /> Casting
      </button>

      <header className="cas-header">
        <div>
          <h1 className="cas-title">{board?.name || (isLoading ? 'Loading…' : 'Board')}</h1>
          <div className="cd-headmeta">
            {board?.client_name && <span className="cas-client">{board.client_name}</span>}
            {board && (
              <span className={`cd-statuspill cd-statuspill--${board.is_active === false ? 'closed' : 'open'}`}>
                {board.is_active === false ? 'Closed' : 'Open'}
              </span>
            )}
            {closes && <span className={closes.soon ? 'cas-foot-meta is-soon' : 'cas-foot-meta'}>{closes.text}</span>}
          </div>
        </div>
      </header>

      {board?.description && <p className="cd-brief">{board.description}</p>}

      <motion.div
        className="cas-ledger"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 55, damping: 16 }}
      >
        {ledger.map((s) => (
          <div key={s.label} className={`cas-stat cas-stat--${s.tone}`}>
            <span className="cas-stat-num">{s.value}</span>
            <span className="cas-stat-label">{s.label}</span>
          </div>
        ))}
      </motion.div>

      <div className="cas-filters cd-filters">
        {TABS.map((t) => (
          <button key={t.key} className={`cas-chip${tab === t.key ? ' cas-chip--on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}<span className="cas-chip-count">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {isLoading && <div className="cas-loading">Loading candidates…</div>}
      {isError && <div className="cas-loading">Couldn’t load this board.</div>}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="cas-empty">
          <p className="cas-empty-title">No talent in this view</p>
          <p className="cas-empty-sub">Add applicants to this board, or switch the filter.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="cd-grid">
          {filtered.map((c, i) => (
            <CandidateCard
              key={c.applicationId ?? c.id}
              c={c}
              index={i}
              busy={busyId === (c.applicationId ?? c.id)}
              onOpen={(cand) => setSelected(toTalent(cand))}
              onShortlist={(cand) => shortlist.mutate(cand.applicationId ?? cand.id)}
              onAccept={(cand) => accept.mutate(cand.applicationId ?? cand.id)}
              onDecline={(cand) => decline.mutate(cand.applicationId ?? cand.id)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <TalentPanel key={selected.applicationId} talent={selected} context="applicants" onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CastingDetailPageWrapper() {
  return (
    <ErrorBoundary>
      <CastingDetailPage />
    </ErrorBoundary>
  );
}
