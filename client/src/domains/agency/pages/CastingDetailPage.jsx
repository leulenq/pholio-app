import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import {
  getCastingBoardPipeline, acceptApplication, shortlistApplication, declineApplication,
  updateCastingApplicationStage,
} from '../api/agency';
import CastingKanban from '../components/casting-kanban/CastingKanban';
import { TalentPanel } from '../components/TalentPanel';
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';
import FitBriefsPanel from '../components/FitBriefs/FitBriefsPanel';
import { StatusText } from '../components/ui';
import { normalizeScore, resolveTier, MATCH_TIER_LABELS } from '../lib/matchTier';
import { resolveBoardIdentity, boardIdentityStyle } from '../lib/board-identity';
import { useCardButton } from '../hooks/useCardButton';
import './CastingPage.css';

/* ---- Pipeline classification -------------------------------------------
   Three working columns carry the signing ladder; the two soft outcomes
   (kept on file, passed) live on a quiet shelf below the rail. Anything the
   backend sends that we don't recognize lands in New so nothing is lost. */
const classify = (s) => {
  if (s === 'shortlisted') return 'shortlist';
  if (['represented', 'booked', 'accepted', 'signed', 'development'].includes(s)) return 'signed';
  if (s === 'kept_on_file') return 'file';
  if (['declined', 'passed'].includes(s)) return 'passed';
  return 'new';
};

const COLUMNS = [
  { key: 'new', title: 'New submissions', empty: 'New submissions land here for first review.' },
  { key: 'shortlist', title: 'Shortlisted', empty: 'Shortlist promising faces to line them up for a meeting.' },
  { key: 'signed', title: 'Signed', empty: 'No one signed to this board yet.' },
];

const SHELVES = [
  { key: 'file', title: 'Kept on file' },
  { key: 'passed', title: 'Passed' },
];

