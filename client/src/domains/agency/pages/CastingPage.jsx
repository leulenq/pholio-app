import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, ChevronRight, Briefcase } from 'lucide-react';
import { getBoards } from '../api/agency';
import CastingNewModal from './CastingNewModal';
import './CastingPage.css';

const timeAgo = (ts) => {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const DAY = 1000 * 60 * 60 * 24;
// Returns { text, soon } for a board close date, or null.
const closeLabel = (ts) => {
  if (!ts) return null;
  const days = (new Date(ts) - Date.now()) / DAY;
  const date = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (days < 0) return { text: `Closed ${date}`, soon: false };
  return { text: `Closes ${date}`, soon: days <= 7 };
};

const STATUS_META = {
  Active: { label: 'Active', tone: 'active' },
  Reviewing: { label: 'In Review', tone: 'review' },
  Draft: { label: 'Draft', tone: 'draft' },
  Closed: { label: 'Closed', tone: 'closed' },
};

// Derive an editorial status from the board's real activity.
function mapBoard(b) {
  const applicants = b.application_count || 0;
  const submitted = b.submitted_count || 0;
  const booked = b.booked_count || 0;
  let status;
  if (b.is_active === false) status = 'Closed';
  else if (applicants === 0) status = 'Draft';
  else if (submitted > 0) status = 'Reviewing';
  else status = 'Active';
  return {
    id: b.id,
    name: b.name || 'Untitled Board',
    client: b.client_name || null,
    description: b.description || '',
    applicants,
    submitted,
    booked,
    preview: Array.isArray(b.preview) ? b.preview : [],
    closesAt: b.closes_at || null,
    updatedAt: b.updated_at,
    status,
  };
}

function CastingCard({ board, onReview }) {
  const meta = STATUS_META[board.status] || STATUS_META.Draft;
  const rate = board.applicants > 0 ? Math.round((board.booked / board.applicants) * 100) : 0;
  const closes = closeLabel(board.closesAt);
  return (
    <article
      className="cas-card"
      data-tone={meta.tone}
      role="button"
      tabIndex={0}
      onClick={() => onReview(board.id)}
    >
      <div className="cas-card-id">
        <div className="cas-card-top">
          <span className="cas-status">{meta.label}</span>
          <h3 className="cas-name">{board.name}</h3>
          {board.client && <span className="cas-client">{board.client}</span>}
        </div>
        <p className="cas-brief">
          {board.description || 'No brief yet — add one to guide your reviewers.'}
        </p>
        <div className="cas-card-foot">
          {board.preview.length > 0 ? (
            <span className="cas-stack">
              {board.preview.slice(0, 4).map((url, i) => (
                <span key={i} className="cas-av" style={{ backgroundImage: `url(${url})` }} />
              ))}
              {board.applicants > Math.min(board.preview.length, 4) && (
                <span className="cas-av-more">+{board.applicants - Math.min(board.preview.length, 4)}</span>
              )}
            </span>
          ) : <span className="cas-stack cas-stack--empty">No talent yet</span>}
          {closes && <span className={closes.soon ? 'cas-foot-meta is-soon' : 'cas-foot-meta'}>{closes.text}</span>}
          <span className="cas-updated">Updated {timeAgo(board.updatedAt)}</span>
        </div>
      </div>

      <div className="cas-metric">
        <span className="cas-metric-label">Talent</span>
        <span className="cas-metric-num">{board.applicants}</span>
        <span className="cas-metric-sub">{board.booked ? `${board.booked} represented` : 'None represented'}</span>
        <div className="cas-bar" title={`${rate}% represented`}>
          <i style={{ width: `${rate}%` }} />
        </div>
      </div>

      <div className="cas-actions">
        <button
          className="cas-review"
          onClick={(e) => { e.stopPropagation(); onReview(board.id); }}
        >
          Review <ChevronRight size={15} />
        </button>
      </div>
    </article>
  );
}

export default function CastingPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [openKey, setOpenKey] = useState(0);
  const openModal = () => { setOpenKey((k) => k + 1); setCreating(true); };

  const { data, isLoading } = useQuery({
    queryKey: ['agency-boards'],
    queryFn: getBoards,
    staleTime: 60000,
  });

  const boards = useMemo(() => (Array.isArray(data) ? data : []).map(mapBoard), [data]);

  const filters = useMemo(() => ([
    { label: 'All', value: 'all', count: boards.length },
    { label: 'Active', value: 'active', count: boards.filter((b) => b.status === 'Active').length },
    { label: 'In Review', value: 'reviewing', count: boards.filter((b) => b.status === 'Reviewing').length },
    { label: 'Draft', value: 'draft', count: boards.filter((b) => b.status === 'Draft').length },
    { label: 'Closed', value: 'closed', count: boards.filter((b) => b.status === 'Closed').length },
  ]), [boards]);

  const filtered = useMemo(() => (
    filter === 'all' ? boards : boards.filter((b) => b.status.toLowerCase() === filter)
  ), [boards, filter]);

  const stats = useMemo(() => ({
    open: boards.filter((b) => b.status === 'Active' || b.status === 'Reviewing').length,
    pipeline: boards.reduce((s, b) => s + b.applicants, 0),
    incoming: boards.reduce((s, b) => s + b.submitted, 0),
    booked: boards.reduce((s, b) => s + b.booked, 0),
  }), [boards]);

  const ledger = [
    { label: 'Open Boards', value: stats.open, tone: 'ink' },
    { label: 'In Pipeline', value: stats.pipeline, tone: 'ink' },
    { label: 'Awaiting Review', value: stats.incoming, tone: stats.incoming ? 'gold' : 'mute' },
    { label: 'Represented', value: stats.booked, tone: 'ink' },
  ];

  return (
    <div className="cas">
      <header className="cas-header">
        <div>
          <h1 className="cas-title">Signing</h1>
          <p className="cas-sub">
            {boards.length
              ? `${boards.length} board${boards.length === 1 ? '' : 's'} · ${stats.pipeline} talent in pipeline`
              : 'Your signing boards live here'}
          </p>
        </div>
        <button className="cas-new" onClick={openModal}>
          <Plus size={16} /> New board
        </button>
      </header>

      <motion.div
        className="cas-ledger"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        {ledger.map((s) => (
          <div key={s.label} className={`cas-stat cas-stat--${s.tone}`}>
            <span className="cas-stat-num">{s.value}</span>
            <span className="cas-stat-label">{s.label}</span>
          </div>
        ))}
      </motion.div>

      <div className="cas-filters">
        {filters.map((f) => (
          <button
            key={f.value}
            className={`cas-chip${filter === f.value ? ' cas-chip--on' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="cas-loading">Loading signing boards…</div>
      ) : filtered.length === 0 ? (
        <div className="cas-empty">
          <Briefcase size={26} />
          <p className="cas-empty-title">{boards.length ? 'No boards in this view' : 'No signing boards yet'}</p>
          <p className="cas-empty-sub">
            {boards.length ? 'Adjust the filter to see more.' : 'Open your first signing board to start reviewing talent.'}
          </p>
        </div>
      ) : (
        <div className="cas-list">
          {filtered.map((board) => (
            <CastingCard
              key={board.id}
              board={board}
              onReview={(id) => navigate(`/dashboard/agency/signing/${id}`)}
            />
          ))}
        </div>
      )}

      <CastingNewModal key={openKey} open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
