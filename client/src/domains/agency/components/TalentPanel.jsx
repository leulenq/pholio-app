import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, Maximize2, ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';
import { TalentActionBar } from './talent/TalentActionBar';
import { TalentThread } from './talent/TalentThread';
import { DiscoverZone } from './zones/DiscoverZone';
import { ApplicantsZone } from './zones/ApplicantsZone';
import { RosterZone } from './zones/RosterZone';
import { OverviewZone } from './zones/OverviewZone';
import { getTalentSiteLink } from './zones/profileHydration';
import MatchScore from './ui/MatchScore';
import './TalentPanel.css';

const scrollToThread = () =>
  document.getElementById('talent-thread')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const getInitials = (name) => {
  const parts = (name || '').trim().split(' ');
  return parts.length > 1
    ? (parts[0][0] || '') + (parts[1][0] || '')
    : (parts[0]?.[0] || '');
};

/**
 * Canonical Talent Panel — Two-zone drawer for agency dashboard talent viewing.
 * Callers must wrap conditional renders in <AnimatePresence> for exit animations.
 *
 * @param {Object} talent - { id, profileId, applicationId, name, photo, type, status, location }
 * @param {'discover'|'applicants'|'roster'|'overview'} context
 * @param {Function} onClose
 */
export const TalentPanel = ({ talent, context = 'roster', onClose }) => {
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

  const bio = profileHydrated?.bio || talent.bio || null;
  const siteLink = getTalentSiteLink({
    isPro: profileHydrated?.isPro,
    slug: profileHydrated?.slug || talent.slug,
    portfolioUrl: profileHydrated?.portfolioUrl,
  });
  const matchScore = talent.match ?? profileHydrated?.matchScore ?? null;

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
      case 'roster':
        return (
          <RosterZone
            profileId={talent.profileId}
            applicationId={talent.applicationId}
            onProfileHydrated={handleProfileHydrated}
            insight={talent.insight}
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
              <div className="tp-hero-gradient" />
              <div className="ag-grain tp-hero-grain" />
            </>
          ) : (
            <div className="tp-hero-fallback">
              {getInitials(talent.name).toUpperCase()}
            </div>
          )}

          {multi && (
            <>
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
              <div className="tp-carousel-dots">
                {images.map((img, i) => (
                  <button
                    key={img.path || i}
                    className={`tp-carousel-dot${i === carouselIdx ? ' tp-carousel-dot--active' : ''}`}
                    onClick={() => setCarouselIdx(i)}
                    aria-label={`Image ${i + 1}`}
                  />
                ))}
              </div>
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
            <div className="tp-meta-row">
              <span className="tp-meta-type">{talent.type || talent.typeLabel || 'editorial'}{talent.location || talent.city ? ` · ${talent.location || talent.city}` : ''}</span>
              {matchScore != null && <MatchScore score={matchScore} size="md" tone="dark" />}
            </div>
            {bio && <p className="tp-bio">{bio}</p>}
          </div>
        </div>

        <div className="tp-action-strip">
          <TalentActionBar
            applicationId={talent.applicationId}
            profileId={talent.profileId}
            slug={profileHydrated?.slug || talent.slug}
            status={talent.status}
            context={context}
            onMessage={scrollToThread}
          />
        </div>

        <div className="tp-body">
          {renderZone()}
          {talent.applicationId && (
            <div className="tp-thread-wrap">
              <TalentThread applicationId={talent.applicationId} />
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};