const closeText = (ts, wrapped) => {
  if (!ts) return null;
  const days = (new Date(ts) - Date.now()) / 86400000;
  const date = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (wrapped) return { text: `Wrapped ${date}`, soon: false };
  if (days < 0) return { text: `Closed ${date}`, soon: false };
  if (days <= 1) return { text: 'Closes today', soon: true };
  return { text: `Closes ${date}`, soon: days <= 7 };
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

/* ---- Fit readout (page-scoped) ------------------------------------------
   The board fit for THIS surface only: a hairline meter under the photo plus
   plain inline text. Tier logic is the shared matchTier resolver; only the
   presentation is local. The global MatchScore chip is untouched elsewhere. */
function FitLine({ score }) {
  if (score == null) return null;
  const n = normalizeScore(score);
  const tier = resolveTier(n);
  return (
    <span className={`fit-line fit-line--${tier}`} aria-label={`Board fit ${n}, ${MATCH_TIER_LABELS[tier]}`}>
      Fit <span className="fit-num">{n}</span>
      <span className="fit-tier"> — {MATCH_TIER_LABELS[tier]}</span>
    </span>
  );
}

function FitMeter({ score }) {
  if (score == null) return <span className="fit-meter fit-meter--none" aria-hidden="true" />;
  const n = normalizeScore(score);
  return (
    <span className={`fit-meter fit-meter--${resolveTier(n)}`} aria-hidden="true">
      <i style={{ width: `${n}%` }} />
    </span>
  );
}

function RailCard({ c, column, onOpen, onShortlist, onSign, onPass, busy }) {
  const reduceMotion = useReducedMotion();
  const status = c.backendStatus || 'submitted';
  const cardButtonProps = useCardButton(() => onOpen(c), { disabled: busy });
  const showActions = column !== 'signed';
  return (
    <motion.div
      className="rr-card"
      onClick={() => onOpen(c)}
      {...cardButtonProps}
      layout={reduceMotion ? false : 'position'}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="rr-photo" style={{ backgroundImage: c.avatar ? `url(${c.avatar})` : 'none' }}>
        {showActions && (
          <div className="rr-acts" onClick={(e) => e.stopPropagation()}>
            {column === 'new' && (
              <button className="rr-act" disabled={busy} onClick={() => onShortlist(c)}>Shortlist</button>
            )}
            <button className="rr-act rr-act--sign" disabled={busy} onClick={() => onSign(c)}>Sign</button>
            <button className="rr-act rr-act--pass" disabled={busy} onClick={() => onPass(c)}>Pass</button>
          </div>
        )}
      </div>
      <FitMeter score={c.score} />
      <div className="rr-card-body">
        <h4 className="rr-card-name">{c.name}</h4>
        <span className="rr-card-meta">
          {c.archetype || 'editorial'}{c.location ? ` · ${c.location}` : ''}
        </span>
        <div className="rr-card-foot">
          <FitLine score={c.score} />
          {column === 'signed' && (
            <StatusText status={status} className="rr-card-status" />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Shelf({ title, items, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="rr-shelf">
      <button
        className="rr-shelf-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="rr-shelf-title">{title} — {items.length}</span>
        <span className="rr-shelf-faces" aria-hidden="true">
          {items.slice(0, 6).map((c) => (
            <span
              key={c.applicationId ?? c.id}
              className="rr-shelf-face"
              style={{ backgroundImage: c.avatar ? `url(${c.avatar})` : 'none' }}
            />
          ))}
        </span>
        <ChevronDown size={15} className={`rr-shelf-chev${expanded ? ' is-open' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ul
            className="rr-shelf-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {items.map((c) => (
              <li key={c.applicationId ?? c.id}>
                <button className="rr-shelf-row" onClick={() => onOpen(c)}>
                  <span
                    className="rr-shelf-face rr-shelf-face--row"
                    style={{ backgroundImage: c.avatar ? `url(${c.avatar})` : 'none' }}
                  />
                  <span className="rr-shelf-name">{c.name}</span>
                  <span className="rr-shelf-meta">{c.archetype || 'editorial'}</span>
                  <FitLine score={c.score} />
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function CastingDetailPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [view, setView] = useState('board');
  const [selected, setSelected] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['board-candidates', boardId],
    queryFn: () => getCastingBoardPipeline(boardId),
    enabled: !!boardId,
    staleTime: 30000,
  });

  const board = data?.board || null;
  const candidates = useMemo(() => data?.candidates || [], [data]);
  const identity = useMemo(
    () => resolveBoardIdentity(board || {}),
    [board],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['board-candidates', boardId] });
    qc.invalidateQueries({ queryKey: ['agency-boards'] });
  };
  // Kanban drag: optimistic stage move with rollback. The card jumps to its
  // column immediately; a failed PATCH restores the snapshot and toasts.
  const stageMove = useMutation({
    mutationFn: ({ applicationId, stage }) => updateCastingApplicationStage(applicationId, { stage }),
    onMutate: async ({ applicationId, stage }) => {
      await qc.cancelQueries({ queryKey: ['board-candidates', boardId] });
      const previous = qc.getQueryData(['board-candidates', boardId]);
      qc.setQueryData(['board-candidates', boardId], (old) => {
        if (!old?.candidates) return old;
        return {
          ...old,
          candidates: old.candidates.map((c) =>
            (c.applicationId ?? c.id) === applicationId ? { ...c, stage } : c),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['board-candidates', boardId], context.previous);
      toast.error('Couldn’t move talent — restored');
    },
    onSuccess: (_data, { stage }) => toast.success(`Moved to ${stage}`),
    onSettled: () => refresh(),
  });

  const shortlist = useMutation({ mutationFn: (id) => shortlistApplication(id), onSuccess: () => { refresh(); toast.success('Shortlisted'); }, onError: () => toast.error('Action failed') });
  const sign = useMutation({ mutationFn: (id) => acceptApplication(id), onSuccess: () => { refresh(); toast.success('Signed to the board'); }, onError: () => toast.error('Action failed') });
  const pass = useMutation({ mutationFn: (id) => declineApplication(id), onSuccess: () => { refresh(); toast.success('Passed'); }, onError: () => toast.error('Action failed') });
  const busyId = (shortlist.isPending && shortlist.variables) || (sign.isPending && sign.variables) || (pass.isPending && pass.variables) || null;

  // Bucket every candidate once; columns keep the backend's score ordering.
  const buckets = useMemo(() => {
    const b = { new: [], shortlist: [], signed: [], file: [], passed: [] };
    candidates.forEach((c) => b[classify(c.backendStatus)].push(c));
    return b;
  }, [candidates]);

  const wrapped = board?.is_active === false;
  const target = board?.target_slots || 0;
  const signedCount = buckets.signed.length;
  const closes = closeText(board?.closes_at, wrapped);

  // The plate carries the time signal; the docket carries the working counts.
  const plateMeta = closes
    ? closes.text
    : wrapped
      ? 'Wrapped'
      : buckets.new.length > 0
        ? 'In review'
        : 'Casting';

  const docket = [
    target > 0 && { label: 'Slots', value: `${signedCount} of ${target} signed` },
    { label: 'In consideration', value: candidates.length },
    buckets.new.length > 0 && { label: 'Awaiting review', value: buckets.new.length, gold: true },
    buckets.shortlist.length > 0 && { label: 'Shortlisted', value: buckets.shortlist.length },
  ].filter(Boolean);

  const cardHandlers = {
    onOpen: (c) => setSelected(toTalent(c)),
    onShortlist: (c) => shortlist.mutate(c.applicationId ?? c.id),
    onSign: (c) => sign.mutate(c.applicationId ?? c.id),
    onPass: (c) => pass.mutate(c.applicationId ?? c.id),
  };

  return (
    <div className="rr" style={boardIdentityStyle(identity)} data-letterform={identity.letterform}>
      <button className="rr-back" onClick={() => navigate('/dashboard/agency/signing')}>
        <ArrowLeft size={15} /> Signing
      </button>

      <header className="rr-masthead">
        <div className="rr-plate">
          <span className="rr-wordmark">{identity.label}</span>
          <span className={`rr-plate-meta${closes?.soon ? ' is-soon' : ''}`}>{plateMeta}</span>
        </div>
        <div className="rr-masthead-body">
          <div className="rr-masthead-id">
            <h1 className="rr-title">{board?.name || (isLoading ? 'Loading…' : 'Board')}</h1>
            {board?.description && <p className="rr-brief">{board.description}</p>}
          </div>
          <dl className="rr-docket">
            {docket.map((row) => (
              <div key={row.label} className="rr-docket-row">
                <dt>{row.label}</dt>
                <dd className={`${row.soon ? 'is-soon' : ''}${row.gold ? ' is-gold' : ''}`.trim()}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="rr-viewswitch" role="tablist" aria-label="Board view">
        {[['board', 'Pipeline'], ['briefs', 'Fit Briefs']].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            className={`rr-viewtab${view === key ? ' rr-viewtab--on' : ''}`}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'board' && (
        <>
          {isLoading && (
            <div className="rr-rail" aria-hidden="true">
              {COLUMNS.map((col) => (
                <section key={col.key} className="rr-col">
                  <header className="rr-col-head"><span className="sg-skel sg-skel--line" /></header>
                  <div className="rr-col-cards">
                    <div className="rr-card rr-card--skeleton" />
                    <div className="rr-card rr-card--skeleton" />
                  </div>
                </section>
              ))}
            </div>
          )}
          {isError && <div className="rr-note">Couldn’t load this board.</div>}

          {!isLoading && !isError && candidates.length === 0 && (
            <div className="sg-empty">
              <p className="sg-empty-title">Nothing on this board yet.</p>
              <p className="sg-empty-sub">Add talent from your applicants inbox, or wait for submissions to land.</p>
            </div>
          )}

          {!isLoading && !isError && candidates.length > 0 && (
            <>
              <div className="rr-rail">
                {COLUMNS.map((col) => (
                  <section key={col.key} className="rr-col" aria-label={col.title}>
                    <header className="rr-col-head">
                      <span className="rr-col-title">{col.title}</span>
                      <span className="rr-col-count">{buckets[col.key].length}</span>
                    </header>
                    {col.key === 'signed' && target > 0 && (
                      <p className="rr-col-note">{signedCount} of {target} slots filled</p>
                    )}
                    <div className="rr-col-cards">
                      <AnimatePresence initial={true}>
                        {buckets[col.key].map((c) => (
                          <RailCard
                            key={c.applicationId ?? c.id}
                            c={c}
                            column={col.key}
                            busy={busyId === (c.applicationId ?? c.id)}
                            {...cardHandlers}
                          />
                        ))}
                      </AnimatePresence>
                      {buckets[col.key].length === 0 && (
                        <p className="rr-col-empty">{col.empty}</p>
                      )}
                    </div>
                  </section>
                ))}
              </div>

              {(buckets.file.length > 0 || buckets.passed.length > 0) && (
                <div className="rr-shelves">
                  {SHELVES.map((shelf) => (
                    <Shelf
                      key={shelf.key}
                      title={shelf.title}
                      items={buckets[shelf.key]}
                      onOpen={cardHandlers.onOpen}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {view === 'briefs' && <FitBriefsPanel boardId={boardId} />}

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
