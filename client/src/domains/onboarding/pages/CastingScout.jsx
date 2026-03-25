/**
 * Casting Scout - Step 2: The Look
 * UI derived from /dashboard/talent/media — same 3-column grid card pattern,
 * gold upload button trigger, hover overlay actions.
 * Dark-adapted for the cinematic onboarding background.
 * Backend upload logic unchanged.
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { useCastingScout, useCastingPrimarySwap, useCastingConfirm } from '../hooks/useCasting';
import { toast } from 'sonner';
import { fadeVariants } from './animations';

import { ThinkingText } from './ThinkingText';
import { CinematicDivider } from './CinematicDivider';

import { Sun, EyeOff, ScanFace, Plus, X, Check, Loader2, ArrowRight, Upload, Star } from 'lucide-react';

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

  /* ── delete ── */
  const del = (id) => {
    setPhotos(p => {
      const e = p.find(x => x.id === id);
      if (e) URL.revokeObjectURL(e.previewUrl);
      return p.filter(x => x.id !== id);
    });
  };

  /* ── set primary ── */
  const setPrimary = async (photoId, imageId) => {
    try {
      // Optimistically update UI
      setPhotos(p => p.map(x => ({ ...x, isPrimary: x.id === photoId })));
      await primarySwapMutation.mutateAsync({ imageId });
    } catch (err) {
      toast.error('Failed to set primary photo');
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

  const hasOneDone = photos.some(p => p.status === 'done');
  const anyLoading = photos.some(p => p.status === 'uploading');

  return (
    <motion.div
      variants={fadeVariants}
      initial="initial" animate="animate" exit="exit"
      className="w-full flex flex-col items-center"
    >
      <AnimatePresence mode="wait">

        {/* ══════════  SCAN  ══════════ */}
        {scanPhoto ? (
          <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full text-center">
            <div className="mx-auto" style={{ maxWidth: 420 }}>
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

          /* ══════════  MEDIA GRID UPLOAD  ══════════ */
          <motion.div key="grid"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="w-full text-center"
          >
            {/* Heading */}
            <ThinkingText
              text={
                userName && userName !== 'New' && userName !== 'User'
                  ? `Hey ${userName}, show us your *look*`
                  : 'Show us your *look*'
              }
              className="cinematic-question"
              style={{ marginBottom: '1.5rem' }}
            />
            <CinematicDivider delay={0.5} style={{ marginBottom: '2.5rem' }} />

            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file" multiple className="hidden"
              accept="image/jpeg,image/png,image/webp"
              disabled={!!scanPhoto}
              onChange={e => { if (e.target.files?.length) addFiles(Array.from(e.target.files)); e.target.value = ''; }}
            />

            {/* Count — only shown once photos exist */}
            {photos.length > 0 && (
              <p className="sg-count" style={{ marginBottom: '0.75rem' }}>
                {photos.length} / {MAX_PHOTOS}
              </p>
            )}

            {/* ── Grid wrapper: info trigger + drop zone ── */}
            <div className="sg-grid-wrap">

              {/* Gold 'i' info trigger — always top-right */}
              <div className="sg-info-trigger" aria-label="Photo tips">
                <span className="sg-info-icon">i</span>
                <div className="sg-info-panel" role="tooltip">
                  <p className="sg-info-title">Photo tips</p>
                  <ul className="sg-info-list">
                    <li>Best in natural light</li>
                    <li>Face the camera</li>
                    <li>Avoid sunglasses</li>
                    <li>Clear solo shot</li>
                  </ul>
                </div>
              </div>

              {/* Drop zone */}
              <div
                {...getRootProps()}
                className={`sg-root${isDragActive ? ' sg-root--dragging' : ''}`}
              >
              <input {...getInputProps()} />

              {photos.length === 0 ? (
                /* Empty state — click or drag to start */
                <motion.div
                  className="sg-empty"
                  onClick={() => fileInputRef.current?.click()}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="sg-empty-icon">
                    <Upload size={24} strokeWidth={1.4} />
                  </div>
                  <p className="sg-empty-label">Drag &amp; drop or tap to upload</p>
                </motion.div>
              ) : (
                /* Photo grid — mirrors studio-grid */
                <div className="sg-grid">
                  <AnimatePresence>
                    {photos.map((photo, idx) => (
                      <motion.div
                        key={photo.id}
                        className="sg-card group"
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.88 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {/* First uploaded = primary indicator */}
                        {photo.isPrimary && (
                          <div className="sg-primary-badge">Primary</div>
                        )}

                        <motion.img
                          src={photo.previewUrl} alt=""
                          className="sg-card-img"
                          initial={{ filter: 'blur(10px)', scale: 1.04 }}
                          animate={{ filter: 'blur(0px)', scale: 1 }}
                          transition={{ duration: 0.6 }}
                        />

                        {/* Hover overlay (mirrors portfolio-image-overlay) */}
                        <div className="sg-card-overlay" />

                        {/* Status */}
                        {photo.status === 'uploading' && (
                          <div className="sg-card-loading">
                            <Loader2 size={20} className="animate-spin" style={{ color: '#C9A55A' }} />
                          </div>
                        )}
                        {photo.status === 'done' && (
                          <div className="sg-card-tick">
                            <Check size={10} strokeWidth={3} />
                          </div>
                        )}
                        {photo.status === 'error' && (
                          <div className="sg-card-error">!</div>
                        )}

                        {/* Hover action — primary & delete */}
                        {!scanPhoto && photo.status === 'done' && (
                          <div className="sg-card-actions">
                            {!photo.isPrimary && (
                              <button
                                type="button"
                                className="sg-action-btn sg-action-primary"
                                onClick={e => { e.stopPropagation(); setPrimary(photo.id, photo.result.imageId); }}
                                title="Set as Primary"
                                style={{ marginRight: '4px' }}
                              >
                                <Star size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="sg-action-btn sg-action-delete"
                              onClick={e => { e.stopPropagation(); del(photo.id); }}
                              title="Remove"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Add-more card — always last in grid */}
                  {photos.length < MAX_PHOTOS && (
                    <motion.button
                      type="button"
                      className="sg-card-add"
                      onClick={() => fileInputRef.current?.click()}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Plus size={18} strokeWidth={1.2} />
                    </motion.button>
                  )}
                </div>
              )}

              {/* Drag overlay */}
              <AnimatePresence>
                {isDragActive && (
                  <motion.div className="sg-drag-overlay"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  >
                    <Upload size={28} strokeWidth={1.2} />
                    <span>Drop to add</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>{/* /sg-root */}
            </div>{/* /sg-grid-wrap */}

            {/* ── Tips ── */}
            <motion.div className="scout-tips" style={{ marginTop: '1.8rem' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0 }}
            >
              {[
                { icon: Sun,     label: 'Natural light' },
                { icon: EyeOff,  label: 'No sunglasses' },
                { icon: ScanFace,label: 'Face the camera' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="scout-tip">
                  <Icon size={13} strokeWidth={1.5} />
                  <span>{label}</span>
                </div>
              ))}
            </motion.div>

            {/* ── Continue ── */}
            <AnimatePresence>
              {hasOneDone && !anyLoading && (
                <motion.div className="scout-continue-wrap"
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <button type="button" className="scout-continue-btn" onClick={handleContinue}>
                    <span>Continue</span>
                    <ArrowRight size={15} strokeWidth={2.2} />
                  </button>
                  <p className="scout-continue-hint">
                    {photos.filter(p => p.status === 'done').length} photo
                    {photos.filter(p => p.status === 'done').length !== 1 ? 's' : ''} ready
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
