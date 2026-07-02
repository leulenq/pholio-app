/**
 * Casting Scout — "Portrait" step.
 * Two labeled digitals slots (Headshot / Full length) instead of a free
 * photo grid — this mirrors how agencies actually intake talent digitals.
 * The headshot is required and becomes the casting photo (primary,
 * server-side); the full-length slot is optional and skippable. The chosen
 * headshot is then scanned by the scout AI to read the talent's look.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { useCastingScout, useCastingConfirm } from '../hooks/useCasting';
import { fadeVariants } from './animations';
import { TransferFailureNotice } from '../../../shared/components/states';
import { useActionDock } from '../components/ActionDockContext';

import StepBeat from '../components/StepBeat';
import { AcknowledgmentBeat } from './AcknowledgmentBeat';

import { X, Loader2, Upload } from 'lucide-react';
import '../styles/CastingSteps.css';
import './CastingScout.screen.css';

import { pitsSignalParts } from '../../../shared/constants/frameTaxonomy';

const ACCEPT = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] };

const EMPTY_SLOT = { status: 'empty', previewUrl: null, error: null, imageId: null, signals: null };

const FULL_LENGTH_READING = 'Needed before you apply';
const FILE_TYPE_ERROR = 'JPG, PNG or WebP only.';

function FramePits({ parts = [], reading = null }) {
  if (!reading && parts.length === 0) {
    return <div className="cs-frame-pits" aria-hidden="true" />;
  }
  if (reading) {
    return (
      <div className="cs-frame-pits">
        <span className="reading">{reading}</span>
      </div>
    );
  }
  return (
    <div className="cs-frame-pits">
      {parts.map((part) => (
        <span key={part.slug || part.label}>{part.label}</span>
      ))}
    </div>
  );
}

/* ── a single labeled digitals frame (gallery treatment: hairline frame,
      label placard set beneath like a caption card) ── */
function ScoutFrame({ label, slot, onDrop, onRemove, primary, pitsParts, pitsReading }) {
  const handleDrop = useCallback((accepted, rejected) => {
    onDrop(accepted, rejected);
  }, [onDrop]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPT,
    maxFiles: 1,
    multiple: false,
    disabled: slot.status === 'uploading',
    noDragEventsBubbling: true,
  });

  const filled = slot.status === 'done' || slot.status === 'uploading' || slot.status === 'error';

  return (
    <div className="cs-frame-slot">
      <div
        {...getRootProps()}
        className={`cs-frame-drop${filled ? ' is-filled' : ''}`}
        data-dragging={isDragActive || undefined}
        aria-label={filled ? `Replace ${label.toLowerCase()} photo` : `Add ${label.toLowerCase()} photo`}
      >
        <input {...getInputProps()} />

        {!filled && (
          <div className="cs-frame-empty">
            <span className="cs-frame-plus" aria-hidden="true" />
          </div>
        )}

        {filled && (
          <div className={`cs-frame-filled${primary && slot.status === 'done' ? ' is-primary' : ''}`}>
            <img src={slot.previewUrl} alt="" className="cs-frame-img" />

            {slot.status === 'uploading' && (
              <div className="cs-frame-loading">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}

            {slot.status === 'error' && (
              <div className="cs-frame-error-overlay">Tap to retry</div>
            )}

            {slot.status === 'done' && (
              <>
                <div className="cs-frame-replace">
                  <span>Tap to replace</span>
                </div>
                <button
                  type="button"
                  className="cs-frame-remove"
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  title="Remove"
                >
                  <X size={13} />
                </button>
              </>
            )}
          </div>
        )}

        {isDragActive && (
          <div className="cs-frame-dragover">
            <Upload size={18} strokeWidth={1.3} />
            <span className="cs-frame-empty-label">Drop to add</span>
          </div>
        )}
      </div>

      <span className="cs-frame-placard">{label}</span>

      <FramePits parts={pitsParts} reading={pitsReading} />

      {slot.status === 'error' && <p className="cs-frame-error-text">{slot.error}</p>}
    </div>
  );
}

