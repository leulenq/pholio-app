import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Star, MessageCircle, LayoutGrid, X, UserPlus, Download } from 'lucide-react';
import { getBoards, inviteTalent } from '../../api/agency';
import { useTalentActions } from '../../hooks/useTalentActions';
import './TalentActionBar.css';

export function TalentActionBar({ applicationId, profileId, status, context = 'overview', onMessage }) {
  const { accept, shortlist, decline, addToBoard, isPending } = useTalentActions(applicationId);
  const [boardOpen, setBoardOpen] = useState(false);
  const boardRef = useRef(null);

  const { data: boards = [] } = useQuery({
    queryKey: ['agency', 'boards'],
    queryFn: getBoards,
    enabled: boardOpen,
    select: (d) => (Array.isArray(d) ? d : []),
  });

  useEffect(() => {
    if (!boardOpen) return undefined;
    const h = (e) => { if (boardRef.current && !boardRef.current.contains(e.target)) setBoardOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [boardOpen]);

  const isShortlisted = status === 'shortlisted';
  const isAccepted = status === 'accepted' || status === 'booked';
  const isPipeline = context === 'applicants' || context === 'overview';

  return (
    <div className="tact-row">
      {context === 'discover' && (
        <button className="tact-btn tact-btn--primary" onClick={() =>
          inviteTalent(profileId).then(() => toast.success('Talent invited')).catch(() => toast.error('Could not invite'))}>
          <UserPlus size={15} /> Invite
        </button>
      )}

      {context === 'roster' && (
        <button className="tact-btn" onClick={() => toast.success('Comp card — coming soon')}>
          <Download size={15} /> Comp Card
        </button>
      )}

      {isPipeline && applicationId && (
        <>
          <button className="tact-btn tact-btn--primary" disabled={isPending || isAccepted} onClick={() => accept.mutate()}>
            <Check size={15} /> {isAccepted ? 'Accepted' : 'Accept'}
          </button>
          <button className="tact-btn" disabled={isPending || isShortlisted} onClick={() => shortlist.mutate()}>
            <Star size={15} /> {isShortlisted ? 'Shortlisted' : 'Shortlist'}
          </button>
        </>
      )}

      {applicationId && (
        <button className="tact-btn" onClick={onMessage}>
          <MessageCircle size={15} /> Message
        </button>
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

      {isPipeline && applicationId && (
        <button className="tact-btn tact-btn--icon tact-btn--danger" title="Decline" disabled={isPending} onClick={() => decline.mutate()}>
          <X size={15} />
        </button>
      )}
    </div>
  );
}
