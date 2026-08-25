import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bookmark, Calendar, Camera, Check, ChevronDown, Download, LayoutGrid,
  Star, TrendingUp, X,
} from 'lucide-react';
import { getBoards } from '../../api/agency';
import { useTalentActions } from '../../hooks/useTalentActions';
import { useAgencyPermissions } from '../../hooks/useAgencyPermissions';
import { DeclineReasonModal } from '../decline/DeclineReasonModal';
import {
  isOfferedApplicationStatus,
  isRepresentedApplicationStatus,
} from '../../../../shared/constants/applicationStatus';
import './dossier.css';

/**
 * The Decision Dock — the two decisions that matter, always in the same place,
 * with the softer real-world outcomes one click away.
 *
 * The industry outcome set is not accept/reject. Most submissions end in "kept
 * on file", "request more digitals", or a meeting; a development offer (new
 * face) sits between a pass and a signing. All of them are here under their
 * real names.
 */
async function downloadCompCard(slug) {
  const res = await fetch(`/pdf/${slug}?download=1`, { credentials: 'include' });
  if (!res.ok) throw new Error('Comp card unavailable');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pholio-${slug}-compcard.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Menu({ label, icon: Icon, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dx-menu" ref={ref}>
      <button
        type="button"
        className="dx-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        {Icon && <Icon size={15} aria-hidden />} {label}
        <ChevronDown size={14} aria-hidden className={open ? 'dx-menu__chev is-open' : 'dx-menu__chev'} />
      </button>
      {open && (
        <div className={`dx-menu__pop dx-menu__pop--${align}`} role="menu">
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

export function DecisionDock({ applicationId, talentName, status, slug, compact = false }) {
  const { can } = useAgencyPermissions();
  const actions = useTalentActions(applicationId);
  const [downloading, setDownloading] = useState(false);
  const [passOpen, setPassOpen] = useState(false);

  const { data: boards = [] } = useQuery({
    queryKey: ['agency', 'boards'],
    queryFn: getBoards,
    select: (d) => (Array.isArray(d) ? d : []),
    staleTime: 60_000,
  });

  const s = String(status || '').toLowerCase();
  const offered = isOfferedApplicationStatus(s);
  const represented = isRepresentedApplicationStatus(s);
  const declined = s === 'declined' || s === 'passed';
  const settled = offered || represented || declined;

  const handleCompCard = async () => {
    if (!slug) return;
    setDownloading(true);
    try {
      await downloadCompCard(slug);
    } catch (e) {
      toast.error(e?.message || 'Could not generate the comp card');
    } finally {
      setDownloading(false);
    }
  };

  const soft = [
    { key: 'shortlist', Icon: Star, label: 'Shortlist', done: s === 'shortlisted', run: actions.shortlist },
    { key: 'requestMore', Icon: Camera, label: 'Request more digitals', done: s === 'requested_more', run: actions.requestMore },
    { key: 'meeting', Icon: Calendar, label: 'Invite to a meeting', done: s === 'meeting_requested', run: actions.requestMeeting },
    { key: 'development', Icon: TrendingUp, label: 'Offer development (new face)', done: s === 'development', run: actions.offerDevelopment },
    { key: 'keepOnFile', Icon: Bookmark, label: 'Keep on file', done: s === 'kept_on_file', run: actions.keepOnFile },
  ];

  return (
    <div className={`dx-dock${compact ? ' dx-dock--compact' : ''}`}>
      {!compact && slug && can('talent.download_comp_card') && (
        <button
          type="button"
          className="dx-btn dx-btn--wide-only"
          disabled={downloading}
          onClick={handleCompCard}
        >
          <Download size={15} aria-hidden /> {downloading ? 'Preparing…' : 'Comp card'}
        </button>
      )}

      {can('boards.assign_application') && (
        <Menu label="Board" icon={LayoutGrid}>
          {(close) => (
            <>
              <p className="dx-menu__head">File to a board</p>
              {boards.length === 0 && <p className="dx-menu__empty">No boards yet</p>}
              {boards.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="dx-menu__item"
                  onClick={() => { actions.addToBoard.mutate(b.id); close(); }}
                >
                  {b.name}
                </button>
              ))}
            </>
          )}
        </Menu>
      )}

      {can('applications.update_status') && (
        <Menu label="Outcome">
          {(close) => (
            <>
              <p className="dx-menu__head">Softer outcomes</p>
              {soft.map(({ key, Icon, label, done, run }) => (
                <button
                  key={key}
                  type="button"
                  className="dx-menu__item"
                  disabled={actions.isPending || done}
                  onClick={() => { run.mutate(); close(); }}
                >
                  <Icon size={14} aria-hidden /> {done ? `${label} — done` : label}
                </button>
              ))}
              {/* Also lives here so the comp card stays reachable once the
                  standalone button folds away on narrow screens. */}
              {slug && can('talent.download_comp_card') && (
                <button
                  type="button"
                  className="dx-menu__item"
                  disabled={downloading}
                  onClick={() => { handleCompCard(); close(); }}
                >
                  <Download size={14} aria-hidden />
                  {downloading ? 'Preparing the comp card…' : 'Download the comp card'}
                </button>
              )}
            </>
          )}
        </Menu>
      )}

      {can('applications.decline') && !settled && (
        <button
          type="button"
          className="dx-btn dx-btn--quiet"
          disabled={actions.isPending}
          onClick={() => setPassOpen(true)}
        >
          <X size={15} aria-hidden /> Pass
        </button>
      )}

      {can('applications.accept') && (
        represented ? (
          <span className="dx-dock__settled"><Check size={15} aria-hidden /> Represented</span>
        ) : declined ? (
          <span className="dx-dock__settled dx-dock__settled--off">Passed</span>
        ) : offered ? (
          <button
            type="button"
            className="dx-btn dx-btn--primary"
            disabled={actions.isPending}
            onClick={() => actions.confirmRepresentation.mutate()}
          >
            <Check size={15} aria-hidden /> Mark represented
          </button>
        ) : (
          <button
            type="button"
            className="dx-btn dx-btn--primary"
            disabled={actions.isPending}
            onClick={() => actions.accept.mutate()}
          >
            <Check size={15} aria-hidden /> Offer representation
          </button>
        )
      )}

      <DeclineReasonModal
        open={passOpen}
        talentName={talentName}
        busy={actions.decline.isPending}
        onClose={() => setPassOpen(false)}
        onConfirm={(declineReason) => {
          actions.decline.mutate(declineReason, { onSuccess: () => setPassOpen(false) });
        }}
      />
    </div>
  );
}

export default DecisionDock;
