import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { X, UserPlus, Check, Download, MessageCircle, Star, LayoutGrid, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { TalentStatusBadge } from './ui/TalentStatusBadge';
import { DiscoverZone } from './zones/DiscoverZone';
import { ApplicantsZone } from './zones/ApplicantsZone';
import { RosterZone } from './zones/RosterZone';
import { OverviewZone } from './zones/OverviewZone';
import './TalentPanel.css';

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
 * @param {Function} onAction - (action, talent) => void. Falls back to toast if absent.
 */
export const TalentPanel = ({ talent, context = 'roster', onClose, onAction }) => {
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [carouselImages, setCarouselImages] = useState(null);

  // Reset carousel state when a different talent is opened.
  // Hooks must be called unconditionally; early return is after them.
  useEffect(() => {
    const reset = () => {
      setCarouselIdx(0);
      setCarouselImages(null);
    };
    reset();
  }, [talent?.id]);

  // Guard after hooks — callers always gate on truthy talent, but be explicit.
  if (!talent) return null;

  const images = carouselImages || (talent.photo ? [{ path: talent.photo, alt: talent.name }] : []);
  const multi = images.length > 1;

  // All actions route through here so callers get a single onAction hook.
  // Discover "Add to Board" falls through to the coming-soon toast because
  // there is no applicationId in the discover context.
  const handleAction = (action) => {
    if (onAction) onAction(action, talent);
    else toast.success('Coming soon');
  };

  const renderZone = () => {
    // setCarouselImages is a stable React state setter — safe to pass as a prop.
    switch (context) {
      case 'discover':
        return (
          <DiscoverZone
            profileId={talent.profileId}
            onImagesLoaded={setCarouselImages}
          />
        );
      case 'applicants':
        return (
          <ApplicantsZone
            applicationId={talent.applicationId}
            onImagesLoaded={setCarouselImages}
          />
        );
      case 'roster':
        return (
          <RosterZone
            profileId={talent.profileId}
            applicationId={talent.applicationId}
            onImagesLoaded={setCarouselImages}
          />
        );
      case 'overview':
        return (
          <OverviewZone
            applicationId={talent.applicationId}
            onImagesLoaded={setCarouselImages}
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
        {/* ZONE A — EDITORIAL HERO */}
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

          <button className="tp-close-btn" onClick={onClose} aria-label="Close panel">
            <X size={17} />
          </button>

          <div className="tp-identity">
            <div className="tp-eyebrow">
              {(talent.type || 'editorial')}{talent.location ? ` · ${talent.location}` : ''}
            </div>
            <h2 className="tp-name">{talent.name}</h2>
            <div className="tp-identity-row">
              <TalentStatusBadge status={talent.status || 'available'} />
              {talent.match ? (
                <span className="tp-match"><strong>{talent.match}</strong> match</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* ZONE A — ACTION STRIP (part of fixed header, does not scroll) */}
        <div className="tp-action-strip">
          {context === 'discover' && (
            <button className="tp-btn tp-btn--primary" onClick={() => handleAction('invite')}>
              <UserPlus size={16} /> Invite
            </button>
          )}
          {['applicants', 'overview'].includes(context) && (
            <button className="tp-btn tp-btn--primary" onClick={() => handleAction('accept')}>
              <Check size={16} /> Accept
            </button>
          )}
          {context === 'roster' && (
            <button className="tp-btn tp-btn--primary" onClick={() => handleAction('download-comp-card')}>
              <Download size={16} /> Comp Card
            </button>
          )}
          {['roster', 'overview'].includes(context) && (
            <button className="tp-btn tp-btn--secondary" onClick={() => handleAction('message')}>
              <MessageCircle size={16} /> Message
            </button>
          )}
          {context === 'applicants' && (
            <button className="tp-btn tp-btn--secondary" onClick={() => handleAction('shortlist')}>
              <Star size={16} /> Shortlist
            </button>
          )}
          <button
            className="tp-btn tp-btn--secondary tp-btn--icon"
            title="Add to Board"
            onClick={() => handleAction('add-to-board')}
          >
            <LayoutGrid size={16} />
          </button>
          {context === 'applicants' && (
            <button
              className="tp-btn tp-btn--secondary tp-btn--icon tp-btn--danger"
              title="Reject"
              onClick={() => handleAction('reject')}
            >
              <XCircle size={16} />
            </button>
          )}
        </div>

        {/* ZONE B — CONTEXT BODY */}
        <div className="tp-body">
          {renderZone()}
        </div>
      </motion.div>
    </>
  );
};
