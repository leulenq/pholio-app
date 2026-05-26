import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import {
  Calendar, Camera, Crop, EyeOff, Image as ImageIcon,
  RotateCcw, RotateCw, Save, ScanLine, Shield, Tags, X, ZoomIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { talentApi } from '../api/talent';
import { getCroppedImgBlob } from '../../../shared/utils/canvasUtils';
import './FrameEditor.css';

const ASPECTS = [
  { val: 2 / 3, label: 'Portrait', meta: '2:3' },
  { val: 4 / 5, label: 'Editorial', meta: '4:5' },
  { val: 1, label: 'Square', meta: '1:1' },
  { val: 16 / 9, label: 'Wide', meta: '16:9' },
];

const COMP_CARD_ROLES = [
  { id: 'headshot', label: 'Headshot' },
  { id: 'full_body', label: 'Full Body' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'lifestyle', label: 'Lifestyle' },
];

const IMAGE_TYPE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'digital', label: 'Digital' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'comp_card', label: 'Comp card' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'test', label: 'Test' },
];

const SHOT_TYPE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'headshot', label: 'Headshot' },
  { value: 'three_quarter', label: 'Three-quarter' },
  { value: 'full_length', label: 'Full length' },
  { value: 'profile_left', label: 'Profile (left)' },
  { value: 'profile_right', label: 'Profile (right)' },
  { value: 'back', label: 'Back' },
  { value: 'detail', label: 'Detail' },
];

const STYLE_TYPE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'swimwear', label: 'Swimwear' },
  { value: 'fitness', label: 'Fitness' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'retired', label: 'Retired' },
  { value: 'test', label: 'Test' },
];

const AVAILABLE_TAGS = ['Editorial', 'Commercial', 'Runway', 'Swimwear', 'Beauty', 'Lifestyle', 'Digitals'];

function isoToDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateInputToPayload(value) {
  if (!value || !String(value).trim()) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function readMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try { return JSON.parse(metadata); } catch { return {}; }
}

function getImageUrl(value) {
  if (!value) return '';
  if (value.startsWith('http')) return value;
  return value.startsWith('/') ? value : `/uploads/${value}`;
}

