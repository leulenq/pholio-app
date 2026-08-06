import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { updateBoard, uploadBoardIdentityImage } from '../api/agency';
import {
  resolveBoardIdentity, boardIdentityStyle, PLATE_STYLES,
} from '../lib/board-identity';
import { AgencyButton } from './ui';
import './BoardIdentityEditor.css';

/**
 * BoardIdentityEditor — per-board art direction.
 *
 * Lets an agency commit a board to a house color, a plate treatment
 * (ink / paper / cover), a client logo, and a cover visual. Curated
 * defaults from board-identity.js remain the fallback; anything set
 * here overrides them. House color is the client's voice — Pholio gold
 * stays reserved for platform actions.
 */

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

// Curated house-grade swatches — deep tones, never neon, never platform gold.
const SWATCHES = [
  '#16130D', '#5C2E36', '#2E4A3C', '#2C3A52',
  '#7A4A18', '#A31621', '#B4501C', '#2F5057',
];

const STYLE_LABELS = { ink: 'Ink', paper: 'Paper', cover: 'Cover' };

const LOGO_TYPES = ['image/png', 'image/svg+xml'];
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const LOGO_MAX = 2 * 1024 * 1024;
const COVER_MAX = 8 * 1024 * 1024;

export default function BoardIdentityEditor({ board, open, onClose }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState({});
  const [hexInput, setHexInput] = useState('');
  const [uploading, setUploading] = useState(null); // 'logo' | 'cover' | null
  const logoRef = useRef(null);
  const coverRef = useRef(null);

  // Reset the draft each time the editor opens for a board (adjust during render).
  const openKey = open ? (board?.id ?? 'open') : null;
  const [prevOpenKey, setPrevOpenKey] = useState(openKey);
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (open && board) {
      setDraft({
        brand_color: board.brand_color || null,
        plate_style: board.plate_style || null,
        logo_path: board.logo_path || null,
        cover_image_path: board.cover_image_path || null,
      });
      setHexInput(board.brand_color || '');
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const previewBoard = useMemo(() => ({ ...board, ...draft }), [board, draft]);
  const identity = useMemo(() => resolveBoardIdentity(previewBoard), [previewBoard]);

  const save = useMutation({
    mutationFn: () => updateBoard(board.id, {
      brand_color: draft.brand_color,
      plate_style: draft.plate_style,
      logo_path: draft.logo_path,
      cover_image_path: draft.cover_image_path,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-candidates', board.id] });
      qc.invalidateQueries({ queryKey: ['agency-boards'] });
      toast.success('Board identity updated');
      onClose();
    },
    onError: () => toast.error('Could not save the board identity'),
  });

  const pickColor = (hex) => {
    setDraft((d) => ({ ...d, brand_color: hex }));
    setHexInput(hex || '');
  };

  const onHexChange = (value) => {
    setHexInput(value);
    if (HEX_RE.test(value)) setDraft((d) => ({ ...d, brand_color: value.toUpperCase() }));
  };

  const upload = async (kind, file) => {
    if (!file) return;
    const types = kind === 'logo' ? LOGO_TYPES : COVER_TYPES;
    const max = kind === 'logo' ? LOGO_MAX : COVER_MAX;
    if (!types.includes(file.type)) {
      toast.error(kind === 'logo' ? 'Logo must be a PNG or SVG file.' : 'Cover must be a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > max) {
      toast.error(`File is too large (max ${kind === 'logo' ? '2' : '8'} MB).`);
      return;
    }
    setUploading(kind);
    try {
      const result = await uploadBoardIdentityImage(board.id, file, kind);
      const path = result?.path || result?.data?.path;
      if (!path) throw new Error('No path returned');
      setDraft((d) => (kind === 'logo' ? { ...d, logo_path: path } : { ...d, cover_image_path: path }));
    } catch {
      toast.error('Upload failed — try again.');
    } finally {
      setUploading(null);
    }
  };

  const coverDisabled = !draft.cover_image_path;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="cn-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="cn-modal bide"
            role="dialog"
            aria-modal="true"
            aria-label="Board identity"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 230, damping: 24 }}
          >
            <div className="cn-modal-head">
              <h2 className="cn-modal-title">Board identity</h2>
              <button type="button" className="cn-close" onClick={onClose} aria-label="Close"><X size={17} /></button>
            </div>

            {/* Live plate preview — the exact folio plate this board will wear. */}
            <div
              className="bide-preview"
              style={boardIdentityStyle(identity)}
              data-letterform={identity.letterform}
              data-treatment={identity.treatment}
              aria-hidden="true"
            >
              {identity.logoUrl
                ? <img className="bide-preview-logo" src={identity.logoUrl} alt="" />
                : <span className="bide-preview-mark">{identity.label}</span>}
              <span className="bide-preview-meta">Closes Aug 12</span>
            </div>

            <div className="cn-modal-body">
              <div className="cn-field">
                <span className="cn-label">Plate style</span>
                <div className="bide-styles">
                  <button
                    type="button"
                    className={`bide-style${draft.plate_style == null ? ' bide-style--on' : ''}`}
                    onClick={() => setDraft((d) => ({ ...d, plate_style: null }))}
                  >
                    Auto
                  </button>
                  {PLATE_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      className={`bide-style${draft.plate_style === style ? ' bide-style--on' : ''}`}
                      disabled={style === 'cover' && coverDisabled}
                      title={style === 'cover' && coverDisabled ? 'Upload a cover image first' : undefined}
                      onClick={() => setDraft((d) => ({ ...d, plate_style: style }))}
                    >
                      {STYLE_LABELS[style]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cn-field">
                <span className="cn-label">House color</span>
                <div className="bide-swatches">
                  <button
                    type="button"
                    className={`bide-swatch bide-swatch--auto${draft.brand_color == null ? ' bide-swatch--on' : ''}`}
                    onClick={() => pickColor(null)}
                    aria-label="Automatic house color"
                  >
                    Auto
                  </button>
                  {SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className={`bide-swatch${draft.brand_color === hex ? ' bide-swatch--on' : ''}`}
                      style={{ background: hex }}
                      onClick={() => pickColor(hex)}
                      aria-label={`House color ${hex}`}
                    />
                  ))}
                  <input
                    className="cn-input bide-hex"
                    value={hexInput}
                    onChange={(e) => onHexChange(e.target.value.trim())}
                    placeholder="#1A1815"
                    aria-label="Custom hex color"
                  />
                </div>
              </div>

              <div className="cn-row">
                <div className="cn-field">
                  <span className="cn-label">Client logo</span>
                  <input
                    ref={logoRef} type="file" accept=".png,.svg" hidden
                    onChange={(e) => { upload('logo', e.target.files?.[0]); e.target.value = ''; }}
                  />
                  <div className="bide-file">
                    <button type="button" className="bide-upload" disabled={uploading === 'logo'} onClick={() => logoRef.current?.click()}>
                      <Upload size={13} /> {uploading === 'logo' ? 'Uploading…' : draft.logo_path ? 'Replace' : 'Upload PNG / SVG'}
                    </button>
                    {draft.logo_path && (
                      <button type="button" className="bide-remove" onClick={() => setDraft((d) => ({ ...d, logo_path: null }))}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="cn-field">
                  <span className="cn-label">Cover image</span>
                  <input
                    ref={coverRef} type="file" accept=".jpg,.jpeg,.png,.webp" hidden
                    onChange={(e) => { upload('cover', e.target.files?.[0]); e.target.value = ''; }}
                  />
                  <div className="bide-file">
                    <button type="button" className="bide-upload" disabled={uploading === 'cover'} onClick={() => coverRef.current?.click()}>
                      <Upload size={13} /> {uploading === 'cover' ? 'Uploading…' : draft.cover_image_path ? 'Replace' : 'Upload image'}
                    </button>
                    {draft.cover_image_path && (
                      <button
                        type="button"
                        className="bide-remove"
                        onClick={() => setDraft((d) => ({
                          ...d,
                          cover_image_path: null,
                          plate_style: d.plate_style === 'cover' ? null : d.plate_style,
                        }))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="cn-actions">
              <AgencyButton variant="secondary" onClick={onClose}>Cancel</AgencyButton>
              <AgencyButton
                disabled={save.isPending || uploading != null}
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                Save identity
              </AgencyButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
