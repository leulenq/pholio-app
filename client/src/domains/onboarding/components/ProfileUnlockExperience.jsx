import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Lock } from 'lucide-react';
import confetti from 'canvas-confetti';
import '../styles/ProfileUnlockExperience.css';

const EASE = [0.22, 1, 0.36, 1];
const CONFETTI_COLORS = ['#C9A55A', '#C8A96E', '#D4BC8A', '#A6845C', '#EFE3C9'];

const PHASE_KEY = {
  market: 'market',
  intel: 'intel',
  'tour-hero': 'market-hero',
  'tour-ledger': 'app-ledger',
  'tour-discovery': 'agency-discovery',
  'tour-apply-cta': 'apply-new',
};

const ALL_ANCHOR_KEYS = [...new Set(Object.values(PHASE_KEY))];

// How long each phase stays before auto-advancing
const DURATIONS = {
  celebrate: 3000,
  market: 1900,
  intel: 1900,
  nav: 1300,
  'tour-hero': 3500,
  'tour-ledger': 3500,
  'tour-discovery': 3500,
  'tour-apply-cta': 3500,
};
const DURATIONS_FAST = {
  celebrate: 400, market: 300, intel: 300, nav: 200,
  'tour-hero': 500, 'tour-ledger': 500, 'tour-discovery': 500, 'tour-apply-cta': 500,
};

const NAV_STEPS = {
  market: { label: 'Market', blurb: 'Apply to agencies — your profile is submission-ready.' },
  intel: { label: 'Intel', blurb: "See who's viewing and saving your profile." },
};

function getPageStep(phase, agencyName) {
  switch (phase) {
    case 'tour-hero':
      return { label: 'The Market', blurb: 'Your submission hub. Every agency, every status, one view.' };
    case 'tour-ledger':
      return { label: 'Your Ledger', blurb: 'Track every submission — status, decisions, and next moves.' };
    case 'tour-discovery':
      return { label: 'Open Agencies', blurb: 'Apply to any agency with one click. Your profile goes directly to their inbox.' };
    case 'tour-apply-cta':
      return { label: agencyName, blurb: `Open your application to ${agencyName} — tap to get started.` };
    default:
      return null;
  }
}

function queryEl(key) {
  return (
    document.querySelector(`[data-tl-nav="${key}"]`) ||
    document.querySelector(`[data-tour="${key}"]`)
  );
}

const TOUR_MAX_H = 260;

