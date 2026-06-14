/**
 * Casting Scout — "Portrait" step.
 * A premium Pholio media surface (borrowing the /media tab language: mono
 * kickers, numbered frames, gold Cover tag, crisp 2px edges) adapted to the
 * dark cinematic onboarding shell. The chosen frame is then scanned by the
 * scout AI to read the talent's look. Upload/scan logic is unchanged.
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { useCastingScout, useCastingPrimarySwap, useCastingConfirm } from '../hooks/useCasting';
import { toast } from 'sonner';
import { fadeVariants } from './animations';
import { TransferFailureNotice } from '../../../shared/components/states';

import { ThinkingText } from './ThinkingText';
import { CinematicDivider } from './CinematicDivider';
import { CinematicNextButton } from './CinematicNextButton';

import { Plus, X, Star, Loader2, Camera, Upload } from 'lucide-react';

const MAX_PHOTOS = 9;

let _uid = 1;
const uid = () => _uid++;

export default function CastingScout({ onComplete, userName }) {
  const [photos, setPhotos]         = useState([]);
  const [scanPhoto, setScanPhoto]   = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const fileInputRef = useRef(null);
  const scoutMutation = useCastingScout();
  const primarySwapMutation = useCastingPrimarySwap();
  const confirmMutation = useCastingConfirm();

  /* ── upload ── */
  const uploadEntry = useCallback(async (entry) => {
    setPhotos(p => p.map(x => x.id === entry.id ? { ...x, status: 'uploading' } : x));
    try {
      const fd = new FormData();
      fd.append('digi', entry.file);
      const result = await scoutMutation.mutateAsync(fd);
      setPhotos(p => p.map(x => x.id === entry.id ? { ...x, status: 'done', result, isPrimary: result.isPrimary } : x));
    } catch (err) {
      setPhotos(p => p.map(x => x.id === entry.id ? { ...x, status: 'error' } : x));
      toast.error(err?.message || 'Upload failed');
    }
  }, [scoutMutation]);

  const addFiles = useCallback(async (files) => {
    const free = MAX_PHOTOS - photos.length;
    if (free <= 0) { toast.error(`Max ${MAX_PHOTOS} photos.`); return; }
    const entries = Array.from(files).slice(0, free).map(file => ({
      id: uid(), file,
      previewUrl: URL.createObjectURL(file),
      status: 'idle',
      result: null,
    }));
    setPhotos(p => [...p, ...entries]);
    for (const e of entries) await uploadEntry(e);
  }, [photos.length, uploadEntry]);

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) { toast.error('JPG, PNG or WebP only.'); return; }
    addFiles(accepted);
  }, [addFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': ['.jpg','.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] },
    maxFiles: MAX_PHOTOS,
    disabled: !!scanPhoto,
    noClick: true,
    noDragEventsBubbling: true,
  });

  const openPicker = () => fileInputRef.current?.click();

  /* ── delete ── */
  const del = (id) => {
    setPhotos(p => {
      const e = p.find(x => x.id === id);
      if (e) URL.revokeObjectURL(e.previewUrl);
      return p.filter(x => x.id !== id);
    });
  };

  /* ── set primary (cover) ── */
  const setPrimary = async (photoId, imageId) => {
    try {
      setPhotos(p => p.map(x => ({ ...x, isPrimary: x.id === photoId })));
      await primarySwapMutation.mutateAsync({ imageId });
    } catch {
      toast.error('Failed to set cover photo');
    }
  };

  const scanIntervalRef = useRef(null);

  /* ── continue → scan ── */
  const handleContinue = () => {
    const primary = photos.find(p => p.status === 'done' && p.isPrimary) || photos.find(p => p.status === 'done');
    if (!primary) return;

    confirmMutation.mutate(undefined, {
      onMutate: () => {
        setScanPhoto({ previewUrl: primary.previewUrl, result: primary.result });
        let progress = 0;
        scanIntervalRef.current = setInterval(() => {
          progress = Math.min(progress + Math.random() * 8, 95);
          setScanProgress(progress);
          if (progress >= 95 && scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
          }
        }, 200);
      },
      onSuccess: (confirmResult) => {
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
        setScanProgress(100);
        setTimeout(() => onComplete(confirmResult), 1200);
      },
      onError: (err) => {
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
        setScanPhoto(null);
        toast.error('Analysis failed: ' + (err?.message || 'Please try again.'));
      }
    });
  };

  const doneCount = photos.filter(p => p.status === 'done').length;
  const hasOneDone = doneCount > 0;
  const anyLoading = photos.some(p => p.status === 'uploading');
  const hasUploadErrors = photos.some((p) => p.status === 'error');

  const greeting = userName && userName !== 'New' && userName !== 'User'
    ? `${userName}, show us your *look*`
    : 'Show us your *look*';

  return (
    <motion.div
      variants={fadeVariants}
      initial="initial" animate="animate" exit="exit"
      className="w-full flex flex-col items-center"
    >
      <AnimatePresence mode="wait">

        {/* ══════════  SCAN MOMENT  ══════════ */}
        {scanPhoto ? (
          <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full text-center">
            <div className="mx-auto" style={{ maxWidth: 380, marginTop: '1.5rem' }}>
              <div className="scout-scan-frame">
                <motion.img src={scanPhoto.previewUrl} alt=""
                  className="scout-scan-image"
                  initial={{ filter: 'blur(24px) grayscale(100%) brightness(0.5)', scale: 1.08 }}
                  animate={{ filter: 'blur(0px) grayscale(0%) brightness(1)', scale: 1 }}
                  transition={{ duration: 3.5, ease: [0.22, 1, 0.36, 1] }}
                />
                <motion.div className="scout-scan-line"
                  initial={{ top: '0%' }} animate={{ top: ['0%','100%','0%'] }}
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
                      animate={{ width: `${Math.min(scanProgress, 100)}%` }}
                      transition={{ duration: 0.3 }} style={{ width: '0%' }}
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

        ) : (

          /* ══════════  MEDIA SURFACE  ══════════ */
          <motion.div key="surface"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="w-full"
          >
            {/* Onboarding header — one-line heading + gold divider, matching
                the other sections. */}
            <ThinkingText
              text={greeting}
              className="cinematic-question"
              style={{ marginBottom: '1rem', whiteSpace: 'nowrap' }}
            />
            <CinematicDivider delay={0.5} style={{ marginTop: '1.5rem', marginBottom: '2.5rem' }} />

            <div className="pt-surface">
              {hasUploadErrors && (
              <div style={{ marginTop: '1.5rem' }}>
                <TransferFailureNotice
                  title="Some uploads failed"
                  body="One or more photos did not upload. Remove failed items and try again."
                  retry={{ label: 'Dismiss', onClick: () => setPhotos((p) => p.filter((x) => x.status !== 'error')) }}
                  className="sg-transfer-error"
                />
              </div>
            )}

            {/* Hidden native input */}
            <input
              ref={fileInputRef}
              type="file" multiple className="hidden"
              accept="image/jpeg,image/png,image/webp"
              disabled={!!scanPhoto}
              onChange={e => { if (e.target.files?.length) addFiles(Array.from(e.target.files)); e.target.value = ''; }}
            />

            {/* Count */}
            {photos.length > 0 && (
              <p className="pt-count">
                {photos.length} / {MAX_PHOTOS}
              </p>
            )}

            {/* Drop zone: empty frame, or the frame grid */}
            <div {...getRootProps()} className="pt-dropzone">
              <input {...getInputProps()} />

              {photos.length === 0 ? (
                <motion.div
                  className="pt-empty"
                  onClick={openPicker}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                >
                  <span className="pt-empty-icon">
                    <Camera size={22} strokeWidth={1.4} />
                  </span>
                  <span className="pt-empty-label">Add your photo</span>
                </motion.div>
              ) : (
                <div className="pt-grid">
                  <AnimatePresence>
                    {photos.map((photo, idx) => (
                      <motion.div
                        key={photo.id}
                        className={`pt-frame${photo.isPrimary ? ' is-cover' : ''}`}
                        layout
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <img src={photo.previewUrl} alt="" className="pt-frame-img" />
                        <span className="pt-frame-index">{String(idx + 1).padStart(2, '0')}</span>
                        {photo.isPrimary && <span className="pt-tag-cover">Cover</span>}

                        {photo.status === 'uploading' && (
                          <div className="pt-frame-loading">
                            <Loader2 size={18} className="animate-spin" />
                          </div>
                        )}
                        {photo.status === 'error' && <div className="pt-frame-error">!</div>}

                        {photo.status === 'done' && (
                          <div className="pt-frame-actions">
                            {!photo.isPrimary && (
                              <button
                                type="button"
                                className="pt-frame-action"
                                title="Make cover"
                                onClick={e => { e.stopPropagation(); setPrimary(photo.id, photo.result.imageId); }}
                              >
                                <Star size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="pt-frame-action pt-frame-action-danger"
                              title="Remove"
                              onClick={e => { e.stopPropagation(); del(photo.id); }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {photos.length < MAX_PHOTOS && (
                    <motion.button
                      type="button"
                      className="pt-add"
                      onClick={openPicker}
                      layout
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Plus size={18} strokeWidth={1.3} />
                      <span className="pt-add-label">Add</span>
                    </motion.button>
                  )}
                </div>
              )}

              {/* Drag overlay */}
              <AnimatePresence>
                {isDragActive && (
                  <motion.div className="pt-drag-overlay"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  >
                    <Upload size={24} strokeWidth={1.3} />
                    <span>Drop to add</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Helper / tips */}
            <p className="pt-helper">
              Natural light · Face the camera · No sunglasses · JPG, PNG, WEBP
            </p>

            {/* Continue */}
            <AnimatePresence>
              {hasOneDone && !anyLoading && (
                <motion.div
                  className="mt-2"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <CinematicNextButton onClick={handleContinue}>Continue</CinematicNextButton>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}
