import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, Calendar, Camera, Crop, EyeOff, Image as ImageIcon, Save, Shield, Tags, X } from 'lucide-react';
import { toast } from 'sonner';
import { talentApi } from '../api/talent';
import {
  shotPickerOptions,
  imageTypePickerOptions,
  stylePickerOptions,
  COMP_CARD_SLOT_LABELS,
} from '../../../shared/constants/frameTaxonomy';
import './ImageMetadataModal.css';

const COMP_CARD_ROLES = [
  { id: 'headshot', label: COMP_CARD_SLOT_LABELS.headshot },
  { id: 'full_body', label: COMP_CARD_SLOT_LABELS.full_length },
  { id: 'editorial', label: COMP_CARD_SLOT_LABELS.editorial },
  { id: 'lifestyle', label: COMP_CARD_SLOT_LABELS.lifestyle },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'retired', label: 'Retired' },
  { value: 'test', label: 'Test' },
];

function isoToDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateInputToPayload(value) {
  if (!value || !String(value).trim()) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function readMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try { return JSON.parse(metadata); } catch { return {}; }
}

export default function ImageMetadataModal({ image, onClose, onUpdate, onOpenEditor, mediaSets = [] }) {
  const [loading, setLoading] = useState(false);
  const initialMetadata = readMetadata(image.metadata);
  const initialCredits = initialMetadata.credits || {};
  const [formData, setFormData] = useState({
    metadata: {
      role: initialMetadata.role || null,
      tags: Array.isArray(initialMetadata.tags) ? initialMetadata.tags : [],
      credits: {
        photographer: (initialCredits.photographer || '').replace(/^@/, ''),
        mua: (initialCredits.mua || '').replace(/^@/, ''),
        stylist: (initialCredits.stylist || '').replace(/^@/, ''),
      },
      caption: initialMetadata.caption || '',
      visibility: initialMetadata.visibility || 'public'
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

  const availableTags = ['Editorial', 'Commercial', 'Runway', 'Swimwear', 'Beauty', 'Lifestyle', 'Digitals'];

  const toggleTag = (tag) => {
    const currentTags = formData.metadata.tags;
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    
    setFormData(prev => ({
      ...prev,
      metadata: { ...prev.metadata, tags: newTags }
    }));
  };

  const updateCredit = (field, value) => {
    const cleaned = value.replace(/^@/, '');
    setFormData(prev => ({
      ...prev,
      metadata: { 
        ...prev.metadata, 
        credits: { ...prev.metadata.credits, [field]: cleaned } 
      }
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const structuredPayload = {
        image_type: formData.image_type || null,
        shot_type: formData.shot_type || null,
        style_type: formData.style_type || null,
        status: formData.status || 'active',
        exclude_from_public: formData.exclude_from_public,
        exclude_from_agency: formData.exclude_from_agency,
        captured_at: dateInputToPayload(formData.captured_at),
        retouched_at: dateInputToPayload(formData.retouched_at),
        set_id: formData.set_id || null,
      };

      const response = await talentApi.updateMedia(image.id, {
        metadata: formData.metadata,
        ...structuredPayload,
      });

      if (response.success) {
        const next = response.image;
        if (next) {
          onUpdate(image.id, {
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
          });
        } else {
          onUpdate(image.id, {
            metadata: formData.metadata,
            ...structuredPayload,
          });
        }
        onClose();
      }
    } catch (error) {
      console.error('Failed to update image details', error);
      toast.error('Failed to save changes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return path.startsWith('/') ? path : `/uploads/${path}`;
  };

  const previewUrl = getImageUrl(image.public_url || image.path);
  const selectedRole = COMP_CARD_ROLES.find((role) => role.id === formData.metadata.role);
  const isPrivate = formData.metadata.visibility === 'private' || formData.exclude_from_public || formData.exclude_from_agency || formData.status === 'archived';

  return createPortal(
    <div className="imd-overlay" onClick={onClose}>
      <section className="imd-shell" aria-label="Edit image details" onClick={e => e.stopPropagation()}>
        <aside className="imd-preview" aria-label="Selected image preview">
          <div className="imd-preview__bar">
            <button type="button" onClick={onClose} className="imd-icon-btn" aria-label="Close details">
              <X size={18} />
            </button>
          </div>
          <div className="imd-image-stage">
            <img src={previewUrl} alt={formData.metadata.caption || 'Selected portfolio frame'} className="imd-preview-image" />
            <div className="imd-status-stack">
              {isPrivate && <span className="imd-pill imd-pill--ink"><EyeOff size={12} />Private</span>}
              {selectedRole && <span className="imd-pill imd-pill--gold">{selectedRole.label}</span>}
            </div>
          </div>
          <button type="button" onClick={() => onOpenEditor(image)} className="imd-crop-action">
            <Crop size={15} />
            Crop & rotate
          </button>
        </aside>

        <div className="imd-panel">
          <header className="imd-header">
            <div>
              <h2 className="imd-title">Image details</h2>
            </div>
            <span className="imd-frame-id">{image.id ? `ID ${image.id}` : 'Portfolio frame'}</span>
          </header>

          <div className="imd-body">
            <section className="imd-section">
              <div className="imd-section__head">
                <Shield size={15} />
                <h3>Publishing</h3>
              </div>
              <div className="imd-control-row">
                <span className="imd-control-label">Visibility</span>
                <div className="imd-segment" role="group" aria-label="Visibility">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, metadata: { ...prev.metadata, visibility: 'public' } }))}
                    className={formData.metadata.visibility === 'public' ? 'is-active' : ''}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, metadata: { ...prev.metadata, visibility: 'private' } }))}
                    className={formData.metadata.visibility === 'private' ? 'is-active is-private' : ''}
                  >
                    Private
                  </button>
                </div>
              </div>
              <div className="imd-switch-list">
                <label className="imd-switch">
                  <input
                    type="checkbox"
                    checked={formData.exclude_from_public}
                    onChange={(e) => setFormData((prev) => ({ ...prev, exclude_from_public: e.target.checked }))}
                  />
                  <span>Exclude from public</span>
                </label>
                <label className="imd-switch">
                  <input
                    type="checkbox"
                    checked={formData.exclude_from_agency}
                    onChange={(e) => setFormData((prev) => ({ ...prev, exclude_from_agency: e.target.checked }))}
                  />
                  <span>Exclude from agency</span>
                </label>
              </div>
            </section>

            <section className="imd-section">
              <div className="imd-section__head">
                <ImageIcon size={15} />
                <h3>Frame read</h3>
              </div>
              <div className="imd-grid">
                <label>
                  <span className="imd-label">Use</span>
                  <select className="imd-input" value={formData.image_type} onChange={(e) => setFormData((prev) => ({ ...prev, image_type: e.target.value }))}>
                    {imageTypePickerOptions(formData.image_type).map((o) => (
                      <option key={`it-${o.value || 'unset'}`} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="imd-label">Framing</span>
                  <select className="imd-input" value={formData.shot_type} onChange={(e) => setFormData((prev) => ({ ...prev, shot_type: e.target.value }))}>
                    {shotPickerOptions(formData.shot_type).map((o) => (
                      <option key={`st-${o.value || 'unset'}`} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="imd-label">Register</span>
                  <select className="imd-input" value={formData.style_type} onChange={(e) => setFormData((prev) => ({ ...prev, style_type: e.target.value }))}>
                    {stylePickerOptions().map((o) => (
                      <option key={`sty-${o.value || 'unset'}`} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="imd-label">Library state</span>
                  <select className="imd-input" value={formData.status} onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="imd-grid__wide">
                  <span className="imd-label">Image set</span>
                  <select className="imd-input" value={formData.set_id} onChange={(e) => setFormData((prev) => ({ ...prev, set_id: e.target.value }))}>
                    <option value="">No set</option>
                    {mediaSets.map((setRow) => (
                      <option key={setRow.id} value={setRow.id}>
                        {setRow.name || setRow.kind}
                        {setRow.name ? ` (${setRow.kind})` : ''}
                        {setRow.is_current ? ' - current' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="imd-label"><Calendar size={12} />Captured</span>
                  <input type="date" className="imd-input" value={formData.captured_at} onChange={(e) => setFormData((prev) => ({ ...prev, captured_at: e.target.value }))} />
                </label>
                <label>
                  <span className="imd-label"><Calendar size={12} />Retouched</span>
                  <input type="date" className="imd-input" value={formData.retouched_at} onChange={(e) => setFormData((prev) => ({ ...prev, retouched_at: e.target.value }))} />
                </label>
              </div>
            </section>

            <section className="imd-section">
              <div className="imd-section__head">
                <Camera size={15} />
                <h3>Comp card role</h3>
              </div>
              <div className="imd-chip-grid">
                {COMP_CARD_ROLES.map((role) => {
                  const isActive = formData.metadata.role === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, metadata: { ...prev.metadata, role: isActive ? null : role.id } }))}
                      className={`imd-role-chip ${isActive ? 'is-active' : ''}`}
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="imd-section">
              <div className="imd-section__head">
                <Tags size={15} />
                <h3>Categories</h3>
              </div>
              <div className="imd-tags">
                {availableTags.map(tag => (
                  <button key={tag} type="button" onClick={() => toggleTag(tag)} className={formData.metadata.tags.includes(tag) ? 'is-selected' : ''}>
                    {tag}
                  </button>
                ))}
              </div>
            </section>

            <section className="imd-section">
              <div className="imd-section__head">
                <Camera size={15} />
                <h3>Credits</h3>
              </div>
              <div className="imd-credits-grid">
                <label>
                  <span className="imd-label">Photographer</span>
                  <div className="imd-credit-input-wrap">
                    <span className="imd-credit-prefix">@</span>
                    <input
                      type="text"
                      className="imd-credit-input"
                      placeholder="photographer"
                      value={formData.metadata.credits.photographer}
                      onChange={(e) => updateCredit('photographer', e.target.value)}
                    />
                  </div>
                </label>
                <label>
                  <span className="imd-label">Makeup artist</span>
                  <div className="imd-credit-input-wrap">
                    <span className="imd-credit-prefix">@</span>
                    <input
                      type="text"
                      className="imd-credit-input"
                      placeholder="mua"
                      value={formData.metadata.credits.mua}
                      onChange={(e) => updateCredit('mua', e.target.value)}
                    />
                  </div>
                </label>
                <label>
                  <span className="imd-label">Stylist</span>
                  <div className="imd-credit-input-wrap">
                    <span className="imd-credit-prefix">@</span>
                    <input
                      type="text"
                      className="imd-credit-input"
                      placeholder="stylist"
                      value={formData.metadata.credits.stylist}
                      onChange={(e) => updateCredit('stylist', e.target.value)}
                    />
                  </div>
                </label>
              </div>
            </section>

            <section className="imd-section">
              <div className="imd-section__head">
                <AlignLeft size={15} />
                <h3>Caption & Story</h3>
              </div>
              <div className="imd-grid">
                <label className="imd-grid__wide">
                  <span className="imd-label">Caption</span>
                  <textarea rows="3" className="imd-input imd-textarea" placeholder="Add a description or context" value={formData.metadata.caption} onChange={(e) => setFormData(prev => ({ ...prev, metadata: { ...prev.metadata, caption: e.target.value } }))} />
                </label>
              </div>
            </section>
          </div>

          <footer className="imd-footer">
            <button type="button" onClick={onClose} className="imd-secondary-btn">Cancel</button>
            <button type="button" onClick={handleSave} disabled={loading} className="imd-primary-btn">
              {loading ? 'Saving...' : <><Save size={15} />Save changes</>}
            </button>
          </footer>
        </div>
      </section>
    </div>,
    document.body
  );
}