export default function ProfileUnlockExperience({
  isOpen,
  mode = 'generic',
  targetAgency = null,
  profile = null,
  onClose,
}) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef(null);
  const confettiRef = useRef(null);
  const timerRef = useRef(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [anchors, setAnchors] = useState({});

  const isTargeted = mode === 'targeted' && !!targetAgency?.id;
  const agencyName = targetAgency?.name || 'the agency';
  const firstName = profile?.first_name || profile?.full_name?.split(' ')?.[0] || '';

  const sequence = useMemo(
    () =>
      isTargeted
        ? ['celebrate', 'market', 'intel', 'nav', 'tour-hero', 'tour-apply-cta', 'done']
        : ['celebrate', 'market', 'intel', 'nav', 'tour-hero', 'tour-ledger', 'tour-discovery', 'done'],
    [isTargeted],
  );

  const phase = sequence[Math.min(phaseIdx, sequence.length - 1)];
  const isNavPhase = phase === 'market' || phase === 'intel';
  const isTourPhase = phase.startsWith('tour-');
  // Click is intercepted during all phases except the silent nav transition and final fade
  const isClickable = phase !== 'nav' && phase !== 'done';

  // Reset when the experience is dismissed and re-opened (defensive; it's a once-ever event)
  useEffect(() => {
    if (isOpen) return undefined;
    const id = setTimeout(() => setPhaseIdx(0), 0);
    return () => clearTimeout(id);
  }, [isOpen]);

  const advance = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPhaseIdx((i) => Math.min(i + 1, sequence.length - 1));
  }, [sequence.length]);

  // Single-timer auto-advance — reschedules each time the phase changes
  useEffect(() => {
    if (!isOpen || phase === 'done') return undefined;
    const durations = reduceMotion ? DURATIONS_FAST : DURATIONS;
    timerRef.current = setTimeout(advance, durations[phase] ?? 3000);
    return () => clearTimeout(timerRef.current);
  }, [isOpen, phaseIdx, phase, advance, reduceMotion]);

  // Navigate to applications when the silent transition phase fires
  useEffect(() => {
    if (phase !== 'nav') return;
    if (isTargeted && targetAgency?.id) {
      navigate(`/dashboard/talent/applications/apply?agency=${encodeURIComponent(targetAgency.id)}`);
      return;
    }
    navigate('/dashboard/talent/applications');
  }, [phase, navigate, isTargeted, targetAgency?.id]);

  // Auto-close after done
  useEffect(() => {
    if (phase !== 'done') return undefined;
    const id = setTimeout(() => onClose?.(), reduceMotion ? 200 : 800);
    return () => clearTimeout(id);
  }, [phase, onClose, reduceMotion]);

  const measure = useCallback(() => {
    const next = {};
    ALL_ANCHOR_KEYS.forEach((key) => {
      const el = queryEl(key);
      if (el) {
        const r = el.getBoundingClientRect();
        next[key] = {
          top: r.top, left: r.left, width: r.width, height: r.height,
          bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
        };
      }
    });
    setAnchors(next);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const id = setTimeout(measure, 0);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen, measure]);

  // Scroll to and re-measure each tour element when its phase starts
  useEffect(() => {
    if (!isTourPhase) return undefined;
    const key = PHASE_KEY[phase];
    if (!key) return undefined;
    const el = queryEl(key);
    if (el) el.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'center' });
    const id = setTimeout(measure, reduceMotion ? 0 : 700);
    return () => clearTimeout(id);
  }, [phase, isTourPhase, reduceMotion, measure]);

  // Opening confetti burst
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
    return () => { timers.forEach(clearTimeout); inst.reset(); confettiRef.current = null; };
  }, [isOpen, reduceMotion]);

  // Small spark at each nav item as its lock dissolves
  useEffect(() => {
    if (reduceMotion || !isNavPhase) return undefined;
    const key = PHASE_KEY[phase];
    const a = anchors[key];
    if (!a || !confettiRef.current) return undefined;
    const id = setTimeout(() => {
      confettiRef.current?.({
        colors: CONFETTI_COLORS, particleCount: 16, spread: 360, startVelocity: 15,
        scalar: 0.7, ticks: 130, gravity: 0.5, decay: 0.9,
        origin: { x: a.cx / window.innerWidth, y: a.cy / window.innerHeight },
      });
    }, 560);
    return () => clearTimeout(id);
  }, [phase, anchors, reduceMotion, isNavPhase]);

  if (!isOpen) return null;

  const activeKey = PHASE_KEY[phase];
  const active = activeKey ? anchors[activeKey] : null;
  const navStep = isNavPhase ? NAV_STEPS[phase] : null;
  const pageStep = isTourPhase ? getPageStep(phase, agencyName) : null;
  const step = navStep || pageStep;

  const pad = isTourPhase ? 10 : 9;
  const rawH = active ? active.height + pad * 2 : 0;
  const spotlightH = isTourPhase ? Math.min(rawH, TOUR_MAX_H + pad * 2) : rawH;

  const coachW = 248;
  const coachLeft = active
    ? Math.min(Math.max(active.cx - coachW / 2, 12), window.innerWidth - coachW - 12)
    : 0;
  const coachTop = active
    ? (isNavPhase ? active.bottom + 16 : active.top - pad + spotlightH + 16)
    : 0;

  const showSpotlight = active && (isNavPhase || isTourPhase);
  const showGuide = active && step && (isNavPhase || isTourPhase);

  return (
    <div
      className="celebrate-overlay"
      style={isClickable ? { pointerEvents: 'auto', cursor: 'pointer' } : {}}
      onClick={isClickable ? advance : undefined}
      aria-hidden={!showGuide}
    >
      <canvas ref={canvasRef} className="celebrate-canvas" aria-hidden="true" />

      {/* ───── Celebration veil ───── */}
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
            <motion.div
              className="celebrate-core"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -26, transition: { duration: 0.5, ease: EASE } }}
              transition={{ duration: reduceMotion ? 0.2 : 0.8, ease: EASE }}
            >
              <motion.h2
                className="celebrate-title"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduceMotion ? 0 : 0.4, duration: 0.85, ease: EASE }}
              >
                {isTargeted ? <>Ready for <em>{agencyName}.</em></> : <>Profile <em>complete.</em></>}
              </motion.h2>
              <motion.p
                className="celebrate-sub"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduceMotion ? 0 : 0.9, duration: 0.7, ease: EASE }}
              >
                {firstName ? `${firstName}, ` : ''}two surfaces just opened across your studio.
              </motion.p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ───── Spotlight ───── */}
      <AnimatePresence>
        {showSpotlight ? (
          <motion.div
            key={`spot-${activeKey}`}
            className="reveal-spotlight"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              top: active.top - pad,
              left: active.left - pad,
              width: active.width + pad * 2,
              height: spotlightH,
            }}
            exit={{ opacity: 0, transition: { duration: 0.3, ease: EASE } }}
            transition={{ duration: reduceMotion ? 0.2 : 0.55, ease: EASE }}
          />
        ) : null}
      </AnimatePresence>

      {/* ───── Lock dissolve (nav only) + coach mark ───── */}
      <AnimatePresence>
        {showGuide ? (
          <motion.div
            key={phase}
            className="reveal-group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3, ease: EASE } }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {isNavPhase && (
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
                    : { duration: 1.0, delay: 0.2, times: [0, 0.25, 0.55, 1], ease: EASE }
                }
              >
                <Lock size={12} strokeWidth={2} />
              </motion.span>
            )}

            <motion.div
              className="reveal-coach"
              style={{ top: coachTop, left: coachLeft, width: coachW }}
              initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.45, duration: 0.5, ease: EASE }}
            >
              <span
                className="reveal-coach-caret"
                style={{ left: Math.min(Math.max(active.cx - coachLeft, 22), coachW - 22) }}
                aria-hidden="true"
              />
              <span className="reveal-coach-state">Now open</span>
              <span className="reveal-coach-label">{step.label}</span>
              <span className="reveal-coach-blurb">{step.blurb}</span>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
