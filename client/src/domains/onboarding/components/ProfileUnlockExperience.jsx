import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Lock, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import '../styles/ProfileUnlockExperience.css';

const EASE = [0.22, 1, 0.36, 1];
const WORDMARK = ['P', 'H', 'O', 'L', 'I', 'O'];
const CONFETTI_COLORS = ['#C9A55A', '#C8A96E', '#D4BC8A', '#A6845C', '#EFE3C9'];

const STEPS = {
  market: { label: 'Market', blurb: 'Apply to agencies — your profile is submission-ready.' },
  intel: { label: 'Intel', blurb: "See who's viewing and saving your profile." },
};

export default function ProfileUnlockExperience({
  isOpen,
  mode = 'generic',
  targetAgency = null,
  profile = null,
  isSubmitting = false,
  onPrimaryAction,
  onSecondaryAction,
  onClose,
  errorMessage,
}) {
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef(null);
  const confettiRef = useRef(null);
  const [phase, setPhase] = useState('celebrate'); // celebrate → market → intel → rest
  const [anchors, setAnchors] = useState({});

  const isTargeted = mode === 'targeted' && !!targetAgency?.id;
  const agencyName = targetAgency?.name || 'the agency';
  const firstName =
    profile?.first_name || profile?.full_name?.split(' ')?.[0] || '';

  // Locate the real top-nav items so the reveal can anchor to them.
  const measure = useCallback(() => {
    const next = {};
    Object.keys(STEPS).forEach((key) => {
      const el = document.querySelector(`[data-tl-nav="${key}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        next[key] = {
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          bottom: r.bottom,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
        };
      }
    });
    setAnchors(next);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen, measure]);

  // Self-advancing timeline.
  useEffect(() => {
    if (!isOpen) return undefined;
    const t = reduceMotion
      ? { market: 450, intel: 900, rest: 1300 }
      : { market: 3000, intel: 4900, rest: 6800 };
    const timers = [
      setTimeout(() => setPhase('market'), t.market),
      setTimeout(() => setPhase('intel'), t.intel),
      setTimeout(() => setPhase('rest'), t.rest),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isOpen, reduceMotion]);

  // Confetti — created once, reused for the opening burst and per-unlock sparks.
  useEffect(() => {
    if (!isOpen || reduceMotion || !canvasRef.current) return undefined;
    const inst = confetti.create(canvasRef.current, { resize: true, useWorker: false });
    confettiRef.current = inst;

    const base = { colors: CONFETTI_COLORS, scalar: 1, ticks: 320, gravity: 0.62, decay: 0.93 };
    const timers = [];
    inst({ ...base, particleCount: 46, spread: 70, startVelocity: 38, origin: { x: 0.5, y: 0.42 } });
    timers.push(setTimeout(() => inst({ ...base, particleCount: 22, angle: 60, spread: 55, startVelocity: 42, origin: { x: 0.12, y: 0.68 } }), 220));
    timers.push(setTimeout(() => inst({ ...base, particleCount: 22, angle: 120, spread: 55, startVelocity: 42, origin: { x: 0.88, y: 0.68 } }), 220));
    timers.push(setTimeout(() => inst({ ...base, particleCount: 28, spread: 120, startVelocity: 18, scalar: 0.9, gravity: 0.5, origin: { x: 0.5, y: 0 } }), 700));

    return () => {
      timers.forEach(clearTimeout);
      inst.reset();
      confettiRef.current = null;
    };
  }, [isOpen, reduceMotion]);

  // A small spark from the real nav item as its lock dissolves.
  useEffect(() => {
    if (reduceMotion) return undefined;
    if (phase !== 'market' && phase !== 'intel') return undefined;
    const a = anchors[phase];
    if (!a || !confettiRef.current) return undefined;
    const id = setTimeout(() => {
      confettiRef.current?.({
        colors: CONFETTI_COLORS,
        particleCount: 16,
        spread: 360,
        startVelocity: 15,
        scalar: 0.7,
        ticks: 130,
        gravity: 0.5,
        decay: 0.9,
        origin: { x: a.cx / window.innerWidth, y: a.cy / window.innerHeight },
      });
    }, 560);
    return () => clearTimeout(id);
  }, [phase, anchors, reduceMotion]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const primaryLabel = isTargeted
    ? isSubmitting
      ? 'Submitting'
      : `Submit to ${agencyName}`
    : isSubmitting
      ? 'Opening'
      : 'Enter Agency Market';

  const isReveal = phase === 'market' || phase === 'intel';
  const active = isReveal ? anchors[phase] : null;
  const step = isReveal ? STEPS[phase] : null;

  const pad = 9;
  const coachW = 248;
  const coachLeft = active
    ? Math.min(Math.max(active.cx - coachW / 2, 12), window.innerWidth - coachW - 12)
    : 0;

  return (
    <div className="celebrate-overlay" role="dialog" aria-modal="true" aria-label="Profile unlocked">
      <canvas ref={canvasRef} className="celebrate-canvas" aria-hidden="true" />

      {/* ───── Celebration ───── */}
      <AnimatePresence>
        {phase === 'celebrate' ? (
          <motion.div
            key="veil"
            className="celebrate-veil"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.55, ease: EASE } }}
            transition={{ duration: reduceMotion ? 0.15 : 0.5, ease: EASE }}
          >
            <div className="celebrate-grain" aria-hidden="true" />
            <div className="celebrate-ghost" aria-hidden="true">P</div>

            <motion.div
              className="celebrate-core"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -26, transition: { duration: 0.5, ease: EASE } }}
              transition={{ duration: reduceMotion ? 0.2 : 0.8, ease: EASE }}
            >
              <div className="celebrate-lockup" aria-label="Pholio">
                <span className="celebrate-word">
                  {WORDMARK.map((ltr, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduceMotion ? 0 : 0.25 + i * 0.06, duration: 0.55, ease: EASE }}
                    >
                      {ltr}
                    </motion.span>
                  ))}
                </span>
                <motion.i
                  className="celebrate-sweep"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: reduceMotion ? 0 : 0.8, duration: 0.8, ease: EASE }}
                />
              </div>

              <motion.p
                className="celebrate-kicker"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduceMotion ? 0 : 1.0, duration: 0.6, ease: EASE }}
              >
                Milestone — Profile Verified
              </motion.p>

              <motion.h2
                className="celebrate-title"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : 1.15, duration: 0.85, ease: EASE }}
              >
                {isTargeted ? (
                  <>Ready for <em>{agencyName}.</em></>
                ) : (
                  <>Profile <em>complete.</em></>
                )}
              </motion.h2>

              <motion.p
                className="celebrate-sub"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduceMotion ? 0 : 1.5, duration: 0.7, ease: EASE }}
              >
                {firstName ? `${firstName}, ` : ''}two surfaces just opened across your studio.
              </motion.p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ───── Spotlight on the real nav item ───── */}
      {active ? (
        <motion.div
          className="reveal-spotlight"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            top: active.top - pad,
            left: active.left - pad,
            width: active.width + pad * 2,
            height: active.height + pad * 2,
          }}
          transition={{ duration: reduceMotion ? 0.2 : 0.6, ease: EASE }}
        />
      ) : null}

      {/* ───── Dissolving lock + coach-mark, anchored to the item ───── */}
      <AnimatePresence>
        {active && step ? (
          <motion.div
            key={phase}
            className="reveal-group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.35, ease: EASE } }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <motion.span
              className="reveal-lock"
              style={{ top: active.cy, left: active.left + active.width + 6 }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 1.7], rotate: [0, 0, 0, 14] }
              }
              transition={
                reduceMotion
                  ? { duration: 0.2 }
                  : { duration: 1.0, delay: 0.25, times: [0, 0.25, 0.55, 1], ease: EASE }
              }
            >
              <Lock size={12} strokeWidth={2} />
            </motion.span>

            <motion.div
              className="reveal-coach"
              style={{ top: active.bottom + 16, left: coachLeft, width: coachW }}
              initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.5, duration: 0.55, ease: EASE }}
            >
              <span className="reveal-coach-caret" style={{ left: Math.min(Math.max(active.cx - coachLeft, 22), coachW - 22) }} aria-hidden="true" />
              <span className="reveal-coach-state">Now open</span>
              <span className="reveal-coach-label">{step.label}</span>
              <span className="reveal-coach-blurb">{step.blurb}</span>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ───── Final action ───── */}
      <AnimatePresence>
        {phase === 'rest' ? (
          <motion.div
            className="reveal-command"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0.2 : 0.6, ease: EASE }}
          >
            {errorMessage ? <p className="reveal-error">{errorMessage}</p> : null}
            <div className="reveal-actions">
              <button
                type="button"
                className="reveal-primary"
                onClick={onPrimaryAction}
                disabled={isSubmitting}
              >
                {primaryLabel}
                {!isSubmitting ? <ArrowUpRight size={17} /> : null}
              </button>
              <button
                type="button"
                className="reveal-secondary"
                onClick={onSecondaryAction}
                disabled={isSubmitting}
              >
                Explore on my own
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button type="button" className="celebrate-close" onClick={onClose} aria-label="Dismiss">
        <X size={18} />
      </button>
    </div>
  );
}