export default function CastingScout({ onComplete, firstName, fullLengthEnabled = true }) {
  const [slots, setSlots] = useState(() => ({
    headshot: { ...EMPTY_SLOT },
    fullLength: { ...EMPTY_SLOT },
  }));
  const [scanning, setScanning] = useState(false);
  const [showBeat, setShowBeat] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const scoutMutation = useCastingScout();
  const confirmMutation = useCastingConfirm();

  const confirmResultRef = useRef(null);
  const beatTimerRef = useRef(null);

  useEffect(() => () => {
    if (beatTimerRef.current) clearTimeout(beatTimerRef.current);
  }, []);

  /* ── upload a file into a labeled slot ── */
  const uploadToSlot = useCallback(async (key, shotType, file) => {
    const previewUrl = URL.createObjectURL(file);
    setSlots((s) => {
      if (s[key]?.previewUrl) URL.revokeObjectURL(s[key].previewUrl);
      return { ...s, [key]: { status: 'uploading', previewUrl, error: null, imageId: null } };
    });
    try {
      const fd = new FormData();
      fd.append('digi', file);
      fd.append('shot_type', shotType);
      const result = await scoutMutation.mutateAsync(fd);
      setSlots((s) => ({ ...s, [key]: { status: 'done', previewUrl, error: null, imageId: result.imageId } }));
    } catch (err) {
      setSlots((s) => ({ ...s, [key]: { status: 'error', previewUrl, error: err?.message || 'Upload failed.', imageId: null } }));
    }
  }, [scoutMutation]);

  const makeDropHandler = useCallback((key, shotType) => (accepted, rejected) => {
    if (rejected?.length) {
      setSlots((s) => ({ ...s, [key]: { ...s[key], status: 'error', error: FILE_TYPE_ERROR } }));
      return;
    }
    const file = accepted?.[0];
    if (file) uploadToSlot(key, shotType, file);
  }, [uploadToSlot]);

  const removeSlot = useCallback((key) => {
    setSlots((s) => {
      if (s[key]?.previewUrl) URL.revokeObjectURL(s[key].previewUrl);
      return { ...s, [key]: { ...EMPTY_SLOT } };
    });
  }, []);

  /* ── continue → scan → confirm ── */
  const headshot = slots.headshot;
  const fullLength = slots.fullLength;
  const canContinue = headshot.status === 'done' && fullLength.status !== 'uploading';

  const handleContinue = useCallback(() => {
    if (!canContinue || confirmMutation.isPending) return;
    setConfirmError('');
    setScanning(true);
    confirmMutation.mutate(undefined, {
      onSuccess: (result) => {
        confirmResultRef.current = result;
        // Let the fill visibly reach 100% before handing off to the beat.
        beatTimerRef.current = setTimeout(() => setShowBeat(true), 900);
      },
      onError: (err) => {
        setScanning(false);
        setConfirmError(err?.message || 'Analysis failed. Try again.');
      },
    });
  }, [canContinue, confirmMutation]);

  const handleBeatDone = useCallback(() => {
    onComplete(confirmResultRef.current);
  }, [onComplete]);

  // The dock hides entirely during the scan moment and the acknowledgment
  // beat — only the digitals surface publishes a Continue action.
  const dockActive = !scanning && !showBeat;
  useActionDock({
    label: dockActive ? 'Continue' : null,
    enabled: dockActive && canContinue,
    onAdvance: handleContinue,
  });

  const hasRealName = firstName && firstName !== 'New' && firstName !== 'User';
  const greeting = hasRealName ? `${firstName}, let's *see you*.` : "Now — let's *see you*.";

  const headshotPits = headshot.status === 'done'
    ? pitsSignalParts(headshot.signals || {}, 'digital')
    : [];

  return (
    <div className="relative w-full h-full">
      <AnimatePresence mode="wait">

        {showBeat && (
          <AcknowledgmentBeat key="beat" text="That's the one." onDone={handleBeatDone} />
        )}

        {!showBeat && scanning && (
          /* ══════════  SCAN MOMENT  ══════════ */
          <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full text-center">
            <div className="mx-auto" style={{ maxWidth: 380, marginTop: '1.5rem' }}>
              <div className="scout-scan-frame">
                <motion.img src={headshot.previewUrl} alt=""
                  className="scout-scan-image"
                  initial={{ filter: 'blur(24px) grayscale(100%) brightness(0.5)', scale: 1.08 }}
                  animate={{ filter: 'blur(0px) grayscale(0%) brightness(1)', scale: 1 }}
                  transition={{ duration: 3.5, ease: [0.22, 1, 0.36, 1] }}
                />
                <motion.div className="scout-scan-line"
                  initial={{ top: '0%' }} animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                />
                <div className="scout-scan-grid" />
                <div className="scout-bracket scout-bracket-tl scout-bracket-active" />
                <div className="scout-bracket scout-bracket-tr scout-bracket-active" />
                <div className="scout-bracket scout-bracket-bl scout-bracket-active" />
                <div className="scout-bracket scout-bracket-br scout-bracket-active" />
                <div className="scout-scan-status">
                  <div className="scout-scan-indicator">
                    <div className="scout-scan-dot" />
                    <span className="scout-scan-label">Analyzing</span>
                  </div>
                  <p className="scout-scan-sublabel">Reading light, structure &amp; composition</p>
                  <div className="scout-progress-track">
                    <motion.div className="scout-progress-fill"
                      initial={{ width: '0%' }}
                      animate={{ width: confirmMutation.isSuccess ? '100%' : '88%' }}
                      transition={confirmMutation.isSuccess
                        ? { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
                        : { duration: 9, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>
                <motion.div className="scout-light-leak"
                  animate={{ opacity: [0, 0.3, 0] }}
                  transition={{ duration: 4, repeat: Infinity }}
                />
              </div>
            </div>
          </motion.div>

        ) }

        {!showBeat && !scanning && (
          /* ══════════  DIGITALS SLOTS  ══════════ */
          <motion.div key="surface" variants={fadeVariants} initial="initial" animate="animate" exit="exit" className="cs-step-stage">
            <StepBeat text={greeting} />

            <div className={`cs-frames${fullLengthEnabled ? '' : ' cs-frames--single'}`}>
                <ScoutFrame
                  label="Headshot"
                  slot={headshot}
                  onDrop={makeDropHandler('headshot', 'headshot')}
                  onRemove={() => removeSlot('headshot')}
                  primary
                  pitsParts={headshotPits}
                />
                {fullLengthEnabled && (
                  <ScoutFrame
                    label="Full length"
                    slot={fullLength}
                    onDrop={makeDropHandler('fullLength', 'full_body')}
                    onRemove={() => removeSlot('fullLength')}
                    pitsReading={fullLength.status !== 'done' ? FULL_LENGTH_READING : null}
                    pitsParts={fullLength.status === 'done'
                      ? pitsSignalParts(fullLength.signals || {}, 'digital')
                      : []}
                  />
                )}
              </div>

              {confirmError && (
                <div style={{ marginTop: '1.75rem' }}>
                  <TransferFailureNotice
                    title="Analysis failed"
                    body={confirmError}
                    retry={{ label: 'Try again', onClick: handleContinue }}
                  />
                </div>
              )}

              <p className="scout-helper">
                Plain background · Natural light · Minimal makeup · No filters
              </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
