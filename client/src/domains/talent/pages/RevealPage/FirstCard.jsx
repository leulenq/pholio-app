/**
 * FirstCard — "The First Card" reveal.
 *
 * One continuous cinematic composition of the user's actual comp-card front:
 *   dark shell → a gold hairline draws the card's border (the gold thread
 *   culminating) → the headshot develops into the frame (blur/desaturate →
 *   sharp/colour, echoing the scout scan) → the name sets in the serif →
 *   height sets dual-unit beneath it.
 *
 * HEIGHT ONLY on the front. No scores, radar, bars, tiers, or 0–100 anything.
 * The card is parametric per user (its own image, its own missing slots).
 * After the CTA, one final personally-addressed welcome letter → dashboard.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useCastingRevealComplete } from '../../../onboarding/hooks/useCasting';
import { isMinorProfile } from '../../../../shared/utils/talentAge';
import './FirstCard.css';

// Develops / draws use the flow's cinematic easing; physical moves use its spring.
const DEVELOP_EASE = [0.22, 1, 0.36, 1];
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/** Prefer CDN/public URL; fall back to stored path (mirrors PhotosTab). */
function resolveImageUrl(img) {
  if (!img) return '';
  const raw = typeof img === 'string' ? img : img.public_url || img.path || '';
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return `/uploads/${value.replace(/^\/+/, '')}`;
}

