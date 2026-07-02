/**
 * Casting Measurements — the fitting.
 * Height is the only required step. Adults are then offered their stats once,
 * with a confident skip. The stat sequence is gender-aware. No weight, no AI
 * prediction — the dials start on a neutral anchor and read empty until touched.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeVariants } from './animations';
import { useCastingMeasurements, useCastingStatus } from '../hooks/useCasting';

import StepBeat from '../components/StepBeat';
import { AcknowledgmentBeat } from './AcknowledgmentBeat';
import { InlineErrorText } from '../../../shared/components/states';
import { useActionDock } from '../components/ActionDockContext';
import '../styles/CastingSteps.css';
import './CastingMeasurements.screen.css';

// Helpers
const IN_PER_CM = 0.393701;

// Neutral starting anchors for dial physics only — rendered dimmed/empty
// until the user first interacts (nothing is prefilled as a real answer).
const START = {
  height_cm: 170,
  bust_cm: 88,
  waist_cm: 70,
  hips_cm: 94,
  chest_cm: 98,
  inseam_cm: 80,
};

// Gender-aware stat fields (adults only). Non-Binary / Prefer not to say
// (and unknown) are offered no stats in onboarding — height → review.
function statFieldsFor(gender) {
  if (gender === 'Female') {
    return [
      { key: 'bust_cm', question: '*Bust*?', label: 'Bust' },
      { key: 'waist_cm', question: '*Waist*?', label: 'Waist' },
      { key: 'hips_cm', question: '*Hips*?', label: 'Hips' },
    ];
  }
  if (gender === 'Male') {
    return [
      { key: 'chest_cm', question: '*Chest*?', label: 'Chest' },
      { key: 'waist_cm', question: '*Waist*?', label: 'Waist' },
      { key: 'inseam_cm', question: '*Inseam*?', label: 'Inseam' },
    ];
  }
  return [];
}

// heightOnly: minors (and age-unknown profiles) confirm height only during
// onboarding — body measurements stay locked until guardian consent.

const tapeViewFor = (type, unitSystem) => {
  if (type === 'height') {
    return unitSystem === 'metric'
      ? { min: 122, max: 229, px: 6.7, major: 10, mid: 5 }
      : { min: 48, max: 90, px: 17, major: 12, mid: 6 };
  }
  // Bust / waist / hips — same tick rhythm as height, ~82% scale
  return unitSystem === 'metric'
    ? { min: 55, max: 145, px: 5.5, major: 10, mid: 5 }
    : { min: 22, max: 58, px: 14, major: 12, mid: 6 };
};

const DialArrow = ({ direction, onPointerDown, onPointerUp, onPointerCancel }) => (
  <button
    type="button"
    onPointerDown={onPointerDown}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerCancel}
    className="csm-dial-arrow"
    data-d={direction}
    aria-label={direction < 0 ? 'Decrease' : 'Increase'}
  >
    {direction < 0 ? (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    ) : (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    )}
  </button>
);

const PrecisionDeck = ({ value, onAdjust, onTouch, unitSystem, onToggleUnits, type = 'stat' }) => {
  const isStat = type === 'stat';
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const [dragContVal, setDragContVal] = useState(null);
  const inputRef = React.useRef(null);
  const dragRef = React.useRef({ x: null, baseVal: 0 });
  const dragContValRef = React.useRef(null);
  const intervalRef = React.useRef(null);
  const timeoutRef = React.useRef(null);
  const view = tapeViewFor(type, unitSystem);

  const ticks = useMemo(() => {
    const items = [];
    const majH = isStat ? 24 : 30;
    const midH = isStat ? 15 : 19;
    const minH = isStat ? 10 : 12;
    for (let v = view.min; v <= view.max; v += 1) {
      const isMaj = v % view.major === 0;
      const isMid = v % view.mid === 0;
      items.push({
        v,
        left: (v - view.min) * view.px,
        height: isMaj ? majH : isMid ? midH : minH,
        color: isMaj
          ? 'rgba(245, 241, 234, 0.55)'
          : isMid
            ? 'rgba(245, 241, 234, 0.3)'
            : 'rgba(245, 241, 234, 0.14)',
      });
    }
    return items;
  }, [view, isStat]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const clampVal = (v) => Math.max(view.min, Math.min(view.max, v));
  const tapeVal = dragContVal ?? value;
  const trackX = -((tapeVal - view.min) * view.px);

  const isImperial = unitSystem === 'imperial';
  const displayUnit = isImperial ? 'Imperial' : 'Metric';

  const formatDisplayValue = (val) => {
    if (type === 'height' && isImperial) {
      const ft = Math.floor(val / 12);
      const inc = val % 12;
      return (
        <>
          {ft}<span className="csm-dial-u">&apos;</span>{inc}<span className="csm-dial-u">&quot;</span>
        </>
      );
    }
    if (!isImperial) {
      return <>{val}<span className="csm-dial-u">cm</span></>;
    }
    return <>{val}<span className="csm-dial-u">&quot;</span></>;
  };

  const commitEdit = () => {
    const parsed = parseInt(editVal, 10);
    if (!isNaN(parsed)) {
      onTouch?.();
      const clamped = clampVal(parsed);
      const delta = clamped - value;
      if (delta !== 0) onAdjust(delta);
    }
    setIsEditing(false);
    setEditVal('');
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    onTouch?.();
    setIsDragging(true);
    dragRef.current = { x: e.clientX, baseVal: value };
    dragContValRef.current = value;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (dragRef.current.x === null) return;
    const contVal = clampVal(dragRef.current.baseVal - (e.clientX - dragRef.current.x) / view.px);
    dragContValRef.current = contVal;
    setDragContVal(contVal);

    // Actively update parent state during drag
    const snapped = Math.round(contVal);
    if (snapped !== value) {
      onAdjust(snapped - value);
    }
  };

  const endDrag = (e) => {
    if (dragRef.current.x === null) return;
    const contVal = dragContValRef.current ?? value;
    const snapped = Math.round(clampVal(contVal));
    dragRef.current.x = null;
    dragContValRef.current = null;
    setIsDragging(false);
    setDragContVal(null);
    if (snapped !== value) {
      onAdjust(snapped - value);
    }
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const startAdjusting = (e, direction) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onTouch?.();
    onAdjust(direction);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => { onAdjust(direction); }, 50);
    }, 400);
  };

  const stopAdjusting = (e) => {
    if (e?.currentTarget) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  return (
    <div className={`csm-dial-wrap${isStat ? ' csm-dial-wrap--stat' : ''}`}>
      <div className="csm-dial-row">
        <DialArrow
          direction={-1}
          onPointerDown={(e) => startAdjusting(e, -1)}
          onPointerUp={stopAdjusting}
          onPointerCancel={stopAdjusting}
        />

        {isEditing ? (
          <div className="csm-dial-edit">
            <input
              ref={inputRef}
              type="number"
              inputMode="numeric"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                if (e.key === 'Escape') { setIsEditing(false); setEditVal(''); }
              }}
              className="cinematic-tap-input"
              placeholder={String(value)}
              min={view.min}
              max={view.max}
            />
          </div>
        ) : (
          <div
            className="csm-dial-val"
            onClick={() => { setEditVal(String(value)); setIsEditing(true); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setEditVal(String(value));
                setIsEditing(true);
              }
            }}
            role="button"
            tabIndex={0}
          >
            {formatDisplayValue(Math.round(tapeVal))}
          </div>
        )}

        <DialArrow
          direction={1}
          onPointerDown={(e) => startAdjusting(e, 1)}
          onPointerUp={stopAdjusting}
          onPointerCancel={stopAdjusting}
        />
      </div>

      <div className="csm-dial-unit-label">{displayUnit}</div>

      <div
        className={`csm-ruler${isDragging ? ' is-dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="csm-ruler-track"
          style={{ transform: `translateX(${trackX}px)` }}
        >
          {ticks.map((t) => (
            <div
              key={t.v}
              className="csm-ruler-tick"
              style={{ left: t.left, height: t.height, background: t.color }}
            />
          ))}
        </div>
        <div className="csm-ruler-center" aria-hidden="true" />
      </div>

      <button
        type="button"
        onClick={onToggleUnits}
        className="csm-unit-toggle"
        aria-label="Toggle unit system"
      >
        <span className={unitSystem === 'imperial' ? 'is-on' : ''}>Imperial</span>
        <span className="csm-unit-bar" aria-hidden="true" />
        <span className={unitSystem === 'metric' ? 'is-on' : ''}>Metric</span>
      </button>
    </div>
  );
};

function CastingMeasurements({ onComplete, gender: genderProp, heightOnly = false, initialStep, registerBack, firstName }) {
  const { data: status } = useCastingStatus();
  // Prefer the explicit prop; fall back to the persisted profile so the live
  // flow still branches correctly if the parent hasn't wired gender through.
  const gender = genderProp ?? status?.profile?.gender;

  // Memoized so its identity is stable across renders — the dock's memoized
  // onAdvance/skip depend on it, and a fresh array each render would make the
  // dock re-publish endlessly against the always-mounted ActionDock provider.
  const statFields = useMemo(() => (heightOnly ? [] : statFieldsFor(gender)), [heightOnly, gender]);
  const offersStats = statFields.length > 0;

  // Global Unit Toggle
  const [unitSystem, setUnitSystem] = useState('imperial'); // 'imperial' | 'metric'

  // Wizard Step (initialStep is a dev-preview entry point; defaults to 'height')
  const [step, setStep] = useState(initialStep || 'height');

  // Measurements State (always stored in metric internally). Values start on a
  // neutral anchor for the dial physics; `touched` gates what actually gets sent.
  const [measurements, setMeasurements] = useState({ ...START });
  const [touched, setTouched] = useState({});

  const [saveError, setSaveError] = useState('');
  const [showBeat, setShowBeat] = useState(false);
  const pendingPayload = React.useRef(null);

  const measurementsMutation = useCastingMeasurements();

  const markTouched = (field) => {
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  };

  // Ordered step list for the current path.
  const sequence = React.useMemo(() => {
    if (heightOnly || !offersStats) return ['height', 'review'];
    return ['height', 'fitting', ...statFields.map((f) => f.key), 'review'];
  }, [heightOnly, offersStats, statFields]);

  // Payload is built the same as before — height always, touched stats only.
  // Memoized so the dock's onAdvance identity stays stable across re-renders
  // (the ActionDock re-publishes only when a real value changes).
  const buildPayload = useCallback(() => {
    const payload = { height_cm: Math.round(measurements.height_cm) };
    if (!heightOnly) {
      statFields.forEach((f) => {
        if (touched[f.key]) payload[f.key] = Math.round(measurements[f.key]);
      });
    }
    return payload;
  }, [measurements, heightOnly, statFields, touched]);

  const handleConfirm = useCallback(async () => {
    if (measurementsMutation.isPending) return;
    setSaveError('');
    const payload = buildPayload();
    try {
      await measurementsMutation.mutateAsync(payload);
      pendingPayload.current = payload;
      setShowBeat(true); // "Noted." beat, then onComplete
    } catch (error) {
      setSaveError(error.message || 'That did not save. Try once more.');
    }
  }, [measurementsMutation, buildPayload]);

  const goNext = useCallback(() => {
    const i = sequence.indexOf(step);
    if (i < sequence.length - 1) setStep(sequence[i + 1]);
    else handleConfirm();
  }, [sequence, step, handleConfirm]);

  const goBack = () => {
    const i = sequence.indexOf(step);
    if (i > 0) setStep(sequence[i - 1]);
  };

  // The shell's single back control owns "back": step backward through the
  // fitting's sub-steps first; from the first sub-step fall through to the
  // previous flow step.
  React.useEffect(() => {
    if (!registerBack) return undefined;
    registerBack(() => {
      if (sequence.indexOf(step) > 0) {
        goBack();
        return true;
      }
      return false;
    });
    return () => registerBack(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goBack is stable per step/sequence
  }, [registerBack, step, sequence]);

  // Height gates on touch — the dock stays dimmed until height is set, so no
  // nudge copy is needed (onAdvance is only reachable when enabled).
  const handleHeightNext = useCallback(() => {
    if (!touched.height_cm) return;
    goNext();
  }, [touched.height_cm, goNext]);

  const skipStats = useCallback(() => setStep('review'), []);

  // --- Display & Adjustment Helpers ---

  const augment = (field, delta) => {
    // imperial adjusts by 1 inch (~2.54cm), metric by 1cm.
    const cmDelta = unitSystem === 'imperial' ? 2.54 : 1;
    markTouched(field);
    setMeasurements((m) => ({ ...m, [field]: m[field] + delta * cmDelta }));
  };

  const displayHeight = () => {
    if (unitSystem === 'metric') return `${Math.round(measurements.height_cm)} cm`;
    const inchesTotal = Math.round(measurements.height_cm * IN_PER_CM);
    const ft = Math.floor(inchesTotal / 12);
    const inc = inchesTotal % 12;
    return `${ft}'${inc}"`;
  };

  const displayCircumference = (valCm) => {
    if (unitSystem === 'metric') return `${Math.round(valCm)} cm`;
    return `${Math.round(valCm * IN_PER_CM)}"`;
  };

  const toggleUnits = () => setUnitSystem((s) => (s === 'imperial' ? 'metric' : 'imperial'));

  const deckValue = (field) =>
    unitSystem === 'metric'
      ? Math.round(measurements[field])
      : Math.round(measurements[field] * IN_PER_CM);

  // Height dims until touched; stat steps always advance; review confirms.
  // During the "Noted." beat the dock is hidden (label: null).
  const dockConfig = useMemo(() => {
    if (showBeat) return { label: null };
    if (step === 'height') {
      return {
        label: heightOnly || !offersStats ? 'Review' : 'Next',
        enabled: !!touched.height_cm,
        onAdvance: handleHeightNext,
      };
    }
    if (step === 'fitting') {
      return {
        label: 'Add them now',
        enabled: true,
        onAdvance: goNext,
        skip: { label: 'Later', onClick: skipStats },
      };
    }
    if (step === 'review') {
      return {
        label: measurementsMutation.isPending ? 'Saving…' : 'Confirm',
        enabled: !measurementsMutation.isPending,
        onAdvance: handleConfirm,
      };
    }
    // A gender-aware stat step (bust / waist / hips / chest / inseam).
    const isLastStat = step === sequence[sequence.length - 2];
    return { label: isLastStat ? 'Review' : 'Next', enabled: true, onAdvance: goNext };
  }, [
    showBeat, step, heightOnly, offersStats, touched.height_cm,
    measurementsMutation.isPending, sequence,
    handleHeightNext, goNext, handleConfirm, skipStats,
  ]);

  useActionDock(dockConfig);




  // A stat step (bust / waist / hips / chest / inseam)
  const renderStatStep = (field) => (
    <motion.div key={field.key} variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="csm-step-stage">
      <StepBeat text={field.question} dividerDelay={0.3} />
      <PrecisionDeck
        value={deckValue(field.key)}
        unitSystem={unitSystem}
        onToggleUnits={toggleUnits}
        onTouch={() => markTouched(field.key)}
        onAdjust={(delta) => augment(field.key, delta)}
      />
    </motion.div>
  );

  return (
    <div className="relative w-full h-full">
      <AnimatePresence mode="wait">
        {showBeat && (
          <AcknowledgmentBeat
            key="beat"
            text="Noted."
            onDone={() => onComplete(pendingPayload.current)}
          />
        )}

        {/* Height — the only required step */}
        {!showBeat && step === 'height' && (
          <motion.div key="height" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="csm-step-stage">
            <StepBeat
              text={firstName ? `${firstName}, how tall are *you*?` : 'How tall are *you*?'}
              dividerDelay={0.3}
            />
            <PrecisionDeck
              value={deckValue('height_cm')}
              unitSystem={unitSystem}
              onToggleUnits={toggleUnits}
              onTouch={() => markTouched('height_cm')}
              onAdjust={(delta) => augment('height_cm', delta)}
              type="height"
            />
          </motion.div>
        )}

        {/* The fitting offer — adults only, once */}
        {!showBeat && step === 'fitting' && (
          <motion.div key="fitting" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="csm-step-stage">
            <StepBeat text="A quick *fitting*." dividerDelay={0.3} />
            <p className="cs-stage-helper">
              Add your measurements now, or whenever you&apos;re ready — agencies need them before you apply.
            </p>
          </motion.div>
        )}

        {/* Gender-aware stat steps */}
        {!showBeat && offersStats && statFields.map((f) => (step === f.key ? renderStatStep(f) : null))}

        {/* Review */}
        {!showBeat && step === 'review' && (
          <motion.div key="review" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="csm-step-stage">
            <StepBeat text="The *Final Look*" dividerDelay={0.2} />

            <div className="csm-rev-grid">
              <div className="csm-rev-cell-l">
                <div className="csm-rev-label">Height</div>
                <div className="csm-rev-val">{displayHeight()}</div>
              </div>
              <div className="csm-rev-cell-r">
                <div className="csm-rev-label">Weight</div>
                <div className="csm-rev-val">—</div>
              </div>

              {offersStats && (
                <div className="csm-rev-measure">
                  <div className="csm-rev-measure-val">
                    {statFields.map((f, i) => (
                      <React.Fragment key={f.key}>
                        {i > 0 && ' — '}
                        {touched[f.key] ? displayCircumference(measurements[f.key]).replace(/["cm ]/g, '') : '—'}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="csm-rev-measure-lbls">
                    {statFields.map((f, i) => (
                      <React.Fragment key={f.key}>
                        {i > 0 && <i>|</i>}
                        <span>{f.label.toUpperCase()}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {heightOnly && (
                <p className="csm-rev-note">
                  Body measurements stay locked until a parent or guardian consents.
                  You can add them later from your profile.
                </p>
              )}
            </div>

            <InlineErrorText message={saveError} className="cinematic-field-error" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CastingMeasurements;