export default function FrameEditor({ image, initialMode = 'details', mediaSets = [], onClose, onUpdate, onReplace, onRestore }) {
  const [mode, setMode] = useState(initialMode);

  // Crop state
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(2 / 3);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Details state
  const [saving, setSaving] = useState(false);
  const initialMeta = readMetadata(image.metadata);
  const initialCredits = initialMeta.credits || {};
  const [form, setForm] = useState({
    metadata: {
      role: initialMeta.role || null,
      tags: Array.isArray(initialMeta.tags) ? initialMeta.tags : [],
      credits: {
        photographer: initialCredits.photographer || '',
        mua: initialCredits.mua || '',
        stylist: initialCredits.stylist || '',
      },
      caption: initialMeta.caption || '',
      visibility: initialMeta.visibility || 'public',
    },
    image_type: image.image_type ?? '',
    shot_type: image.shot_type ?? '',
    style_type: image.style_type ?? '',
    status: image.status != null ? image.status : 'active',
    exclude_from_public: !!image.exclude_from_public,
    exclude_from_agency: !!image.exclude_from_agency,
    captured_at: isoToDateInput(image.captured_at),
    retouched_at: isoToDateInput(image.retouched_at),
    set_id: image.set_id ?? '',
  });

  const imageSrc = getImageUrl(image.public_url || image.path);

  const onCropComplete = useCallback((_, pixels) => { setCroppedAreaPixels(pixels); }, []);

  const resetCrop = () => { setCrop({ x: 0, y: 0 }); setRotation(0); setZoom(1); };
  const rotateBy = (amt) => setRotation((r) => (r + amt + 360) % 360);

  const handleApplyCrop = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const blob = await getCroppedImgBlob(imageSrc, croppedAreaPixels, rotation);
      await Promise.resolve(onReplace(blob));
    } catch {
      toast.error('Could not crop image. Please try again.');
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try { await Promise.resolve(onRestore(image.id)); }
    catch { toast.error('Failed to restore original. Please try again.'); setIsRestoring(false); }
  };

  const setMeta = (patch) => setForm((p) => ({ ...p, metadata: { ...p.metadata, ...patch } }));
  const setCredit = (field, value) => setForm((p) => ({
    ...p, metadata: { ...p.metadata, credits: { ...p.metadata.credits, [field]: value } },
  }));
  const toggleTag = (tag) => setMeta({
    tags: form.metadata.tags.includes(tag)
      ? form.metadata.tags.filter((t) => t !== tag)
      : [...form.metadata.tags, tag],
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        image_type: form.image_type || null,
        shot_type: form.shot_type || null,
        style_type: form.style_type || null,
        status: form.status || 'active',
        exclude_from_public: form.exclude_from_public,
        exclude_from_agency: form.exclude_from_agency,
        captured_at: dateInputToPayload(form.captured_at),
        retouched_at: dateInputToPayload(form.retouched_at),
        set_id: form.set_id || null,
        metadata: form.metadata,
      };
      const res = await talentApi.updateMedia(image.id, payload);
      if (res.success) {
        const next = res.image;
        onUpdate(image.id, next ? {
          metadata: next.metadata,
          image_type: next.image_type,
          shot_type: next.shot_type,
          style_type: next.style_type,
          status: next.status,
          exclude_from_public: next.exclude_from_public,
          exclude_from_agency: next.exclude_from_agency,
          captured_at: next.captured_at,
          retouched_at: next.retouched_at,
          set_id: next.set_id,
        } : { ...payload });
        onClose();
      }
    } catch {
      toast.error('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const currentAspect = ASPECTS.find((a) => Math.abs(a.val - aspect) < 0.01);
  const isPrivate = (
    form.metadata.visibility === 'private'
    || form.exclude_from_public
    || form.exclude_from_agency
    || form.status === 'archived'
  );
  const frameLabel = image.id ? `#${String(image.id).slice(-6).toUpperCase()}` : 'Frame';

  return createPortal(
    <div className="fe-overlay" onClick={onClose}>
      <section className="fe-shell" aria-label="Edit frame" onClick={(e) => e.stopPropagation()}>

        {/* ── Head ── */}
        <header className="fe-head">
          <div className="fe-head__left">
            <span className="fe-kicker">Frame editor</span>
            <nav className="fe-tabs" role="tablist">
              <button
                type="button" role="tab"
                className={`fe-tab ${mode === 'crop' ? 'is-active' : ''}`}
                aria-selected={mode === 'crop'}
                onClick={() => setMode('crop')}
              >
                <Crop size={13} aria-hidden="true" />
                Crop & adjust
              </button>
              <button
                type="button" role="tab"
                className={`fe-tab ${mode === 'details' ? 'is-active' : ''}`}
                aria-selected={mode === 'details'}
                onClick={() => setMode('details')}
              >
                <Tags size={13} aria-hidden="true" />
                Details
              </button>
            </nav>
          </div>
          <div className="fe-head__right">
            <span className="fe-head__id">{frameLabel}</span>
            <button type="button" className="fe-icon-btn" onClick={onClose} aria-label="Close editor">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* ── Body ── */}
        <div className="fe-body">

          {/* Left: image stage */}
          <div className="fe-stage">
            {mode === 'crop' ? (
              <>
                <div className="fe-stage__crop">
                  <Cropper
                    image={imageSrc}
                    crop={crop}
                    rotation={rotation}
                    zoom={zoom}
                    aspect={aspect}
                    onCropChange={setCrop}
                    onRotationChange={setRotation}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                    objectFit="contain"
                  />
                </div>
                <div className="fe-stage__status" aria-live="polite">
                  {currentAspect?.label ?? 'Custom'} · {zoom.toFixed(1)}× · {rotation}°
                </div>
              </>
            ) : (
              <div className="fe-stage__preview">
                <img
                  src={imageSrc}
                  alt={initialMeta.caption || 'Portfolio frame'}
                />
                {isPrivate && (
                  <span className="fe-stage__badge">
                    <EyeOff size={11} aria-hidden="true" />
                    Private
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right: controls panel */}
          <div className="fe-panel" role="tabpanel">
            <div className="fe-panel__body">

              {mode === 'crop' ? (
                <>
                  {/* Aspect ratio */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <Crop size={14} aria-hidden="true" />
                      <h3>Aspect ratio</h3>
                    </div>
                    <div className="fe-aspect-grid">
                      {ASPECTS.map((opt) => (
                        <button
                          key={opt.label} type="button"
                          className={`fe-aspect-btn ${Math.abs(aspect - opt.val) < 0.01 ? 'is-active' : ''}`}
                          onClick={() => setAspect(opt.val)}
                        >
                          <span className="fe-aspect-icon" style={{ aspectRatio: String(opt.val) }} aria-hidden="true" />
                          <span className="fe-aspect-label">{opt.label}</span>
                          <span className="fe-aspect-meta">{opt.meta}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Zoom */}
                  <div className="fe-section">
                    <div className="fe-slider-head">
                      <label htmlFor="fe-zoom">
                        <ZoomIn size={14} aria-hidden="true" />
                        Zoom
                      </label>
                      <span className="fe-slider-val">{zoom.toFixed(1)}×</span>
                    </div>
                    <input
                      id="fe-zoom" type="range"
                      value={zoom} min={1} max={3} step={0.05}
                      aria-label="Zoom level"
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="fe-range"
                    />
                  </div>

                  {/* Rotation */}
                  <div className="fe-section">
                    <div className="fe-slider-head">
                      <label htmlFor="fe-rotation">
                        <RotateCw size={14} aria-hidden="true" />
                        Rotation
                      </label>
                      <span className="fe-slider-val">{rotation}°</span>
                    </div>
                    <input
                      id="fe-rotation" type="range"
                      value={rotation} min={0} max={360} step={1}
                      aria-label="Rotation angle"
                      onChange={(e) => setRotation(Number(e.target.value))}
                      className="fe-range"
                    />
                    <div className="fe-nudge-row">
                      <button type="button" onClick={() => rotateBy(-90)}>
                        <RotateCcw size={13} aria-hidden="true" /><span>−90°</span>
                      </button>
                      <button type="button" onClick={() => rotateBy(90)}>
                        <RotateCw size={13} aria-hidden="true" /><span>+90°</span>
                      </button>
                    </div>
                  </div>

                  <button type="button" className="fe-reset-btn" onClick={resetCrop}>
                    <ScanLine size={14} aria-hidden="true" />
                    Reset composition
                  </button>
                </>
              ) : (
                <>
                  {/* Publishing */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <Shield size={14} aria-hidden="true" />
                      <h3>Publishing</h3>
                    </div>
                    <div className="fe-control-row">
                      <span className="fe-control-label">Visibility</span>
                      <div className="fe-segment" role="group" aria-label="Visibility">
                        <button
                          type="button"
                          className={form.metadata.visibility === 'public' ? 'is-active' : ''}
                          onClick={() => setMeta({ visibility: 'public' })}
                        >Public</button>
                        <button
                          type="button"
                          className={form.metadata.visibility === 'private' ? 'is-active is-private' : ''}
                          onClick={() => setMeta({ visibility: 'private' })}
                        >Private</button>
                      </div>
                    </div>
                    <div className="fe-switch-list">
                      <label className="fe-switch">
                        <input type="checkbox" checked={form.exclude_from_public}
                          onChange={(e) => setForm((p) => ({ ...p, exclude_from_public: e.target.checked }))} />
                        <span>Exclude from public</span>
                      </label>
                      <label className="fe-switch">
                        <input type="checkbox" checked={form.exclude_from_agency}
                          onChange={(e) => setForm((p) => ({ ...p, exclude_from_agency: e.target.checked }))} />
                        <span>Exclude from agency</span>
                      </label>
                    </div>
                  </div>

                  {/* Catalog */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <ImageIcon size={14} aria-hidden="true" />
                      <h3>Catalog</h3>
                    </div>
                    <div className="fe-grid">
                      <label>
                        <span className="fe-label">Image type</span>
                        <select className="fe-input" value={form.image_type}
                          onChange={(e) => setForm((p) => ({ ...p, image_type: e.target.value }))}>
                          {IMAGE_TYPE_OPTIONS.map((o) => <option key={`it-${o.value || 'ns'}`} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="fe-label">Shot type</span>
                        <select className="fe-input" value={form.shot_type}
                          onChange={(e) => setForm((p) => ({ ...p, shot_type: e.target.value }))}>
                          {SHOT_TYPE_OPTIONS.map((o) => <option key={`st-${o.value || 'ns'}`} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="fe-label">Style</span>
                        <select className="fe-input" value={form.style_type}
                          onChange={(e) => setForm((p) => ({ ...p, style_type: e.target.value }))}>
                          {STYLE_TYPE_OPTIONS.map((o) => <option key={`sty-${o.value || 'ns'}`} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="fe-label">Status</span>
                        <select className="fe-input" value={form.status}
                          onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      <label className="fe-grid__wide">
                        <span className="fe-label">Image set</span>
                        <select className="fe-input" value={form.set_id}
                          onChange={(e) => setForm((p) => ({ ...p, set_id: e.target.value }))}>
                          <option value="">No set</option>
                          {mediaSets.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name || s.kind}{s.name ? ` (${s.kind})` : ''}{s.is_current ? ' – current' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="fe-label"><Calendar size={12} aria-hidden="true" />Captured</span>
                        <input type="date" className="fe-input" value={form.captured_at}
                          onChange={(e) => setForm((p) => ({ ...p, captured_at: e.target.value }))} />
                      </label>
                      <label>
                        <span className="fe-label"><Calendar size={12} aria-hidden="true" />Retouched</span>
                        <input type="date" className="fe-input" value={form.retouched_at}
                          onChange={(e) => setForm((p) => ({ ...p, retouched_at: e.target.value }))} />
                      </label>
                    </div>
                  </div>

                  {/* Comp card role */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <Camera size={14} aria-hidden="true" />
                      <h3>Comp card role</h3>
                    </div>
                    <div className="fe-role-grid">
                      {COMP_CARD_ROLES.map((role) => {
                        const active = form.metadata.role === role.id;
                        return (
                          <button key={role.id} type="button"
                            className={`fe-role-chip ${active ? 'is-active' : ''}`}
                            onClick={() => setMeta({ role: active ? null : role.id })}>
                            {role.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Categories */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <Tags size={14} aria-hidden="true" />
                      <h3>Categories</h3>
                    </div>
                    <div className="fe-tag-cloud">
                      {AVAILABLE_TAGS.map((tag) => (
                        <button key={tag} type="button"
                          className={`fe-tag ${form.metadata.tags.includes(tag) ? 'is-selected' : ''}`}
                          onClick={() => toggleTag(tag)}>
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Credits */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <Camera size={14} aria-hidden="true" />
                      <h3>Credits</h3>
                    </div>
                    <div className="fe-grid">
                      <label className="fe-grid__wide">
                        <span className="fe-label">Photographer</span>
                        <input type="text" className="fe-input" placeholder="@photographer"
                          value={form.metadata.credits.photographer}
                          onChange={(e) => setCredit('photographer', e.target.value)} />
                      </label>
                      <label>
                        <span className="fe-label">Makeup artist</span>
                        <input type="text" className="fe-input" placeholder="@mua"
                          value={form.metadata.credits.mua}
                          onChange={(e) => setCredit('mua', e.target.value)} />
                      </label>
                      <label>
                        <span className="fe-label">Stylist</span>
                        <input type="text" className="fe-input" placeholder="@stylist"
                          value={form.metadata.credits.stylist}
                          onChange={(e) => setCredit('stylist', e.target.value)} />
                      </label>
                      <label className="fe-grid__wide">
                        <span className="fe-label">Caption</span>
                        <textarea rows={3} className="fe-input fe-textarea"
                          placeholder="Add a description or context"
                          value={form.metadata.caption}
                          onChange={(e) => setMeta({ caption: e.target.value })} />
                      </label>
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="fe-foot">
          <button type="button" className="fe-cancel" onClick={onClose}>Cancel</button>
          {image.has_original && onRestore && (
            <button
              type="button" className="fe-restore"
              onClick={handleRestore}
              disabled={isRestoring || isProcessing || saving}
              title="Remove all edits and restore the original uploaded file"
            >
              {isRestoring
                ? <><span className="fe-spin" aria-hidden="true" />Restoring…</>
                : 'Restore original'}
            </button>
          )}
          {mode === 'crop' ? (
            <button type="button" className="fe-primary" onClick={handleApplyCrop} disabled={isProcessing || isRestoring}>
              {isProcessing
                ? <><span className="fe-spin" aria-hidden="true" />Processing…</>
                : <><Crop size={15} aria-hidden="true" />Apply crop</>}
            </button>
          ) : (
            <button type="button" className="fe-primary" onClick={handleSave} disabled={saving || isRestoring}>
              {saving
                ? <><span className="fe-spin" aria-hidden="true" />Saving…</>
                : <><Save size={15} aria-hidden="true" />Save details</>}
            </button>
          )}
        </footer>

      </section>
    </div>,
    document.body
  );
}
