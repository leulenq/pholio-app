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
import ColorSelect from '../components/ColorSelect';
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

// Optional NON-SENSITIVE appearance steps — offered to ALL talent (including
// minors and non-binary/undisclosed), every one skippable. Values must match
// the server enums in routes/casting.js exactly.
const APPEARANCE_STEPS = ['hair', 'eyes', 'shoe'];

const HAIR_OPTIONS = [
  { value: 'Black', swatch: '#1A1512' },
  { value: 'Brown', swatch: '#5A3A24' },
  { value: 'Blonde', swatch: '#D8B27A' },
  { value: 'Red', swatch: '#8E3B22' },
  { value: 'Gray', swatch: '#9A948C' },
  { value: 'White', swatch: '#EDE9E2' },
  { value: 'Other', swatch: null },
];

const EYE_OPTIONS = [
  { value: 'Brown', swatch: '#4E3520' },
  { value: 'Blue', swatch: '#5E82A8' },
  { value: 'Green', swatch: '#5F7A52' },
  { value: 'Hazel', swatch: '#7A5C33' },
  { value: 'Gray', swatch: '#8E969C' },
  { value: 'Amber', swatch: '#B0762D' },
  { value: 'Other', swatch: null },
];

// Per-region shoe scales. Switching region resets to that region's neutral
// anchor (scales are not interconvertible without gender-specific tables).
const SHOE_SCALES = {
  US: { min: 3, max: 16, anchor: 8 },
  EU: { min: 34, max: 50, anchor: 41 },
  UK: { min: 2, max: 15, anchor: 7 },
};
const SHOE_REGIONS = ['US', 'EU', 'UK'];

const formatShoe = (size) => (Number.isInteger(size) ? String(size) : size.toFixed(1));

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

