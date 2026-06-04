import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { TalentPanel } from './TalentPanel';
import {
  getApplicationDetails,
  acceptApplication,
  declineApplication,
  archiveApplication,
  updateCastingApplicationStage,
  fetchRosterProfile,
  getProfilePreview,
  inviteTalent,
} from '../api/agency';
import { EmptyErrorState } from '../../../shared/components/states';

export default function TalentDetailPanel({
  applicationId,
  profileId,
  context = 'inbox',
  boardId,
  onClose,
  mode = 'fixed',
}) {
  const queryClient = useQueryClient();

  // Fetch data based on context
  const { data: detail, isLoading, isError, refetch } = useQuery({
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

  const handleAction = async (action, talent) => {
    // Determine the ID depending on the context
    const appId = applicationId || talent?.applicationId;
    const profId = profileId || talent?.profileId;

    try {
      if (action === 'accept') {
        if (!appId) throw new Error('Application ID is required for this action.');
        await acceptApplication(appId);
        toast.success('Application accepted');
      } else if (action === 'reject' || action === 'decline') {
        if (!appId) throw new Error('Application ID is required for this action.');
        await declineApplication(appId);
        toast.success('Application declined');
      } else if (action === 'shortlist') {
        if (!appId) throw new Error('Application ID is required for this action.');
        await updateCastingApplicationStage(appId, { status: 'shortlisted' });
        toast.success('Application shortlisted');
      } else if (action === 'archive') {
        if (!appId) throw new Error('Application ID is required for this action.');
        await archiveApplication(appId);
        toast.success('Application archived');
      } else if (action === 'invite') {
        if (!profId) throw new Error('Profile ID is required for this action.');
        await inviteTalent(profId);
        toast.success('Invitation sent');
      } else {
        toast.success('Coming soon');
        return;
      }
      
      // Invalidate queries to refresh lists
      queryClient.invalidateQueries({ queryKey: ['agency'] });
      queryClient.invalidateQueries({ queryKey: ['discover'] });
      
      // Close the panel after action
      onClose();
    } catch (err) {
      const message = err?.message || 'That action could not be completed';
      console.error('Action failed:', err);
      toast.error(message);
    }
  };

  if (isError) {
    return (
      <>
        <motion.div
          className="talent-panel-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          className="talent-panel"
          initial={{ x: 480 }}
          animate={{ x: 0 }}
          exit={{ x: 480 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        >
          <div className="tp-hero" style={{ height: 'auto', padding: '2rem' }}>
            <button className="tp-close-btn" onClick={onClose} aria-label="Close panel">
              <X size={18} />
            </button>
            <EmptyErrorState
              variant="compact"
              title="Profile unavailable"
              body="We could not load this talent profile. Try again."
              retry={{ label: 'Try again', onClick: () => refetch() }}
            />
          </div>
        </motion.div>
      </>
    );
  }

  if (isLoading || !detail) {
    return (
      <>
        <motion.div
          className="talent-panel-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          className="talent-panel"
          initial={{ x: 480 }}
          animate={{ x: 0 }}
          exit={{ x: 480 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        >
          <div className="tp-hero">
            <div className="tp-hero-fallback">...</div>
            <button className="tp-close-btn" onClick={onClose} aria-label="Close panel">
              <X size={18} />
            </button>
          </div>
          <div className="tp-action-strip">
            <div className="tp-btn tp-btn--secondary" style={{ width: '100px', height: '36px', opacity: 0.2 }} />
          </div>
          <div className="tp-body" style={{ padding: '2rem' }}>
            <div style={{ height: '20px', background: 'rgba(255,255,255,0.1)', marginBottom: '10px', borderRadius: '4px', width: '60%' }} />
            <div style={{ height: '80px', background: 'rgba(255,255,255,0.05)', marginBottom: '10px', borderRadius: '4px' }} />
            <div style={{ height: '40px', background: 'rgba(255,255,255,0.05)', marginBottom: '10px', borderRadius: '4px' }} />
          </div>
        </motion.div>
      </>
    );
  }

  // Map backend model detail properties to TalentPanel talent shape
  const profile = detail.profile || (context === 'roster' || context === 'discover' ? detail : null);
  const application = detail.application || (context === 'inbox' || context === 'casting' ? detail : null);

  const displayName = profile?.name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Talent';
  const displayPhoto = profile?.images?.find(img => img.is_primary)?.path || profile?.photo || profile?.hero_image_path || null;
  const displayType = (profile?.type || profile?.archetype || 'editorial').toLowerCase();
  const displayStatus = application?.status || profile?.status || 'available';
  const displayLocation = profile?.city || profile?.location || null;

  const mappedTalent = {
    id: profile?.id || detail.id,
    profileId: profileId || profile?.id || detail.id,
    applicationId: applicationId || application?.id || detail.id,
    name: displayName,
    photo: displayPhoto,
    type: displayType,
    status: displayStatus,
    location: displayLocation,
  };

  // Map contexts: inbox -> applicants, casting -> applicants, roster -> roster, discover -> discover
  let mappedContext = context;
  if (context === 'inbox' || context === 'casting') {
    mappedContext = 'applicants';
  } else if (context === 'overview') {
    mappedContext = 'overview';
  }

  return (
    <TalentPanel
      talent={mappedTalent}
      context={mappedContext}
      onClose={onClose}
      onAction={handleAction}
    />
  );
}