/** "178 cm · 5'10"" — dual unit, height only. */
function formatHeight(cm) {
  const n = Number(cm);
  if (!Number.isFinite(n) || n <= 0) return null;
  const totalInches = Math.round(n / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${Math.round(n)} cm · ${feet}'${inches}"`;
}

/**
 * One optional direction line — rendered ONLY when real server analysis has
 * landed on the profile. Keyed on image_analysis.marketSignals (the vision
 * pass writes "specific market categories this look signals strongly").
 * No numbers, no tiers. Returns null when absent — then nothing renders.
 */
function deriveDirection(profile) {
  let analysis = profile?.image_analysis;
  if (typeof analysis === 'string') {
    try {
      analysis = JSON.parse(analysis);
    } catch {
      return null;
    }
  }
  if (!analysis || typeof analysis !== 'object') return null;
  const signals = Array.isArray(analysis.marketSignals) ? analysis.marketSignals : [];
  const cleaned = signals
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  if (cleaned.length === 0) return null;
  return `Your look reads strongest for ${cleaned.slice(0, 2).join(' / ')}`;
}

const STAT_KEYS = ['bust_cm', 'chest_cm', 'waist_cm', 'hips_cm', 'inseam_cm'];

function FirstCard({ profile, images = [] }) {
  const navigate = useNavigate();
  const revealComplete = useCastingRevealComplete();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState('card'); // 'card' | 'letter'

  const {
    firstName,
    fullName,
    heightLabel,
    headshotUrl,
    hasFullLength,
    hasStats,
    direction,
    minor,
  } = useMemo(() => {
    const first = (profile?.first_name || '').trim();
    const last = (profile?.last_name || '').trim();
    const list = Array.isArray(images) ? images : [];
    const primary = list.find((i) => i?.is_primary) || list[0] || null;
    const primaryUrl = resolveImageUrl(primary) || resolveImageUrl(profile?.photo_url_primary);
    const fullLength = list.find((i) => i?.shot_type === 'full_body') || null;
    return {
      firstName: first,
      fullName: `${first} ${last}`.trim(),
      heightLabel: formatHeight(profile?.height_cm),
      headshotUrl: primaryUrl,
      hasFullLength: Boolean(fullLength),
      hasStats: STAT_KEYS.some((k) => Number(profile?.[k]) > 0),
      direction: deriveDirection(profile),
      minor: isMinorProfile(profile),
    };
  }, [profile, images]);

  const handleEnter = useCallback(() => {
    // Non-blocking, exactly as the flow does today — state transition + timestamps.
    Promise.resolve(revealComplete.mutateAsync()).catch((err) => {
      console.warn('[FirstCard] reveal-complete failed (non-blocking):', err);
    });
    // Contract with the dashboard: suppress the AuthEntrySplash on this entry.
    try {
      sessionStorage.setItem('pholio:arrived-from-reveal', '1');
    } catch {
      /* private mode / storage disabled — non-fatal */
    }
    navigate('/dashboard/talent');
  }, [revealComplete, navigate]);

  // Reduced motion: collapse to a gentle fade-in of the finished card.
  const rise = (delay) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4 } }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { ...SPRING, delay },
        };

  const fade = (delay, duration = 0.6) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4 } }
      : {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration, delay, ease: DEVELOP_EASE },
        };

  return (
    <div className="fc-stage">
      <AnimatePresence mode="wait">
        {phase === 'card' ? (
          <motion.div
            key="card"
            className="fc-scene"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeIn' } }}
          >
            <div className="fc-card">
              {/* The gold thread — draws the card's border as the culmination. */}
              <svg
                className="fc-card-border"
                viewBox="0 0 100 140"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <motion.rect
                  x="0.75"
                  y="0.75"
                  width="98.5"
                  height="138.5"
                  rx="3"
                  ry="3"
                  fill="none"
                  stroke="rgba(201,165,90,0.85)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  initial={reduce ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0.9 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={
                    reduce
                      ? { duration: 0.4 }
                      : { duration: 1.2, delay: 0.15, ease: DEVELOP_EASE }
                  }
                />
              </svg>

              {/* Headshot develops into the frame. If missing, the frame stays as
                  the quiet develop-frame — never an error screen. */}
              <div className={`fc-photo${headshotUrl ? '' : ' fc-photo--empty'}`}>
                {headshotUrl ? (
                  <motion.img
                    src={headshotUrl}
                    alt={fullName || 'Your headshot'}
                    className="fc-photo-img"
                    initial={
                      reduce
                        ? { opacity: 0 }
                        : {
                            opacity: 1,
                            scale: 1.06,
                            filter: 'blur(24px) grayscale(100%) brightness(0.55)',
                          }
                    }
                    animate={
                      reduce
                        ? { opacity: 1 }
                        : {
                            opacity: 1,
                            scale: 1,
                            filter: 'blur(0px) grayscale(0%) brightness(1)',
                          }
                    }
                    transition={
                      reduce
                        ? { duration: 0.5 }
                        : { duration: 2.2, delay: 0.5, ease: DEVELOP_EASE }
                    }
                  />
                ) : (
                  <span className="fc-photo-label">Headshot</span>
                )}
              </div>

              {/* Name sets in the serif. */}
              {fullName && (
                <motion.h1 className="fc-name" {...rise(1.9)}>
                  {fullName}
                </motion.h1>
              )}

              {/* Height only — dual unit. */}
              {heightLabel && (
                <motion.p className="fc-height" {...rise(2.1)}>
                  {heightLabel}
                </motion.p>
              )}

              {/* Growth slots — the card itself shows its runway. */}
              {(!hasFullLength || !hasStats) && (
                <motion.div className="fc-slots" {...fade(2.5)}>
                  {!hasFullLength && (
                    <div className="fc-slot">
                      <span className="fc-slot-frame" aria-hidden="true" />
                      <span className="fc-slot-text">Full length</span>
                    </div>
                  )}
                  {!hasStats && (
                    <div className="fc-slot">
                      <span className="fc-slot-rule" aria-hidden="true" />
                      <span className="fc-slot-text">Stats — add when ready</span>
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Optional direction line — only when real analysis has landed. */}
            {direction && (
              <motion.p className="fc-direction" {...fade(2.75)}>
                {direction}
              </motion.p>
            )}

            <motion.button
              type="button"
              className="fc-cta"
              onClick={() => setPhase('letter')}
              {...fade(reduce ? 0 : 3.0)}
            >
              This is your card. Let&rsquo;s finish it.
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="letter"
            className="fc-scene fc-letter"
            initial={{ opacity: 0, y: reduce ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0.4 } : { ...SPRING, delay: 0.1 }}
          >
            <p className="fc-letter-body">
              {firstName ? `${firstName} — welcome to Pholio.` : 'Welcome to Pholio.'}{' '}
              {minor
                ? 'A parent or guardian unlocks applying — we’ll walk you both through it.'
                : 'Your card is started. The rest is craft.'}
            </p>
            <motion.button
              type="button"
              className="fc-cta"
              onClick={handleEnter}
              {...fade(reduce ? 0 : 0.6)}
            >
              Enter Pholio
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default FirstCard;
