import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, Maximize2, ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';
import { TalentActionBar } from './talent/TalentActionBar';
import { TalentThread } from './talent/TalentThread';
import { DiscoverZone } from './zones/DiscoverZone';
import { ApplicantsZone } from './zones/ApplicantsZone';
import { OverviewZone } from './zones/OverviewZone';
import { getTalentSiteLink } from './zones/profileHydration';
import { DivisionMark } from './status';
import { MetaLine, Notation, Place } from './meta';
import {
  isOfferedApplicationStatus,
  isRepresentedApplicationStatus,
} from '../../../shared/constants/applicationStatus';
import './TalentPanel.css';

const getInitials = (name) => {
  const parts = (name || '').trim().split(' ');
  return parts.length > 1
    ? (parts[0][0] || '') + (parts[1][0] || '')
    : (parts[0]?.[0] || '');
};

const VITALS = [
  ['Height', 'height_cm'],
  ['Bust', 'bust_cm'],
  ['Waist', 'waist_cm'],
  ['Hips', 'hips_cm'],
];

/** Ink vitals band — the four measurements a booker checks first. */
function VitalsBand({ measurements }) {
  return (
    <div className="tp-band">
      {VITALS.map(([label, key]) => (
        <div className="tp-band-v" key={key}>
          <span className="tp-band-k">{label}</span>
          <span className="tp-band-n">{measurements?.[key] != null ? measurements[key] : '—'}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Pipeline stepper — Submitted → In review → Offered → Represented, derived from the
 * application status. Replaces the old "submission status" card; conveys
 * where the talent sits without a status badge.
 */
function PipelineStatus({ status }) {
  const s = String(status || '').toLowerCase();
  const declined = s === 'declined';
  const offered = isOfferedApplicationStatus(s);
  const represented = isRepresentedApplicationStatus(s);
  const current = represented ? 3 : offered ? 2 : 1; // stage 0 (Submitted) is always complete
  const stages = [
    { label: 'Submitted' },
    { label: declined ? 'Declined' : 'In review', danger: declined },
    { label: offered || represented ? 'Offered' : 'Offer' },
    { label: represented ? 'Represented' : 'Agreement' },
  ];
  return (
    <div className="tp-pipe" role="group" aria-label={`Status: ${stages[current].label}`}>
      {stages.map((st, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <React.Fragment key={st.label}>
            {i > 0 && <span className={`tp-pipe-ln${i <= current ? ' is-done' : ''}`} />}
            <span className={`tp-pipe-st is-${state}${st.danger ? ' is-danger' : ''}`}>{st.label}</span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Canonical Talent Panel — the "Cinematic Column".
 * A right-hand sidebar drawer: cinematic hero, ink vitals band, pipeline
 * status, action bar, the book (+ comp card), and a tabbed working record
 * (Conversation · Notes · Follow-up).
 *
 * Callers must wrap conditional renders in <AnimatePresence> for exit animations.
 *
 * @param {Object} talent - { id, profileId, applicationId, name, photo, type, status, location }
 * @param {'discover'|'applicants'|'overview'} context
 * @param {Function} onClose
 */
export const TalentPanel = ({ talent, context = 'overview', onClose }) => {
  const navigate = useNavigate();
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [carouselImages, setCarouselImages] = useState(null);
  const [profileHydrated, setProfileHydrated] = useState(null);

  const handleProfileHydrated = useCallback((payload) => {
    if (!payload) return;
    setProfileHydrated(payload);
    if (payload.images?.length) setCarouselImages(payload.images);
  }, []);

  // Per-talent state resets via remount: every call site renders this panel
  // with key={talent id}, so switching talents mounts a fresh instance.

  if (!talent) return null;

  const images = carouselImages || (talent.photo ? [{ path: talent.photo, alt: talent.name }] : []);
  const multi = images.length > 1;

  const siteLink = getTalentSiteLink({
    slug: profileHydrated?.slug || talent.slug,
    portfolioUrl: profileHydrated?.portfolioUrl,
  });
  const isPipeline = Boolean(talent.applicationId);
  const status = profileHydrated?.status || talent.status;
  const identitySource = profileHydrated?.identitySource ?? talent.identitySource;
  const identityClaimed = profileHydrated?.identityClaimed ?? talent.identityClaimed;
  const identityDisputed = profileHydrated?.identityDisputed ?? talent.identityDisputed;
  const emailVerified = profileHydrated?.emailVerified ?? talent.emailVerified;
  // The API excludes an unclaimed identity-backed applicant from messaging —
  // no confirmed way to reach them in-app yet. Fields absent (older API):
  // default to messaging allowed rather than guessing a restriction.
  const canMessage = !(identitySource === 'submission' && identityClaimed === false);

  const renderZone = () => {
    switch (context) {
      case 'discover':
        return (
          <DiscoverZone
            profileId={talent.profileId}
            onProfileHydrated={handleProfileHydrated}
          />
        );
      case 'applicants':
        return (
          <ApplicantsZone
            applicationId={talent.applicationId}
            onProfileHydrated={handleProfileHydrated}
          />
        );
      case 'overview':
        return (
          <OverviewZone
            applicationId={talent.applicationId}
            onProfileHydrated={handleProfileHydrated}
          />
        );
      default:
        return null;
    }
  };

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
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 240, damping: 30, mass: 0.9 }}
      >
        {/* ---------- Cinematic hero ---------- */}
        <div className="tp-hero">
          {images.length > 0 ? (
            <>
              <motion.img
                key={images[carouselIdx]?.path}
                src={images[carouselIdx]?.path}
                className="tp-hero-img"
                alt={images[carouselIdx]?.alt || talent.name}
                initial={{ scale: 1.06, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
              <div className="tp-hero-veil" />
            </>
          ) : (
            <div className="tp-hero-fallback">
              {getInitials(talent.name).toUpperCase()}
            </div>
          )}

          {multi && (
            <>
              <span className="tp-frame">{carouselIdx + 1} / {images.length}</span>
              <button
                className="tp-carousel-arrow tp-carousel-arrow--prev"
                onClick={() => setCarouselIdx(i => (i - 1 + images.length) % images.length)}
                aria-label="Previous image"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="tp-carousel-arrow tp-carousel-arrow--next"
                onClick={() => setCarouselIdx(i => (i + 1) % images.length)}
                aria-label="Next image"
              >
                <ChevronRight size={17} />
              </button>
            </>
          )}


          <div className="tp-hero-controls">
            {talent.applicationId && (
              <button
                className="tp-ctl-btn"
                onClick={() => navigate(`/dashboard/agency/talent/${talent.applicationId}`)}
                aria-label="Open full profile"
                title="Full profile"
              >
                <Maximize2 size={15} strokeWidth={1.8} />
              </button>
            )}
            <button className="tp-ctl-btn" onClick={onClose} aria-label="Close panel">
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>

          <div className="tp-identity">
            <div className="tp-identity-top">
              <DivisionMark division={talent.type || talent.typeLabel || talent.archetype || 'editorial'} size="sm" onDark />
              <Place value={talent.location || talent.city} onDark />
            </div>
            {siteLink ? (
              <h2 className="tp-name">
                <a
                  className="tp-name-link"
                  href={siteLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Open ${talent.name}'s portfolio site`}
                >
                  {talent.name}
                  <ArrowUpRight className="tp-name-arrow" size={17} strokeWidth={1.75} aria-hidden="true" />
                </a>
              </h2>
            ) : (
              <h2 className="tp-name">{talent.name}</h2>
            )}
            {(identityDisputed || (identitySource === 'submission' && typeof emailVerified === 'boolean')) && (
              <MetaLine size="sm" onDark>
                {identitySource === 'submission' && typeof emailVerified === 'boolean' && (
                  <Notation onDark>{emailVerified ? 'Email verified' : 'Email unverified'}</Notation>
                )}
                {identityDisputed && <Notation onDark>Identity disputed</Notation>}
              </MetaLine>
            )}
          </div>
        </div>

        {/* ---------- Vitals band ---------- */}
        <VitalsBand measurements={profileHydrated?.measurements} />

        {/* ---------- Scrollable body ---------- */}
        <div className="tp-body">
          {isPipeline && (
            <div className="tp-topline tp-topline--pipe">
              <PipelineStatus status={status} />
            </div>
          )}

          <div className="tp-action-strip">
            <TalentActionBar
              applicationId={talent.applicationId}
              profileId={talent.profileId}
              slug={profileHydrated?.slug || talent.slug}
              status={status}
              context={context}
              layout="panel"
            />
          </div>

          <div className="tp-zone">{renderZone()}</div>

          {talent.applicationId && (
            <div className="tp-thread-wrap">
              <TalentThread
                applicationId={talent.applicationId}
                canMessage={canMessage}
                messagingDisabledReason="No Pholio account yet — this applicant can't be messaged directly."
              />
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};
