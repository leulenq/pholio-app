/**
 * Casting Reveal — Full-Screen Cinematic Step Experience
 *
 * 5 full-viewport slides with AnimatePresence crossfade transitions:
 * Step 0: Calculating (auto-advance)
 * Step 1: Score Hero (large number + tier + caption)
 * Step 2: Radar Chart (Recharts, styled for Pholio)
 * Step 3: Breakdown (5 horizontal score bars)
 * Step 4: Verdict (top category + CTA)
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import { calculateFitScores, getCategoryInsights, getTopCategories, calculateOverallReadiness } from '../../utils/fitScoring';
import { ArrowRight, ChevronDown } from 'lucide-react';

// Fade-through-black transition variant
// mode="wait" + black bg = natural fade-through-black
const stepVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.4, ease: 'easeIn' }
  }
};

// ============================================================================
// ANIMATED COUNTER
// ============================================================================

function AnimatedCounter({ value, duration = 2000, delay = 400 }) {
  const [display, setDisplay] = useState(0);
  const animatedValue = useRef(null);

  useEffect(() => {
    // Skip if value hasn't arrived yet or is the same as what we already animated
    if (!value || value === animatedValue.current) return;
    animatedValue.current = value;

    const t0 = performance.now();
    const animate = (now) => {
      const elapsed = now - t0 - delay;
      if (elapsed < 0) { requestAnimationFrame(animate); return; }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, duration, delay]);

  return <span>{display}</span>;
}

// ============================================================================
// SCORE BAR
// ============================================================================

function ScoreBar({ label, score, insight, index, animate }) {
  const delay = index * 0.12;

  const getBarOpacity = (s) => {
    if (s >= 80) return 1;
    if (s >= 60) return 0.7;
    if (s >= 40) return 0.5;
    return 0.35;
  };

  return (
    <motion.div
      className="reveal-score-row"
      initial={{ opacity: 0, y: 16 }}
      animate={animate ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="reveal-score-header">
        <span className="reveal-score-label">{label}</span>
        <span className="reveal-score-value">
          {animate ? <AnimatedCounter value={score} duration={1200} delay={delay * 1000 + 200} /> : 0}
        </span>
      </div>

      <div className="reveal-bar-track">
        <motion.div
          className="reveal-bar-fill"
          style={{ opacity: getBarOpacity(score) }}
          initial={{ width: 0 }}
          animate={animate ? { width: `${score}%` } : {}}
          transition={{ duration: 1.2, delay: delay + 0.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {insight && (
        <motion.p
          className="reveal-score-insight"
          initial={{ opacity: 0 }}
          animate={animate ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: delay + 0.8 }}
        >
          {insight}
        </motion.p>
      )}
    </motion.div>
  );
}

// ============================================================================
// RADAR CHART — Recharts, styled for Pholio
// ============================================================================

function RadarTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="reveal-radar-tooltip">
        <span className="reveal-radar-tooltip-label">{d.category}</span>
        <span className="reveal-radar-tooltip-score">{d.score}</span>
      </div>
    );
  }
  return null;
}

function renderAxisTick({ payload, x, y, cx, cy }) {
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const nudge = 16;
  const nx = x + (dx / dist) * nudge;
  const ny = y + (dy / dist) * nudge;

  return (
    <text
      x={nx} y={ny}
      textAnchor="middle"
      dominantBaseline="central"
      style={{
        fontFamily: '"Inter", sans-serif',
        fontSize: '9px',
        fill: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        fontWeight: 500,
      }}
    >
      {payload.value}
    </text>
  );
}

// ============================================================================
// ADVANCE CHEVRON — pulsing gold hint at bottom
// ============================================================================

function AdvanceChevron({ delay = 1.5 }) {
  return (
    <motion.div
      className="reveal-advance-hint"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
    >
      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
      >
        <ChevronDown className="reveal-advance-chevron" />
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function CastingRevealRadar({ profileData, onComplete, onScoresCalculated }) {
  const [step, setStep] = useState(1); // 1=score, 2=look, 3=radar, 4=bars, 5=verdict

  // Map real image analysis data if available, otherwise show fallback
  let parsedAnalysis = {};
  if (profileData?.image_analysis) {
    try {
      if (typeof profileData.image_analysis === 'string') {
        parsedAnalysis = JSON.parse(profileData.image_analysis);
      } else {
        parsedAnalysis = profileData.image_analysis;
      }
    } catch (e) {
      console.error('Failed to parse image_analysis', e);
    }
  }

  const lookProfile = [
    { label: 'Skin Tone', value: parsedAnalysis.skinTone || 'Pending Assessment' },
    { label: 'Bone Structure', value: parsedAnalysis.boneStructure || 'Pending Assessment' },
    { label: 'Feature Contrast', value: parsedAnalysis.featureContrast || 'Pending Assessment' },
    { label: 'Look Type', value: parsedAnalysis.lookType || 'Pending Assessment' },
  ];
  
  // Use generated descriptor if available, otherwise fallback for Step 2
  const fallbackDescriptor = 'A naturally compelling presence awaiting full assessment.';
  const lookDescriptor = profileData?.look_descriptor || fallbackDescriptor;
  const [scores, setScores] = useState(null);
  const [insights, setInsights] = useState(null);
  const [topCategories, setTopCategories] = useState([]);
  const [readinessScore, setReadinessScore] = useState(0);

  const lastReportedData = useRef(null);

  useEffect(() => {
    const calculatedScores = calculateFitScores(profileData);
    const categoryInsights = getCategoryInsights(calculatedScores, profileData);
    const top3 = getTopCategories(calculatedScores);
    const overall = calculateOverallReadiness(calculatedScores);

    setScores(calculatedScores);
    setInsights(categoryInsights);
    setTopCategories(top3);
    setReadinessScore(overall);

    // Guard: Only notify parent if data has changed to prevent double-firing (Strict Mode)
    const dataString = JSON.stringify(profileData);
    if (onScoresCalculated && lastReportedData.current !== dataString) {
      lastReportedData.current = dataString;
      onScoresCalculated({
        runway: calculatedScores.runway,
        editorial: calculatedScores.editorial,
        commercial: calculatedScores.commercial,
        lifestyle: calculatedScores.lifestyle,
        swim_fitness: calculatedScores.swimFitness,
        overall: overall
      });
    }
  }, [profileData, onScoresCalculated]);

  const getCaption = (score) => {
    if (score === 0) return "We need more data to calculate your score.";
    if (score >= 85) return "You're nearly ready for professional representation.";
    if (score >= 70) return "You have a strong base — your profile needs polish.";
    if (score >= 55) return "Solid foundation. Focus on building your portfolio.";
    return "Let's build your profile from the ground up.";
  };

  const getTier = (score) => {
    if (score >= 90) return 'AGENCY READY';
    if (score >= 75) return 'STRONG CONTENDER';
    if (score >= 60) return 'DEVELOPING TALENT';
    return 'BUILDING YOUR BASE';
  };

  const categoryBars = scores ? [
    { label: 'Runway', score: scores.runway, key: 'runway' },
    { label: 'Editorial', score: scores.editorial, key: 'editorial' },
    { label: 'Commercial', score: scores.commercial, key: 'commercial' },
    { label: 'Lifestyle', score: scores.lifestyle, key: 'lifestyle' },
    { label: 'Swim / Fitness', score: scores.swimFitness, key: 'swimFitness' },
  ] : [];

  const topCategory = topCategories[0] || null;
  const topInsight = topCategory && insights ? insights[topCategory.key]?.insight : '';

  const radarData = scores ? [
    { category: 'Runway',       score: scores.runway },
    { category: 'Editorial',    score: scores.editorial },
    { category: 'Commercial',   score: scores.commercial },
    { category: 'Lifestyle',    score: scores.lifestyle },
    { category: 'Swim/Fitness', score: scores.swimFitness },
  ] : [];

  return (
    <div className="reveal-stage">
      <AnimatePresence mode="wait">

        {/* ── STEP 1: SCORE HERO ──────────────────────────────────── */}
        {step === 1 && (
          <motion.div key="score" className="reveal-step reveal-step-tappable" variants={stepVariants} initial="initial" animate="animate" exit="exit" onClick={() => setStep(2)}>
            <motion.p className="reveal-eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.8 }}>
              Casting Readiness Score
            </motion.p>

            <motion.div
              className="reveal-big-number"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <AnimatedCounter value={readinessScore} duration={2200} delay={600} />
            </motion.div>

            <motion.p className="reveal-tier-label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.4, duration: 0.5 }}>
              {getTier(readinessScore)}
            </motion.p>

            <motion.p className="reveal-caption" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.8, duration: 0.6 }}>
              {profileData?.look_descriptor || getCaption(readinessScore)}
            </motion.p>

            <AdvanceChevron delay={3.2} />
          </motion.div>
        )}

        {/* ── STEP 2: LOOK PROFILE ────────────────────────────────── */}
        {step === 2 && (
          <motion.div key="look" className="reveal-step reveal-step-tappable" variants={stepVariants} initial="initial" animate="animate" exit="exit" onClick={() => setStep(3)}>
            <motion.p className="reveal-eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }}>
              Your Look Profile
            </motion.p>

            <div className="reveal-look-rows">
              {lookProfile.map((row, i) => (
                <motion.div
                  key={row.label}
                  className="reveal-look-row"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="reveal-look-label">{row.label}</span>
                  <span className="reveal-look-divider" />
                  <span className="reveal-look-value">{row.value}</span>
                </motion.div>
              ))}
            </div>

            <motion.p
              className="reveal-look-descriptor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 + lookProfile.length * 0.2 + 0.3, duration: 0.6 }}
            >
              {lookDescriptor}
            </motion.p>

            <AdvanceChevron delay={0.4 + lookProfile.length * 0.2 + 0.8} />
          </motion.div>
        )}

        {/* ── STEP 3: RADAR CHART ─────────────────────────────────── */}
        {step === 3 && (
          <motion.div key="radar" className="reveal-step reveal-step-tappable" variants={stepVariants} initial="initial" animate="animate" exit="exit" onClick={() => setStep(4)}>
            <motion.div className="reveal-section-header" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <span className="reveal-section-eyebrow">Your Range</span>
              <h2 className="reveal-section-title">Market Fit Analysis</h2>
            </motion.div>

            <motion.div
              className="reveal-petals-wrap"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <ResponsiveContainer width="100%" height={380}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="rgba(201,165,90,0.12)" strokeWidth={0.5} />
                  <PolarAngleAxis dataKey="category" tick={renderAxisTick} stroke="rgba(201,165,90,0.15)" strokeWidth={0.5} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} stroke="transparent" />
                  <Radar name="Fit Score" dataKey="score" stroke="#C9A55A" fill="#C9A55A" fillOpacity={0.15} strokeWidth={1.5} animationDuration={1500} animationBegin={300} dot={{ r: 3, fill: '#C9A55A', strokeWidth: 0 }} />
                  <Tooltip content={<RadarTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </motion.div>

            <AdvanceChevron delay={1.8} />
          </motion.div>
        )}

        {/* ── STEP 4: BREAKDOWN BARS ──────────────────────────────── */}
        {step === 4 && (
          <motion.div key="bars" className="reveal-step reveal-step-tappable" variants={stepVariants} initial="initial" animate="animate" exit="exit" onClick={() => setStep(5)}>
            <motion.div className="reveal-section-header" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <span className="reveal-section-eyebrow">The Breakdown</span>
              <h2 className="reveal-section-title">Category Scores</h2>
            </motion.div>

            <motion.div
              className="reveal-hairline"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />

            <div className="reveal-bars-container">
              {categoryBars.map((cat, idx) => (
                <ScoreBar
                  key={cat.key}
                  label={cat.label}
                  score={cat.score}
                  insight={insights?.[cat.key]?.insight}
                  index={idx}
                  animate={true}
                />
              ))}
            </div>

            <AdvanceChevron delay={2} />
          </motion.div>
        )}

        {/* ── STEP 5: VERDICT ─────────────────────────────────────── */}
        {step === 5 && (
          <motion.div key="verdict" className="reveal-step" variants={stepVariants} initial="initial" animate="animate" exit="exit">
            {topCategory && (
              <>
                <motion.span className="reveal-verdict-eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
                  Strongest Market
                </motion.span>

                <motion.h2
                  className="reveal-verdict-category"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  {topCategory.label}
                  <span className="reveal-verdict-score">{topCategory.score}</span>
                </motion.h2>

                <motion.div className="reveal-hairline" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />

                <motion.p className="reveal-verdict-text" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6 }}>
                  {topInsight}
                </motion.p>

                {topCategories.length > 1 && (
                  <motion.div className="reveal-runners" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.6 }}>
                    {topCategories.slice(1).map((cat) => (
                      <div key={cat.key} className="reveal-runner-chip">
                        <span className="reveal-runner-label">{cat.label}</span>
                        <span className="reveal-runner-score">{cat.score}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </>
            )}

            <motion.button
              onClick={onComplete}
              className="reveal-cta group"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.6 }}
            >
              <span>Enter Your Dashboard</span>
              <ArrowRight className="reveal-cta-arrow" />
            </motion.button>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── STEP DOTS ─────────────────────────────────────────────── */}
      {step > 0 && (
        <div className="reveal-step-dots">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`reveal-dot-btn ${step === s ? 'active' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default CastingRevealRadar;
