import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, ArrowRight } from 'lucide-react';
import { getBoards } from '../api/agency';
import { resolveBoardIdentity, boardIdentityStyle, resolveBoardType, BOARD_VOCAB } from '../lib/board-identity';
import { useCardButton } from '../hooks/useCardButton';
import CastingNewModal from './CastingNewModal';
import { Moment } from '../components/meta';
import './CastingPage.css';

const DAY = 1000 * 60 * 60 * 24;
// { text, soon } describing the close date, or null when the board has none.
const closeLabel = (ts, wrapped) => {
  if (!ts) return null;
  const days = (new Date(ts) - Date.now()) / DAY;
  const date = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (wrapped) return { text: `Wrapped ${date}`, soon: false };
  if (days < 0) return { text: `Closed ${date}`, soon: false };
  if (days <= 1) return { text: 'Closes today', soon: true };
  return { text: `Closes ${date}`, soon: days <= 7 };
};

function mapBoard(b) {
  const applicants = b.application_count || 0;
  const submitted = b.submitted_count || 0;
  const signed = b.booked_count || 0;
  const wrapped = b.is_active === false;
  return {
    id: b.id,
    name: b.name || 'Untitled Board',
    client: b.client_name || null,
    description: b.description || '',
    applicants,
    submitted,
    signed,
    target: b.target_slots || 0,
    preview: Array.isArray(b.preview) ? b.preview : [],
    closesAt: b.closes_at || null,
    updatedAt: b.updated_at,
    wrapped,
    // Raw identity + type fields, read by resolveBoardIdentity/resolveBoardType.
    board_type: b.board_type || null,
    brand_color: b.brand_color || null,
    plate_style: b.plate_style || null,
    logo_path: b.logo_path || null,
    cover_image_path: b.cover_image_path || null,
  };
}

// The board's one-line casting ledger: consideration → review → decided.
// Key figures are <b> so they pick up the house ink.
function LedgerLine({ board }) {
  const vocab = BOARD_VOCAB[resolveBoardType(board)];
  const parts = [];
  if (board.applicants > 0) parts.push(<React.Fragment key="c"><b>{board.applicants}</b> in consideration</React.Fragment>);
  if (board.submitted > 0) parts.push(<React.Fragment key="r"><b>{board.submitted}</b> awaiting review</React.Fragment>);
  if (board.target > 0) parts.push(<React.Fragment key="s"><b>{board.signed} of {board.target}</b> {vocab.decidedLower}</React.Fragment>);
  else if (board.signed > 0) parts.push(<React.Fragment key="s"><b>{board.signed}</b> {vocab.decidedLower}</React.Fragment>);
  if (parts.length === 0) return <span className="sg-ledgerline">Awaiting first submissions</span>;
  return (
    <span className="sg-ledgerline">
      {parts.map((part, i) => (
        <React.Fragment key={i}>{i > 0 && ' · '}{part}</React.Fragment>
      ))}
    </span>
  );
}

const SHEET_FRAMES = 4;

function FolioCard({ board, index, onOpen }) {
  const reduceMotion = useReducedMotion();
  const identity = useMemo(() => resolveBoardIdentity(board), [board]);
  const cardButtonProps = useCardButton(() => onOpen(board.id));
  const closes = closeLabel(board.closesAt, board.wrapped);
  const shots = board.preview.slice(0, SHEET_FRAMES);
  const overflow = board.applicants - shots.length;

  // Plate meta is the time signal; no abstract status words.
  const plateMeta = closes
    ? closes.text
    : board.wrapped
      ? 'Wrapped'
      : board.submitted > 0
        ? 'In review'
        : null;

  return (
    <motion.article
      className={`sg-folio${board.wrapped ? ' sg-folio--wrapped' : ''}`}
      style={boardIdentityStyle(identity)}
      data-letterform={identity.letterform}
      data-treatment={identity.treatment}
      onClick={() => onOpen(board.id)}
      aria-label={`Open board ${board.name}${board.client ? ` for ${board.client}` : ''}`}
      {...cardButtonProps}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.045, 0.32), ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="sg-plate">
        {identity.logoUrl
          ? <img className="sg-plate-logo" src={identity.logoUrl} alt={identity.label} />
          : <span className="sg-wordmark">{identity.label}</span>}
        {plateMeta && (
          <span className={`sg-plate-meta${closes?.soon ? ' is-soon' : ''}`}>{plateMeta}</span>
        )}
      </div>

      <div className="sg-body">
        <h3 className="sg-name">{board.name}</h3>
        <p className="sg-brief">
          {board.description || 'No brief yet — add one to guide your reviewers.'}
        </p>
      </div>

      <div className="sg-sheet" aria-hidden="true">
        {Array.from({ length: SHEET_FRAMES }).map((_, i) => {
          const url = shots[i];
          if (!url) return <span key={i} className="sg-frame sg-frame--empty" />;
          const isLast = i === shots.length - 1 && overflow > 0;
          return (
            <span key={i} className="sg-frame" style={{ backgroundImage: `url(${url})` }}>
              {isLast && <span className="sg-frame-more">+{overflow}</span>}
            </span>
          );
        })}
        {shots.length === 0 && <span className="sg-sheet-note">Awaiting first submissions</span>}
      </div>

      <div className="sg-foot">
        <LedgerLine board={board} />
        <span className="sg-open">
          <Moment value={board.updatedAt} prefix="Updated" className="sg-updated" />
          <span className="sg-open-cue">Open board <ArrowRight size={13} /></span>
        </span>
      </div>
    </motion.article>
  );
}

