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
import { CardMeta } from './meta';
import { heightFigure } from './meta/metaFormat';
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

const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/**
 * The figures the spec ruler prints, in comp-card order: height leads (the
 * hard gate in every division), then bust/chest · waist · hips as their own
 * columns. A measurement that was never taken is omitted, not dashed.
 */
function specFigures(measurements, fallbackHeightCm) {
  const m = measurements || {};
  const out = [];
  const height = heightFigure(m.height_cm ?? fallbackHeightCm);
  if (height) out.push({ key: 'height', label: 'Height', value: height.value, sub: height.sub });
  const parts = [
    [m.bust_cm != null ? 'Bust' : 'Chest', m.bust_cm ?? m.chest_cm],
    ['Waist', m.waist_cm],
    ['Hips', m.hips_cm],
  ];
  for (const [label, raw] of parts) {
    const n = Number(raw);
    if (raw == null || !Number.isFinite(n) || n <= 0) continue;
    out.push({ key: label, label, value: String(Math.round(n)), sub: `${Math.round(n / 2.54)}″` });
  }
  // Height alone is not a spec line — it stays in the facts line under the
  // name instead of opening a band for a single number.
  return out.length > 1 ? out : [];
}

/**
 * Spec ruler — the ink band under the hero. Every figure gets an equal
 * column on one hairline grid, so the values read as a single measured line
 * that spans the drawer instead of clustering at its two edges.
 */
function SpecRuler({ figures }) {
  if (figures.length === 0) return null;
  return (
    <dl className="tp-spec-ruler" style={{ '--tp-cols': figures.length }}>
      {figures.map((f, i) => (
        <motion.div
          key={f.key}
          className="tp-spec-col"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.08 + i * 0.05 }}
        >
          <dt className="tp-spec-key">{f.label}</dt>
          <dd className="tp-spec-val">
            {f.value}<span className="tp-spec-unit">cm</span>
          </dd>
          {f.sub && <dd className="tp-spec-sub">{f.sub}</dd>}
        </motion.div>
      ))}
    </dl>
  );
}

/**
 * Pipeline track — Submitted → In review → Offered → Agreement as four equal
 * segments across the drawer. The rule fills to where the application sits;
 * the decision row directly beneath acts on the current segment.
 */
function PipelineTrack({ status }) {
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
    <ol className="tp-track" aria-label={`Status: ${stages[current].label}`}>
      {stages.map((st, i) => {
        const state = i < current || (represented && i === current) ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li
            key={st.label}
            className={`tp-track-st is-${state}${st.danger ? ' is-danger' : ''}`}
            aria-current={i === current ? 'step' : undefined}
          >
            <span className="tp-track-bar">
              {state !== 'todo' && (
                <motion.span
                  className="tp-track-fill"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ ...SPRING, delay: 0.12 + i * 0.09 }}
                />
              )}
            </span>
            <span className="tp-track-lbl">{st.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Canonical Talent Panel — the "Cinematic Column".
 * A right-hand sidebar drawer: cinematic hero, ink spec ruler, decision
 * block (pipeline track + action row), the book (+ comp card), and a tabbed working record
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
  const heightCm = profileHydrated?.measurements?.height_cm ?? talent.heightCm ?? null;
  const spec = specFigures(profileHydrated?.measurements, heightCm);
  const age = talent.age ?? null;
  const isMinor = talent.isMinor ?? (typeof age === 'number' ? age < 18 : false);
  const notations = [];
  if (identityDisputed) notations.push({ text: 'Identity disputed', tone: 'danger' });
  if (isMinor) notations.push({ text: 'Under 18', tone: 'warning' });
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
            {/* Who and where under the name; the measured figures — height
                included — live once, in the spec ruler below. Only the
                notations a booker has to act on ride along. */}
            <CardMeta
              className="tp-spec meta--onDark"
              figures={{ heightCm: spec.length ? null : heightCm, age }}
              context={{ city: talent.location || talent.city }}
              notations={notations}
            />
          </div>
        </div>

        {/* ---------- Spec ruler ---------- */}
        <SpecRuler figures={spec} />

        {/* ---------- Scrollable body ---------- */}
        <div className="tp-body">
          {/* Decision block — where the application sits, and the one move
              that advances it, read as a single unit. */}
          <section className={`tp-decide${isPipeline ? '' : ' tp-decide--bare'}`}>
            {isPipeline && <PipelineTrack status={status} />}
            <TalentActionBar
              applicationId={talent.applicationId}
              profileId={talent.profileId}
              slug={profileHydrated?.slug || talent.slug}
              status={status}
              context={context}
              layout="panel"
            />
          </section>

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
