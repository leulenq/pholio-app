import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Star, LayoutGrid, X, UserPlus, Download } from 'lucide-react';
import { getBoards, inviteTalent } from '../../api/agency';
import { useTalentActions } from '../../hooks/useTalentActions';
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

export function TalentActionBar({ applicationId, profileId, slug, status, context = 'overview', onMessage }) {
  const qc = useQueryClient();
  const { accept, shortlist, decline, addToBoard, isPending } = useTalentActions(applicationId);
  const [boardOpen, setBoardOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const boardRef = useRef(null);

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
  const isPipeline = context === 'applicants' || context === 'overview';

  const compCardBtn = slug && (
    <button className={`tact-btn${context === 'roster' ? ' tact-btn--primary' : ''}`} disabled={downloading} onClick={handleCompCard}>
      <Download size={15} /> {downloading ? 'Preparing…' : 'Comp Card'}
    </button>
  );

  return (
    <div className="tact-row">
      {compCardBtn}

      {context === 'discover' && (
        <button className="tact-btn tact-btn--primary" disabled={invite.isPending} onClick={() => invite.mutate()}>
          <UserPlus size={15} /> {invite.isPending ? 'Inviting…' : 'Invite'}
        </button>
      )}

      {isPipeline && applicationId && (
        <>
          <button className="tact-btn tact-btn--primary" disabled={isPending || isAccepted} onClick={() => accept.mutate()}>
            <Check size={15} /> {isAccepted ? 'Accepted' : 'Accept'}
          </button>
          <button className="tact-btn tact-btn--danger" disabled={isPending} onClick={() => decline.mutate()}>
            <X size={15} /> Decline
          </button>
          <button className="tact-btn" disabled={isPending || isShortlisted} onClick={() => shortlist.mutate()}>
            <Star size={15} /> {isShortlisted ? 'Shortlisted' : 'Shortlist'}
          </button>
        </>
      )}

      {applicationId && (
        <div className="tact-board" ref={boardRef}>
          <button className="tact-btn tact-btn--icon" title="Add to board" onClick={() => setBoardOpen((o) => !o)}>
            <LayoutGrid size={15} />
          </button>
          {boardOpen && (
            <div className="tact-board-menu">
              <div className="tact-board-head">Add to board</div>
              {boards.length === 0 && <div className="tact-board-empty">No boards yet</div>}
              {boards.map((b) => (
                <button key={b.id} className="tact-board-item" onClick={() => { addToBoard.mutate(b.id); setBoardOpen(false); }}>
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