// Shoe size — same dial instrument as the stats, no tape (half-size steps),
// with a three-way region toggle in the unit-toggle language.
const ShoeDeck = ({ shoe, onAdjust, onRegion }) => {
  const scale = SHOE_SCALES[shoe.region];
  const noop = () => {};
  return (
    <div className="csm-dial-wrap csm-dial-wrap--stat">
      <div className="csm-dial-row">
        <DialArrow
          direction={-1}
          onPointerDown={(e) => { e.preventDefault(); onAdjust(-0.5); }}
          onPointerUp={noop}
          onPointerCancel={noop}
        />
        <div className="csm-dial-val csm-dial-val--shoe">
          {formatShoe(shoe.size)}
          <span className="csm-dial-u">{shoe.region}</span>
        </div>
        <DialArrow
          direction={1}
          onPointerDown={(e) => { e.preventDefault(); onAdjust(0.5); }}
          onPointerUp={noop}
          onPointerCancel={noop}
        />
      </div>
      <div className="csm-dial-unit-label">
        {scale.min}–{scale.max}
      </div>
      <div className="csm-unit-toggle csm-shoe-toggle" role="radiogroup" aria-label="Shoe size region">
        {SHOE_REGIONS.map((region, i) => (
          <React.Fragment key={region}>
            {i > 0 && <span className="csm-unit-bar" aria-hidden="true" />}
            <button
              type="button"
              role="radio"
              aria-checked={shoe.region === region}
              className={shoe.region === region ? 'is-on' : ''}
              onClick={() => onRegion(region)}
            >
              {region}
            </button>
          </React.Fragment>
        ))}
      </div>
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

  // Optional appearance answers — null / untouched means "not answered" and
  // is simply left out of the payload (these steps can never block the flow).
  const [hairColor, setHairColor] = useState(null);
  const [eyeColor, setEyeColor] = useState(null);
  const [shoe, setShoe] = useState({ region: 'US', size: SHOE_SCALES.US.anchor, touched: false });

  const [saveError, setSaveError] = useState('');
  const [showBeat, setShowBeat] = useState(false);
  const pendingPayload = React.useRef(null);

  const measurementsMutation = useCastingMeasurements();

  const markTouched = (field) => {
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  };

  // Ordered step list for the current path. The appearance steps (hair / eyes
  // / shoe) are non-sensitive, offered to everyone — minors included — and
  // each one is skippable from the dock.
  const sequence = React.useMemo(() => {
    if (heightOnly || !offersStats) return ['height', ...APPEARANCE_STEPS, 'review'];
    return ['height', 'fitting', ...statFields.map((f) => f.key), ...APPEARANCE_STEPS, 'review'];
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
    // Appearance answers travel only when actually given.
    if (hairColor) payload.hair_color = hairColor;
    if (eyeColor) payload.eye_color = eyeColor;
    if (shoe.touched) {
      payload.shoe_size = shoe.size;
      payload.shoe_region = shoe.region;
    }
    return payload;
  }, [measurements, heightOnly, statFields, touched, hairColor, eyeColor, shoe]);

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

  // "Later" on the fitting offer skips the body stats but still passes through
  // the light appearance beats (all individually skippable too).
  const skipStats = useCallback(() => setStep('hair'), []);

  // Skipping an appearance step discards any picked value so "Skip" means skip.
  const skipHair = useCallback(() => { setHairColor(null); goNext(); }, [goNext]);
  const skipEyes = useCallback(() => { setEyeColor(null); goNext(); }, [goNext]);
  const skipShoe = useCallback(() => {
    setShoe((s) => ({ ...s, size: SHOE_SCALES[s.region].anchor, touched: false }));
    goNext();
  }, [goNext]);

  const adjustShoe = useCallback((delta) => {
    setShoe((s) => {
      const scale = SHOE_SCALES[s.region];
      const size = Math.max(scale.min, Math.min(scale.max, s.size + delta));
      return { ...s, size, touched: true };
    });
  }, []);

  // Scales are not interconvertible without gender tables — changing region
  // resets to that region's neutral anchor, un-answered.
  const setShoeRegion = useCallback((region) => {
    setShoe((s) =>
      s.region === region ? s : { region, size: SHOE_SCALES[region].anchor, touched: false },
    );
  }, []);

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
        label: 'Next',
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
    // Appearance beats — Next only once answered; Skip is always available and
    // never blocks (the answer just stays unset).
    if (step === 'hair') {
      return {
        label: 'Next', enabled: !!hairColor, onAdvance: goNext,
        skip: { label: 'Skip', onClick: skipHair },
      };
    }
    if (step === 'eyes') {
      return {
        label: 'Next', enabled: !!eyeColor, onAdvance: goNext,
        skip: { label: 'Skip', onClick: skipEyes },
      };
    }
    if (step === 'shoe') {
      return {
        label: 'Review', enabled: shoe.touched, onAdvance: goNext,
        skip: { label: 'Skip', onClick: skipShoe },
      };
    }
    // A gender-aware stat step (bust / waist / hips / chest / inseam).
    return { label: 'Next', enabled: true, onAdvance: goNext };
  }, [
    showBeat, step, touched.height_cm,
    measurementsMutation.isPending,
    hairColor, eyeColor, shoe.touched,
    handleHeightNext, goNext, handleConfirm, skipStats,
    skipHair, skipEyes, skipShoe,
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

        {/* Appearance beats — non-sensitive, offered to everyone, skippable */}
        {!showBeat && step === 'hair' && (
          <motion.div key="hair" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="csm-step-stage">
            <StepBeat text="Your *hair*?" dividerDelay={0.3} />
            <ColorSelect
              options={HAIR_OPTIONS}
              value={hairColor}
              onChange={setHairColor}
              ariaLabel="Hair color"
            />
          </motion.div>
        )}

        {!showBeat && step === 'eyes' && (
          <motion.div key="eyes" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="csm-step-stage">
            <StepBeat text="Your *eyes*?" dividerDelay={0.3} />
            <ColorSelect
              options={EYE_OPTIONS}
              value={eyeColor}
              onChange={setEyeColor}
              ariaLabel="Eye color"
            />
          </motion.div>
        )}

        {!showBeat && step === 'shoe' && (
          <motion.div key="shoe" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="csm-step-stage">
            <StepBeat text="*Shoe* size?" dividerDelay={0.3} />
            <ShoeDeck shoe={shoe} onAdjust={adjustShoe} onRegion={setShoeRegion} />
          </motion.div>
        )}

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

              {(hairColor || eyeColor || shoe.touched) && (
                <div className="csm-rev-look">
                  {[
                    hairColor && `${hairColor} hair`,
                    eyeColor && `${eyeColor} eyes`,
                    shoe.touched && `${shoe.region} ${formatShoe(shoe.size)} shoe`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
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
