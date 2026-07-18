import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Star, LayoutGrid, X, UserPlus, Download, Bookmark, Camera, Calendar, TrendingUp, MoreHorizontal } from 'lucide-react';
import { getBoards, inviteTalent } from '../../api/agency';
import { useTalentActions } from '../../hooks/useTalentActions';
import { useAgencyPermissions } from '../../hooks/useAgencyPermissions';
import './TalentActionBar.css';

// Download a talent comp card PDF (same flow the talent dashboard uses).
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

export function TalentActionBar({ applicationId, profileId, slug, status, context = 'overview', layout = 'full' }) {
  const compact = layout === 'panel';
  const qc = useQueryClient();
  const { can } = useAgencyPermissions();
  const {
    accept,
    shortlist,
    decline,
    keepOnFile,
    requestMore,
    requestMeeting,
    offerDevelopment,
    addToBoard,
    isPending,
  } = useTalentActions(applicationId);
  const [boardOpen, setBoardOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const boardRef = useRef(null);
  const moreRef = useRef(null);

  const { data: boards = [] } = useQuery({
    queryKey: ['agency', 'boards'],
    queryFn: getBoards,
    enabled: boardOpen,
    select: (d) => (Array.isArray(d) ? d : []),
  });

  const invite = useMutation({
    mutationFn: () => inviteTalent(profileId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agency'] }); toast.success('Talent invited to apply'); },
    onError: (e) => toast.error(e?.message || 'Could not send invite'),
  });

  useEffect(() => {
    if (!boardOpen) return undefined;
    const h = (e) => { if (boardRef.current && !boardRef.current.contains(e.target)) setBoardOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [boardOpen]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const h = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [moreOpen]);

  const handleCompCard = async () => {
    if (!slug) return;
    setDownloading(true);
    try {
      await downloadCompCard(slug);
    } catch (e) {
      toast.error(e?.message || 'Could not generate comp card');
    } finally {
      setDownloading(false);
    }
  };

  const isShortlisted = status === 'shortlisted';
  const isAccepted = status === 'accepted' || status === 'booked';
  const isSigned = isAccepted || status === 'represented' || status === 'signed';
  const isDeclined = status === 'declined';
  const isKeptOnFile = status === 'kept_on_file';
  const isRequestedMore = status === 'requested_more';
  const isMeetingRequested = status === 'meeting_requested';
  const isDevelopment = status === 'development';
  const isPipeline = context === 'applicants' || context === 'overview';

  const compCardBtn = slug && can('talent.download_comp_card') && (
    <button className={`tact-btn${context === 'roster' ? ' tact-btn--primary' : ''}`} disabled={downloading} onClick={handleCompCard}>
      <Download size={15} /> {downloading ? 'Preparing…' : 'Comp Card'}
    </button>
  );

  const inviteBtn = context === 'discover' && can('discover.invite') && (
    <button className="tact-btn tact-btn--primary" disabled={invite.isPending} onClick={() => invite.mutate()}>
      <UserPlus size={15} /> {invite.isPending ? 'Inviting…' : 'Invite'}
    </button>
  );

  const boardPicker = applicationId && can('boards.assign_application') && (
    <div className="tact-board" ref={boardRef}>
      <button className="tact-btn tact-btn--icon" title="Add to board" aria-label="Add to board" onClick={() => setBoardOpen((o) => !o)}>
        <LayoutGrid size={15} />
      </button>
      {boardOpen && (
        <div className={`tact-menu${compact ? ' tact-menu--right' : ''}`}>
          <div className="tact-menu-head">Add to board</div>
          {boards.length === 0 && <div className="tact-menu-empty">No boards yet</div>}
          {boards.map((b) => (
            <button key={b.id} className="tact-menu-item" onClick={() => { addToBoard.mutate(b.id); setBoardOpen(false); }}>
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Secondary pipeline actions — inline in the full page, folded into a
  // "More" menu inside the panel so the narrow drawer stays uncrowded.
  const secondary = isPipeline && applicationId && can('applications.update_status') ? [
    { key: 'shortlist', Icon: Star, label: isShortlisted ? 'Shortlisted' : 'Shortlist', disabled: isPending || isShortlisted, onClick: () => shortlist.mutate() },
    { key: 'development', Icon: TrendingUp, label: isDevelopment ? 'New Face' : 'Offer Development', disabled: isPending || isDevelopment, onClick: () => offerDevelopment.mutate(), title: 'Offer a New Face development relationship before full representation' },
    { key: 'requestMore', Icon: Camera, label: isRequestedMore ? 'More Requested' : 'Request More', disabled: isPending || isRequestedMore, onClick: () => requestMore.mutate(), title: 'Ask for more digitals or specific shots before deciding' },
    { key: 'meeting', Icon: Calendar, label: isMeetingRequested ? 'Meeting Requested' : 'Request Meeting', disabled: isPending || isMeetingRequested, onClick: () => requestMeeting.mutate(), title: 'Invite this talent to a meeting / go-see' },
    { key: 'keepOnFile', Icon: Bookmark, label: isKeptOnFile ? 'On File' : 'Keep on File', disabled: isPending || isKeptOnFile, onClick: () => keepOnFile.mutate(), title: 'Keep on file for future consideration (a soft pass, not a decline)' },
  ] : [];

  // ---- Compact (panel) layout: primary decisions + a "More" overflow ----
  if (compact) {
    return (
      <div className="tact-row tact-row--compact">
        {inviteBtn}

        {isPipeline && applicationId && (
          isSigned ? (
            can('applications.accept') && (
              <button className="tact-btn tact-btn--primary tact-btn--grow" disabled>
                <Check size={15} /> Signed
              </button>
            )
          ) : isDeclined ? (
            <button className="tact-btn tact-btn--grow" disabled>
              <X size={15} /> Declined
            </button>
          ) : (
            <>
              {can('applications.accept') && (
                <button className="tact-btn tact-btn--primary tact-btn--grow" disabled={isPending} onClick={() => accept.mutate()}>
                  <Check size={15} /> Sign
                </button>
              )}
              {can('applications.decline') && (
                <button className="tact-btn tact-btn--danger" disabled={isPending} onClick={() => decline.mutate()}>
                  <X size={15} /> Decline
                </button>
              )}
            </>
          )
        )}

        {secondary.length > 0 && (
          <div className="tact-board" ref={moreRef}>
            <button className="tact-btn tact-btn--icon" title="More actions" aria-label="More actions" onClick={() => setMoreOpen((o) => !o)}>
              <MoreHorizontal size={16} />
            </button>
            {moreOpen && (
              <div className="tact-menu tact-menu--right">
                <div className="tact-menu-head">More actions</div>
                {secondary.map(({ key, Icon, label, disabled, onClick, title }) => (
                  <button
                    key={key}
                    className="tact-menu-item tact-menu-item--icon"
                    disabled={disabled}
                    title={title}
                    onClick={() => { onClick(); setMoreOpen(false); }}
                  >
                    <Icon size={14} strokeWidth={1.8} /> {label}
                  </button>
                ))}
                {slug && can('talent.download_comp_card') && (
                  <button className="tact-menu-item tact-menu-item--icon" disabled={downloading} onClick={() => { handleCompCard(); setMoreOpen(false); }}>
                    <Download size={14} strokeWidth={1.8} /> {downloading ? 'Preparing…' : 'Download comp card'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Discover has no pipeline actions — surface the comp-card download inline there. */}
        {!isPipeline && compCardBtn}

        {boardPicker}
      </div>
    );
  }

  // ---- Full (page) layout: every action inline ----
  return (
    <div className="tact-row">
      {compCardBtn}
      {inviteBtn}

      {isPipeline && applicationId && (
        <>
          {isSigned ? (
            can('applications.accept') && (
              <button className="tact-btn tact-btn--primary" disabled>
                <Check size={15} /> Signed
              </button>
            )
          ) : isDeclined ? (
            <button className="tact-btn" disabled>
              <X size={15} /> Declined
            </button>
          ) : (
            <>
              {can('applications.accept') && (
                <button className="tact-btn tact-btn--primary" disabled={isPending} onClick={() => accept.mutate()}>
                  <Check size={15} /> Sign
                </button>
              )}
              {can('applications.decline') && (
                <button className="tact-btn tact-btn--danger" disabled={isPending} onClick={() => decline.mutate()}>
                  <X size={15} /> Decline
                </button>
              )}
            </>
          )}
          {!isSigned && !isDeclined && secondary.map(({ key, Icon, label, disabled, onClick, title }) => (
            <button key={key} className="tact-btn" disabled={disabled} onClick={onClick} title={title}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </>
      )}

      {boardPicker}
    </div>
  );
}