function FolioSection({ title, boards, onOpen, startIndex = 0 }) {
  if (boards.length === 0) return null;
  return (
    <section className="sg-section">
      <div className="sg-section-head">
        <h2 className="sg-section-title">{title}</h2>
        <span className="sg-section-count">{boards.length}</span>
      </div>
      <div className="sg-grid">
        {boards.map((board, i) => (
          <FolioCard key={board.id} board={board} index={startIndex + i} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export default function CastingPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [openKey, setOpenKey] = useState(0);
  const openModal = () => { setOpenKey((k) => k + 1); setCreating(true); };

  const { data, isLoading } = useQuery({
    queryKey: ['agency-boards'],
    queryFn: getBoards,
    staleTime: 60000,
  });

  const boards = useMemo(() => (Array.isArray(data) ? data : []).map(mapBoard), [data]);

  // Open boards sort by urgency (closing soonest first), wrapped by recency.
  const { open, wrapped } = useMemo(() => {
    const openBoards = boards.filter((b) => !b.wrapped).sort((a, b) => {
      if (a.closesAt && b.closesAt) return new Date(a.closesAt) - new Date(b.closesAt);
      if (a.closesAt) return -1;
      if (b.closesAt) return 1;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
    const wrappedBoards = boards.filter((b) => b.wrapped)
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    return { open: openBoards, wrapped: wrappedBoards };
  }, [boards]);

  const sub = useMemo(() => {
    if (!boards.length) return 'Signing boards gather the talent you are considering for a client or a season.';
    const inReview = boards.reduce((s, b) => s + b.submitted, 0);
    const pipeline = boards.reduce((s, b) => s + b.applicants, 0);
    const parts = [`${open.length} open board${open.length === 1 ? '' : 's'}`];
    if (pipeline) parts.push(`${pipeline} in consideration`);
    if (inReview) parts.push(`${inReview} awaiting review`);
    return parts.join(' · ');
  }, [boards, open.length]);

  return (
    <div className="sg">
      <header className="sg-header">
        <div>
          <h1 className="sg-title">Signing</h1>
          <p className="sg-sub">{sub}</p>
        </div>
        <button className="sg-new" onClick={openModal}>
          <Plus size={16} /> New board
        </button>
      </header>

      {isLoading ? (
        <div className="sg-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sg-folio sg-folio--skeleton">
              <div className="sg-plate" />
              <div className="sg-body">
                <span className="sg-skel sg-skel--title" />
                <span className="sg-skel sg-skel--line" />
              </div>
              <div className="sg-sheet">
                {[0, 1, 2, 3].map((j) => <span key={j} className="sg-frame sg-frame--empty" />)}
              </div>
            </div>
          ))}
        </div>
      ) : boards.length === 0 ? (
        <div className="sg-empty">
          <p className="sg-empty-title">The board rack is empty.</p>
          <p className="sg-empty-sub">
            Open your first signing board to start reviewing talent for a client, a season, or a division.
          </p>
          <button className="sg-new sg-new--empty" onClick={openModal}>
            <Plus size={16} /> Open a board
          </button>
        </div>
      ) : (
        <>
          <FolioSection title="Open boards" boards={open} onOpen={(id) => navigate(`/dashboard/agency/signing/${id}`)} />
          <FolioSection
            title="Wrapped"
            boards={wrapped}
            startIndex={open.length}
            onOpen={(id) => navigate(`/dashboard/agency/signing/${id}`)}
          />
        </>
      )}

      <CastingNewModal key={openKey} open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
