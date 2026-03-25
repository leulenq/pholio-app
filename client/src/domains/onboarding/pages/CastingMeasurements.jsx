/**
 * Casting Measurements - Step 3: Sequential Wizard Flow
 * "High-end fitting session" vibe with AI-assisted inputs and global unit toggle.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeVariants, childVariants } from './animations';
import { useCastingMeasurements, useCastingStatus } from '../../../hooks/useCasting';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

import { ThinkingText } from './ThinkingText';
import { CinematicDivider } from './CinematicDivider';
import { CinematicNextButton, CinematicBackButton } from './CinematicNextButton';

// Helpers
const IN_PER_CM = 0.393701;
const KG_TO_LBS = 2.20462;

function CastingMeasurements({ photoData: propPhotoData, onComplete }) {
  const { data: status } = useCastingStatus();
  const scoutStepData = status?.state?.step_data?.scout || {};
  
  const photoData = propPhotoData || {
    photo_url: scoutStepData.photo_url,
    predictions: status?.state?.predictions || scoutStepData.predictions
  };

  // Global Unit Toggle
  const [unitSystem, setUnitSystem] = useState('imperial'); // 'imperial' or 'metric'

  // Wizard Step
  const [step, setStep] = useState('height'); // height -> weight -> bust -> waist -> hips -> review

  // Measurements State (Always stored in Metric internally)
  const [measurements, setMeasurements] = useState({
    height_cm: 175,
    weight_kg: 68,
    bust_cm: 86,
    waist_cm: 66,
    hips_cm: 91
  });

  // Track which fields were AI predicted and their VALUES (for Truth Anchor logic)
  const [predictedValues, setPredictedValues] = useState({});

  useEffect(() => {
    if (photoData?.predictions) {
      const preds = photoData.predictions;

      // Do not prefill if AI confidence is Low
      if (preds.confidence === 'Low') {
        console.warn('[CastingMeasurements] Low confidence AI prediction. Not pre-filling.');
        return;
      }

      const newMeasurements = { ...measurements };
      const newAiPredictions = {};

      if (preds.height_estimate_cm) {
        newMeasurements.height_cm = Math.round(preds.height_estimate_cm);
        newAiPredictions.height = Math.round(preds.height_estimate_cm);
      }
      if (preds.weight_kg) {
        newMeasurements.weight_kg = Math.round(preds.weight_kg);
        newAiPredictions.weight = Math.round(preds.weight_kg);
      }
      if (preds.bust_cm) {
        newMeasurements.bust_cm = Math.round(preds.bust_cm);
        newAiPredictions.bust = Math.round(preds.bust_cm);
      }
      if (preds.waist_cm) {
        newMeasurements.waist_cm = Math.round(preds.waist_cm);
        newAiPredictions.waist = Math.round(preds.waist_cm);
      }
      if (preds.hips_cm) {
        newMeasurements.hips_cm = Math.round(preds.hips_cm);
        newAiPredictions.hips = Math.round(preds.hips_cm);
      }

      setMeasurements(newMeasurements);
      setPredictedValues(newAiPredictions);
    }
  }, [photoData]);

  const measurementsMutation = useCastingMeasurements();
  
  const handleNext = () => {
    const sequence = ['height', 'weight', 'bust', 'waist', 'hips', 'review'];
    const currentIndex = sequence.indexOf(step);
    if (currentIndex < sequence.length - 1) {
      setStep(sequence[currentIndex + 1]);
    } else {
      handleConfirm();
    }
  };

  const handleBack = () => {
    const sequence = ['height', 'weight', 'bust', 'waist', 'hips', 'review'];
    const currentIndex = sequence.indexOf(step);
    if (currentIndex > 0) {
      setStep(sequence[currentIndex - 1]);
    }
  };

  const handleConfirm = async () => {
    try {
      // Map local state keys to the exact backend schema expectations
      const payload = {
        height_cm: measurements.height_cm,
        weight_kg: measurements.weight_kg,
        bust_cm: measurements.bust_cm,
        waist_cm: measurements.waist_cm,
        hips_cm: measurements.hips_cm
      };
      
      await measurementsMutation.mutateAsync(payload);
      toast.success('Stats saved');
      onComplete(measurements); // Pass measurements data back
    } catch (error) {
      toast.error(error.message || 'Failed to save');
    }
  };

  // --- Display & Adjustment Helpers ---

  // Height
  const augmentHeight = (delta) => {
    // If imperial, adjust by 1 inch (~2.54cm). If metric, 1cm.
    const cmDelta = unitSystem === 'imperial' ? 2.54 : 1;
    setMeasurements(m => ({ ...m, height_cm: m.height_cm + (delta * cmDelta) }));
  };

  const displayHeight = () => {
    if (unitSystem === 'metric') return `${Math.round(measurements.height_cm)} cm`;
    const inchesTotal = Math.round(measurements.height_cm * IN_PER_CM);
    const ft = Math.floor(inchesTotal / 12);
    const inc = inchesTotal % 12;
    return `${ft}'${inc}"`;
  };

  // Weight
  const augmentWeight = (delta) => {
    // If imperial, adjust by 1 lb. If metric, 1 kg.
    const kgDelta = unitSystem === 'imperial' ? (1 / KG_TO_LBS) : 1;
    setMeasurements(m => ({ ...m, weight_kg: m.weight_kg + (delta * kgDelta) }));
  };

  const displayWeight = () => {
    if (unitSystem === 'metric') return `${Math.round(measurements.weight_kg)} kg`;
    return `${Math.round(measurements.weight_kg * KG_TO_LBS)} lbs`;
  };

  // Circumferences (Bust, Waist, Hips)
  const augmentCircumference = (field, delta) => {
    // If imperial, 1 inch. Metric, 1 cm.
    const cmDelta = unitSystem === 'imperial' ? 2.54 : 1;
    setMeasurements(m => ({ ...m, [field]: m[field] + (delta * cmDelta) }));
  };

  const displayCircumference = (valCm) => {
    if (unitSystem === 'metric') return `${Math.round(valCm)} cm`;
    return `${Math.round(valCm * IN_PER_CM)}"`;
  };


  // Truth Anchor Helper: Check if current value matches prediction
  const isMatchingPrediction = (key, currentVal) => {
    // Only check if we have a prediction
    if (predictedValues[key] === undefined) return false;
    
    // Compare with small tolerance for floating point safety
    return Math.abs(currentVal - predictedValues[key]) < 0.1;
  };

  // --- Render Components ---

  const AIBadge = ({ hasPrediction, matchesPrediction }) => (
    <AnimatePresence>
      {hasPrediction && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.2em] uppercase px-4 py-1.5 rounded-full backdrop-blur-sm whitespace-nowrap"
          style={{
            color: matchesPrediction ? '#C9A55A' : 'rgba(255,255,255,0.35)',
            background: matchesPrediction ? 'rgba(201,165,90,0.08)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${matchesPrediction ? 'rgba(201,165,90,0.2)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          <span className="text-xs">{matchesPrediction ? '✦' : '✎'}</span>
          {matchesPrediction ? 'AI Predicted' : 'Adjusted'}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // --- Interaction Helpers (Drag & Keyboard) ---
  


// Cinematic Next Button - The "Signature" Footer

// Precision Deck - A tactile, horizontal ruler
const PrecisionDeck = ({ value, onAdjust, isAi, hasPrediction, unitLabel, type, onUnitToggle, unitSystem }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal]     = useState('');
  const inputRef   = React.useRef(null);
  const dragStart  = React.useRef({ x: 0, val: 0 });
  const intervalRef = React.useRef(null);
  const timeoutRef  = React.useRef(null);

  // Cleanup on unmount or update
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Auto-focus the input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Formatting Helper
  const formatDisplayValue = (val) => {
    if (type === 'height' && unitLabel === 'IN') {
      const ft = Math.floor(val / 12);
      const inc = val % 12;
      return (
        <span className="tracking-tighter">
          {ft}<span className="text-white/20 font-sans text-5xl align-top" style={{fontSize:'0.42em',lineHeight:1,marginLeft:'0.05em',marginRight:'0.08em'}}>&apos;</span>{inc}<span className="text-white/20 font-sans align-top" style={{fontSize:'0.35em',lineHeight:1,marginLeft:'0.04em'}}>"</span>
        </span>
      );
    }
    return val;
  };

  // Commit edit: parse the typed value, apply delta
  const commitEdit = () => {
    const parsed = parseInt(editVal, 10);
    if (!isNaN(parsed)) {
      const delta = parsed - value;
      if (delta !== 0) onAdjust(delta);
    }
    setIsEditing(false);
    setEditVal('');
  };

  // Drag Logic
  const handlePointerDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX };
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStart.current.x;
    const sensitivity = 20;
    const steps = Math.floor(deltaX / sensitivity);
    if (steps !== 0) {
      onAdjust(-steps);
      dragStart.current.x += steps * sensitivity;
    }
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  // Arrow Auto-Repeat Logic
  const startAdjusting = (e, direction) => {
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    onAdjust(direction);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => { onAdjust(direction); }, 50);
    }, 400);
  };

  const stopAdjusting = (e) => {
    if (e && e.target) {
      try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  // RULER VISUALS
  const range = Array.from({ length: 41 }, (_, i) => value - 20 + i);

  return (
    <div className="w-full flex flex-col items-center justify-end h-[55vh] pb-40 relative pointer-events-none">


       <AIBadge hasPrediction={hasPrediction} matchesPrediction={isAi && !isDragging} />


       {/* Main Value Display with Arrows */}
       <div className="mb-auto mt-auto flex items-center justify-center gap-12 w-full max-w-4xl px-4 relative z-40 pointer-events-auto">

          {/* Left Arrow */}
          <button
            onPointerDown={(e) => startAdjusting(e, -1)}
            onPointerUp={stopAdjusting}
            onPointerCancel={stopAdjusting}
            className="p-4 rounded-full text-white/50 hover:text-white border border-white/10 hover:border-white/25 hover:bg-white/8 transition-all duration-200 transform active:scale-95 select-none touch-none"
            aria-label="Decrease"
          >
            <ChevronLeft size={44} strokeWidth={1.5} />
          </button>

          {/* Value display — click to type */}
          <div className="text-center transform transition-all duration-300 w-64" style={{ scale: isDragging ? '1.05' : '1' }}>
            {isEditing ? (
              /* ── Inline edit input ── */
              <div className="h-32 flex flex-col items-center justify-end gap-2">
                <input
                  ref={inputRef}
                  type="number"
                  inputMode="numeric"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                    if (e.key === 'Escape') { setIsEditing(false); setEditVal(''); }
                  }}
                  className="cinematic-tap-input"
                  placeholder={String(value)}
                  min={type === 'height' ? 48 : 0}
                  max={type === 'height' ? 96 : 999}
                />
                <span className="text-[10px] uppercase tracking-[0.3em] text-white/25">
                  {unitLabel === 'IN' ? 'total inches' : unitLabel.toLowerCase()}  · Enter to confirm
                </span>
              </div>
            ) : (
              /* ── Normal display — tap to edit ── */
              <div
                className="text-9xl font-serif text-white tracking-tighter drop-shadow-[0_10px_40px_rgba(0,0,0,0.5)] h-32 flex items-end justify-center cursor-text select-none group relative"
                title="Tap to type"
                onClick={() => { setEditVal(String(value)); setIsEditing(true); }}
              >
                {formatDisplayValue(value)}
                {/* Subtle "tap to edit" hint that fades in on hover */}
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] tracking-[0.2em] uppercase text-white/20 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  tap to type
                </span>
              </div>
            )}
            <div className="text-xs uppercase tracking-[0.4em] text-[#C9A55A] mt-6 font-medium flex justify-center gap-2">
              {unitLabel}
            </div>
          </div>

          {/* Right Arrow */}
          <button
            onPointerDown={(e) => startAdjusting(e, 1)}
            onPointerUp={stopAdjusting}
            onPointerCancel={stopAdjusting}
            className="p-4 rounded-full text-white/50 hover:text-white border border-white/10 hover:border-white/25 hover:bg-white/8 transition-all duration-200 transform active:scale-95 select-none touch-none"
            aria-label="Increase"
          >
            <ChevronRight size={44} strokeWidth={1.5} />
          </button>
       </div>

       {/* The "Luxury Precision Dial" */}
       <div className="relative w-full h-40 flex items-center justify-center">

          {/* Center Jewel - The "Hero" */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 z-30 flex flex-col items-center">
             <div className="w-[3px] h-12 bg-[#C9A55A] shadow-[0_0_20px_rgba(201,165,90,0.6)] rounded-full" />
             <div className="absolute top-0 w-[1px] h-full bg-white/50" />
          </div>

          {/* The Scrolling Masked Container */}
          <div
            className="relative w-full h-full select-none touch-none cursor-ew-resize overflow-hidden cinematic-dial-mask pointer-events-auto"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
             <div className="absolute inset-0 flex items-end justify-center pointer-events-none pb-0">
                <div className="relative w-full h-full flex items-end justify-center">
                  {range.map((num) => {
                    const diff = num - value;
                    const xPos = diff * 40;
                    const dist = Math.abs(diff);
                    const isCentre = diff === 0;
                    const isNear   = dist <= 2;
                    const isMid    = dist <= 6;
                    const isFive   = num % 5 === 0;

                    // Opacity: centre full, falls off toward edges
                    const opacity = isCentre ? 1 : Math.max(0, 1 - (dist / 16));

                    // Tick height and colour
                    const tickH = isCentre ? 'h-10' : isNear ? 'h-7' : isMid ? 'h-5' : 'h-4';
                    const tickBg = isCentre
                      ? 'bg-[#C9A55A] shadow-[0_0_8px_rgba(201,165,90,0.7)]'
                      : isNear ? 'bg-white/60' : isMid ? 'bg-white/35' : 'bg-white/15';
                    const tickW = isCentre ? 'w-[2px]' : 'w-[1px]';

                    // Label: show for multiples of 5, brighter near centre
                    const labelOpacity = isCentre ? 0 : isNear ? 'text-white/55' : isMid ? 'text-white/30' : 'text-white/15';

                    return (
                      <div
                        key={num}
                        className="absolute bottom-0 flex flex-col items-center gap-3 transition-transform duration-75 ease-linear will-change-transform"
                        style={{ transform: `translateX(${xPos}px)`, opacity }}
                      >
                         {isFive && !isCentre && (
                            <span className={`text-[10px] font-sans tracking-widest mb-0.5 ${labelOpacity}`}>
                               {num}
                            </span>
                         )}
                         <div className={`${tickW} ${tickH} ${tickBg} rounded-full`} />
                      </div>
                    );
                  })}
                </div>
             </div>
          </div>
       </div>

       {/* Unit toggle — below the ruler, centred, clearly secondary */}
       <div className="flex justify-center mt-5 mb-2 pointer-events-auto relative z-40">
         <button
           onClick={onUnitToggle}
           className="group flex items-center gap-3 transition-opacity duration-200 opacity-30 hover:opacity-75"
           aria-label="Toggle unit system"
         >
           <span className={`text-[9px] font-sans tracking-[0.25em] uppercase transition-colors duration-150 ${
             unitSystem === 'imperial' ? 'text-[#C9A55A]' : 'text-[#C9A55A]/40'
           }`}>Imperial</span>
           {/* Minimal divider */}
           <span className="w-4 h-px bg-[#C9A55A]/20 group-hover:bg-[#C9A55A]/40 transition-colors" />
           <span className={`text-[9px] font-sans tracking-[0.25em] uppercase transition-colors duration-150 ${
             unitSystem === 'metric' ? 'text-[#C9A55A]' : 'text-[#C9A55A]/40'
           }`}>Metric</span>
         </button>
       </div>

    </div>
  );
};

  // --- Main Render ---


  return (
    <div className="relative w-full h-full">

      <AnimatePresence mode="wait">
        

        {/* Step 1: Height */}
        {step === 'height' && (
          <motion.div key="height" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="text-center pt-10">
            <ThinkingText text="Let's confirm your *height*" className="cinematic-question" style={{ marginBottom: '2.5rem' }} />
            <motion.div className="cinematic-ghost max-w-[600px] mx-auto" variants={childVariants}>
              <PrecisionDeck
                value={unitSystem === 'metric' ? Math.round(measurements.height_cm) : Math.round(measurements.height_cm * IN_PER_CM)}
                unitLabel={unitSystem === 'metric' ? 'CM' : 'IN'}
                onAdjust={(delta) => augmentHeight(delta)}
                isAi={isMatchingPrediction('height', measurements.height_cm)}
                hasPrediction={predictedValues.height !== undefined}
                type="height"
                unitSystem={unitSystem}
                onUnitToggle={() => setUnitSystem(s => s === 'imperial' ? 'metric' : 'imperial')}
              />
            </motion.div>
            <div className="fixed bottom-12 left-0 right-0 flex flex-col items-center gap-1 z-50 pointer-events-auto">
                <CinematicNextButton onClick={handleNext}>NEXT</CinematicNextButton>
            </div>
          </motion.div>
        )}

        {/* Step 2: Weight */}
        {step === 'weight' && (
          <motion.div key="weight" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="text-center pt-10">
            <ThinkingText text="Let's confirm your *weight*" className="cinematic-question" style={{ marginBottom: '2.5rem' }} />
            <motion.div className="cinematic-ghost max-w-[600px] mx-auto" variants={childVariants}>
              <PrecisionDeck
                value={unitSystem === 'metric' ? Math.round(measurements.weight_kg) : Math.round(measurements.weight_kg * KG_TO_LBS)}
                unitLabel={unitSystem === 'metric' ? 'KG' : 'LBS'}
                onAdjust={(delta) => augmentWeight(delta)}
                isAi={isMatchingPrediction('weight', measurements.weight_kg)}
                hasPrediction={predictedValues.weight !== undefined}
                unitSystem={unitSystem}
                onUnitToggle={() => setUnitSystem(s => s === 'imperial' ? 'metric' : 'imperial')}
              />
            </motion.div>
            <div className="fixed bottom-12 left-0 right-0 flex flex-col items-center gap-1 z-50 pointer-events-auto">
                <CinematicNextButton onClick={handleNext}>NEXT</CinematicNextButton>
                <CinematicBackButton onClick={handleBack} />
            </div>
          </motion.div>
        )}

        {/* Step 3: Bust */}
        {step === 'bust' && (
          <motion.div key="bust" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="text-center pt-10">
            <ThinkingText text="Bust *measurement*?" className="cinematic-question" style={{ marginBottom: '2.5rem' }} />
            <motion.div className="cinematic-ghost max-w-[600px] mx-auto" variants={childVariants}>
              <PrecisionDeck
                value={unitSystem === 'metric' ? Math.round(measurements.bust_cm) : Math.round(measurements.bust_cm * IN_PER_CM)}
                unitLabel={unitSystem === 'metric' ? 'CM' : 'IN'}
                onAdjust={(delta) => augmentCircumference('bust_cm', delta)}
                isAi={isMatchingPrediction('bust', measurements.bust_cm)}
                hasPrediction={predictedValues.bust !== undefined}
                unitSystem={unitSystem}
                onUnitToggle={() => setUnitSystem(s => s === 'imperial' ? 'metric' : 'imperial')}
              />
            </motion.div>
            <div className="fixed bottom-12 left-0 right-0 flex flex-col items-center gap-1 z-50 pointer-events-auto">
                <CinematicNextButton onClick={handleNext}>NEXT</CinematicNextButton>
                <CinematicBackButton onClick={handleBack} />
            </div>
          </motion.div>
        )}

        {/* Step 4: Waist */}
         {step === 'waist' && (
          <motion.div key="waist" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="text-center pt-10">
            <ThinkingText text="Waist *measurement*?" className="cinematic-question" style={{ marginBottom: '2.5rem' }} />
            <motion.div className="cinematic-ghost max-w-[600px] mx-auto" variants={childVariants}>
              <PrecisionDeck
                value={unitSystem === 'metric' ? Math.round(measurements.waist_cm) : Math.round(measurements.waist_cm * IN_PER_CM)}
                unitLabel={unitSystem === 'metric' ? 'CM' : 'IN'}
                onAdjust={(delta) => augmentCircumference('waist_cm', delta)}
                isAi={isMatchingPrediction('waist', measurements.waist_cm)}
                hasPrediction={predictedValues.waist !== undefined}
                unitSystem={unitSystem}
                onUnitToggle={() => setUnitSystem(s => s === 'imperial' ? 'metric' : 'imperial')}
              />
            </motion.div>
            <div className="fixed bottom-12 left-0 right-0 flex flex-col items-center gap-1 z-50 pointer-events-auto">
                <CinematicNextButton onClick={handleNext}>NEXT</CinematicNextButton>
                <CinematicBackButton onClick={handleBack} />
            </div>
          </motion.div>
        )}

        {/* Step 5: Hips */}
         {step === 'hips' && (
          <motion.div key="hips" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="text-center pt-10">
            <ThinkingText text="Hips *measurement*?" className="cinematic-question" style={{ marginBottom: '2.5rem' }} />
            <motion.div className="cinematic-ghost max-w-[600px] mx-auto" variants={childVariants}>
              <PrecisionDeck
                value={unitSystem === 'metric' ? Math.round(measurements.hips_cm) : Math.round(measurements.hips_cm * IN_PER_CM)}
                unitLabel={unitSystem === 'metric' ? 'CM' : 'IN'}
                onAdjust={(delta) => augmentCircumference('hips_cm', delta)}
                isAi={isMatchingPrediction('hips', measurements.hips_cm)}
                hasPrediction={predictedValues.hips !== undefined}
                unitSystem={unitSystem}
                onUnitToggle={() => setUnitSystem(s => s === 'imperial' ? 'metric' : 'imperial')}
              />
            </motion.div>
            <div className="fixed bottom-12 left-0 right-0 flex flex-col items-center gap-1 z-50 pointer-events-auto">
                <CinematicNextButton onClick={handleNext}>REVIEW</CinematicNextButton>
                <CinematicBackButton onClick={handleBack} />
            </div>
          </motion.div>
        )}

        {/* Step 6: Final Review */}
        {step === 'review' && (
           <motion.div key="review" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="text-center pt-10">
             <ThinkingText text="The *Final Look*" className="cinematic-question" style={{ marginBottom: '2.5rem' }} />
             <CinematicDivider delay={0.2} style={{ marginBottom: '2.5rem' }} />

             <motion.div className="cinematic-ghost max-w-[600px] mx-auto grid grid-cols-2 gap-y-8 gap-x-4 mb-12" variants={childVariants}>
                <div className="text-right border-r border-white/10 pr-6">
                   <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">Height</div>
                   <div className="text-2xl font-serif text-white">{displayHeight()}</div>
                </div>
                <div className="text-left pl-6">
                   <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">Weight</div>
                   <div className="text-2xl font-serif text-white">{displayWeight()}</div>
                </div>
                <div className="col-span-2 text-center pt-8">
                   <div className="text-3xl font-serif text-white tracking-widest mb-2">
                      {displayCircumference(measurements.bust_cm).replace(/["cm]/g, '')} - {displayCircumference(measurements.waist_cm).replace(/["cm]/g, '')} - {displayCircumference(measurements.hips_cm).replace(/["cm]/g, '')}
                   </div>
                   <div className="text-[10px] tracking-widest text-white/20 flex justify-center gap-3">
                      <span>BUST</span>
                      <span className="opacity-30">|</span>
                      <span>WAIST</span>
                      <span className="opacity-30">|</span>
                      <span>HIPS</span>
                   </div>
                </div>
             </motion.div>

            <div className="fixed bottom-12 left-0 right-0 flex flex-col items-center gap-1 z-50 pointer-events-auto">
                 <CinematicNextButton onClick={handleConfirm} icon={Check}>CONFIRM</CinematicNextButton>
                 <CinematicBackButton onClick={() => setStep('height')}>EDIT</CinematicBackButton>
            </div>
           </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

export default CastingMeasurements;
