import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tag, Plus, Clock, Calendar } from 'lucide-react';
import ActionButtonGroup from './ActionButtonGroup';
import MatchScoreRing from './ui/MatchScoreRing';
import { TalentTypePill } from './ui/TalentTypePill';
import { TalentStatusBadge } from './ui/TalentStatusBadge';
import NotesPanel from './NotesPanel';
import ActivityTimeline from './ActivityTimeline';
import TagManager from './TagManager';
import MessageThread from './MessageThread';
import ReminderSection from './ReminderSection';
import InterviewSection from './InterviewSection';
import {
  getApplicationDetails, acceptApplication, declineApplication,
  archiveApplication, updateCastingApplicationStage,
  fetchRosterProfile, getProfilePreview,
} from '../../api/agency';
import { formatDistanceToNowStrict } from 'date-fns';
import './TalentDetailPanel.css';

const TABS_BY_CONTEXT = {
  inbox: ['Bio', 'Notes', 'History', 'Messages'],
  roster: ['Bio', 'Notes', 'Bookings', 'Messages'],
  casting: ['Bio', 'Notes', 'Match', 'History'],
  discover: ['Bio', 'Portfolio'],
};

export default function TalentDetailPanel({
  applicationId,
  profileId,
  context = 'inbox',
  boardId,
  onClose,
  mode = 'fixed',
}) {
  const [activeTab, setActiveTab] = useState('Bio');
  const queryClient = useQueryClient();

  // Fetch data based on context
  const { data: detail, isLoading } = useQuery({
    queryKey: context === 'inbox' || context === 'casting'
      ? ['agency', 'application-detail', applicationId]
      : ['agency', 'profile-detail', profileId],
    queryFn: () => {
      if (context === 'inbox' || context === 'casting') return getApplicationDetails(applicationId);
      if (context === 'roster') return fetchRosterProfile(profileId);
      return getProfilePreview(profileId);
    },
    enabled: !!(applicationId || profileId),
  });

  const handleAction = async (action) => {
    if (!applicationId) return;
    try {
      if (action === 'accept') await acceptApplication(applicationId);
      else if (action === 'decline') await declineApplication(applicationId);
      // updateCastingApplicationStage calls PATCH /applications/:id/status — correct endpoint
      else if (action === 'shortlist') await updateCastingApplicationStage(applicationId, { status: 'shortlisted' });
      else if (action === 'archive') await archiveApplication(applicationId);
      queryClient.invalidateQueries({ queryKey: ['agency'] });
    } catch (err) {
      console.error('Action failed:', err);
    }
  };

  const tabs = TABS_BY_CONTEXT[context] || TABS_BY_CONTEXT.inbox;

  if (mode === 'drawer') {
    return (
      <AnimatePresence>
        <motion.div className="ag-detail-backdrop" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        />
        <motion.div className="ag-detail-panel ag-detail-panel--drawer"
          initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        >
          <PanelContent
            detail={detail} isLoading={isLoading} context={context}
            activeTab={activeTab} setActiveTab={setActiveTab} tabs={tabs}
            onClose={onClose} onAction={handleAction} applicationId={applicationId}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Fixed mode
  return (
    <div className="ag-detail-panel ag-detail-panel--fixed">
      <PanelContent
        detail={detail} isLoading={isLoading} context={context}
        activeTab={activeTab} setActiveTab={setActiveTab} tabs={tabs}
        onClose={onClose} onAction={handleAction} applicationId={applicationId}
      />
    </div>
  );
}

function PanelContent({ detail, isLoading, context, activeTab, setActiveTab, tabs, onClose, onAction, applicationId }) {
  if (isLoading || !detail) {
    return (
      <div className="ag-detail-panel__loading">
        <div className="ag-detail-panel__skeleton-hero" />
        <div className="ag-detail-panel__skeleton-lines">
          <div className="ag-detail-panel__skeleton-line" style={{ width: '60%' }} />
          <div className="ag-detail-panel__skeleton-line" style={{ width: '40%' }} />
          <div className="ag-detail-panel__skeleton-line" style={{ width: '50%' }} />
        </div>
      </div>
    );
  }

  const {
    name, first_name, last_name, photo, hero_image_path,
    type, archetype, age, height_cm, city, location,
    bio_curated, bio_raw, status, match_score,
    created_at, accepted_at, tags, measurements,
  } = detail;

  const displayName = name || `${first_name || ''} ${last_name || ''}`.trim();
  const heroImg = hero_image_path || photo;
  const displayType = type || archetype;

  return (
    <div className="ag-detail-panel__inner">
      {/* Hero */}
      <div className="ag-detail-panel__hero">
        {heroImg && <img src={heroImg} alt={displayName} className="ag-detail-panel__hero-img" />}
        <div className="ag-detail-panel__hero-gradient" />
        <button className="ag-detail-panel__close" onClick={onClose}><X size={18} /></button>
        {status && <TalentStatusBadge status={status} className="ag-detail-panel__status-badge" />}
      </div>

      {/* Identity */}
      <div className="ag-detail-panel__identity">
        <h2 className="ag-detail-panel__name">{displayName}</h2>
        <div className="ag-detail-panel__meta">
          {displayType && <TalentTypePill type={displayType} />}
          {age && <span>{age}</span>}
          {height_cm && <span>{height_cm}cm</span>}
          {(city || location) && <span>{city || location}</span>}
        </div>
        <div className="ag-detail-panel__sub-meta">
          {context === 'inbox' && created_at && (
            <span>Applied {formatDistanceToNowStrict(new Date(created_at), { addSuffix: true })}</span>
          )}
          {context === 'roster' && accepted_at && (
            <span>Signed {formatDistanceToNowStrict(new Date(accepted_at), { addSuffix: true })}</span>
          )}
          {match_score != null && (
            <span className="ag-detail-panel__score">
              Score: <MatchScoreRing score={match_score} size="sm" /> {match_score}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="ag-detail-panel__actions">
        <ActionButtonGroup context={context} currentStatus={status} onAction={onAction} />
      </div>

      {/* Tabs */}
      <div className="ag-detail-panel__tabs">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`ag-detail-panel__tab ${activeTab === tab ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="ag-detail-panel__tab-content">
        {activeTab === 'Bio' && (
          <div className="ag-detail-panel__bio">
            {(bio_curated || bio_raw) && (
              <p className="ag-detail-panel__bio-text">{bio_curated || bio_raw}</p>
            )}
            {measurements && (
              <div className="ag-detail-panel__measurements">
                {measurements.bust && <div><span>Bust</span><strong>{measurements.bust}</strong></div>}
                {measurements.waist && <div><span>Waist</span><strong>{measurements.waist}</strong></div>}
                {measurements.hips && <div><span>Hips</span><strong>{measurements.hips}</strong></div>}
                {measurements.shoe && <div><span>Shoe</span><strong>{measurements.shoe}</strong></div>}
              </div>
            )}
          </div>
        )}
        {activeTab === 'Notes' && applicationId && <NotesPanel applicationId={applicationId} />}
        {activeTab === 'History' && applicationId && <ActivityTimeline applicationId={applicationId} />}
        {activeTab === 'Messages' && applicationId && (
          <MessageThread applicationId={applicationId} />
        )}
        {activeTab === 'Bookings' && (
          <div className="ag-detail-panel__bookings">
            <p className="ag-detail-panel__empty-tab">Booking history will appear here.</p>
          </div>
        )}
        {activeTab === 'Match' && detail.match_details && (
          <div className="ag-detail-panel__match-breakdown">
            {Object.entries(detail.match_details).map(([key, val]) => (
              <div key={key} className="ag-detail-panel__match-row">
                <span className="ag-detail-panel__match-label">{key}</span>
                <div className="ag-detail-panel__match-bar">
                  <div className="ag-detail-panel__match-fill" style={{ width: `${val}%` }} />
                </div>
                <span className="ag-detail-panel__match-pct">{val}%</span>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'Portfolio' && detail.images && (
          <div className="ag-detail-panel__portfolio">
            {detail.images.map(img => (
              <img key={img.id} src={img.path} alt="" className="ag-detail-panel__portfolio-img" />
            ))}
          </div>
        )}
      </div>

      {/* Bottom: Tags + Quick Links */}
      {(context === 'inbox' || context === 'roster' || context === 'casting') && (
        <div className="ag-detail-panel__bottom">
          {applicationId && (
            <div className="ag-detail-panel__section">
              <TagManager applicationId={applicationId} tags={tags || []} />
            </div>
          )}
          {(context === 'inbox' || context === 'roster') && applicationId && (
            <>
              <div className="ag-detail-panel__section">
                <ReminderSection applicationId={applicationId} compact />
              </div>
              <div className="ag-detail-panel__section">
                <InterviewSection applicationId={applicationId} compact />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
