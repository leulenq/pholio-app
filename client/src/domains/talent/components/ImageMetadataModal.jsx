import React, { useState } from 'react';
import { X, Save, EyeOff, Crop } from 'lucide-react';
import { toast } from 'sonner';
import { talentApi } from '../api/talent';
import './ImageMetadataModal.css';

const COMP_CARD_ROLES = [
  { id: 'headshot',  label: 'Headshot',  color: '#C9A55A' },
  { id: 'full_body', label: 'Full Body', color: '#2563EB' },
  { id: 'editorial', label: 'Editorial', color: '#7C3AED' },
  { id: 'lifestyle', label: 'Lifestyle', color: '#059669' },
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

export default function ImageMetadataModal({ image, onClose, onUpdate, onOpenEditor, mediaSets = [] }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    metadata: {
      role: image.metadata?.role || null,
      tags: image.metadata?.tags || [],
      credits: image.metadata?.credits || { photographer: '', mua: '', stylist: '' },
      caption: image.metadata?.caption || '',
      visibility: image.metadata?.visibility || 'public'
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
    setFormData(prev => ({
      ...prev,
      metadata: { 
        ...prev.metadata, 
        credits: { ...prev.metadata.credits, [field]: value } 
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        
        {/* Left: Image Preview */}
        <div className="modal-preview-col">
           <img 
            src={getImageUrl(image.path)} 
            alt="Preview" 
            className="modal-preview-image"
           />
           {formData.metadata.visibility === 'private' && (
             <div className="private-badge">
               <EyeOff size={12} /> PRIVATE
             </div>
           )}
           
           <button 
             onClick={() => onOpenEditor(image)}
             className="absolute bottom-4 left-4 right-4 py-2 bg-white/90 backdrop-blur text-slate-900 text-sm font-medium rounded-lg shadow-sm hover:bg-white transition-colors flex items-center justify-center gap-2"
           >
             <Crop size={14} />
             Crop & Rotate
           </button>
        </div>

        {/* Right: Metadata Form */}
        <div className="modal-form-col">
          <div className="modal-header">
            <h2 className="modal-title">Image Details</h2>
            <button onClick={onClose} className="close-button">
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            
            {/* Visibility Toggle */}
            <div className="form-section-header">
              <div>
                <h3 className="section-label">Visibility</h3>
                <p className="section-helper">Control where this image appears</p>
              </div>
              <div className="toggle-group">
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, metadata: { ...prev.metadata, visibility: 'public' } }))}
                  className={`toggle-option ${formData.metadata.visibility === 'public' ? 'active' : ''}`}
                >
                  Public
                </button>
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, metadata: { ...prev.metadata, visibility: 'private' } }))}
                  className={`toggle-option ${formData.metadata.visibility === 'private' ? 'active-private' : ''}`}
                >
                  Private
                </button>
              </div>
            </div>

            {/* Structured catalog fields */}
            <div>
              <label className="section-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Catalog</label>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                Structured fields used across portfolio, comp card readiness, and agency views.
              </p>
              <div className="structured-fields-grid">
                <div>
                  <label className="form-label">Image type</label>
                  <select
                    className="form-input"
                    value={formData.image_type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, image_type: e.target.value }))}
                  >
                    {IMAGE_TYPE_OPTIONS.map((o) => (
                      <option key={`it-${o.value || 'unset'}`} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Shot type</label>
                  <select
                    className="form-input"
                    value={formData.shot_type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, shot_type: e.target.value }))}
                  >
                    {SHOT_TYPE_OPTIONS.map((o) => (
                      <option key={`st-${o.value || 'unset'}`} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Style</label>
                  <select
                    className="form-input"
                    value={formData.style_type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, style_type: e.target.value }))}
                  >
                    {STYLE_TYPE_OPTIONS.map((o) => (
                      <option key={`sty-${o.value || 'unset'}`} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Status</label>
                  <select
                    className="form-input"
                    value={formData.status}
                    onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="structured-fields-grid__full">
                  <label className="form-label">Image set</label>
                  <select
                    className="form-input"
                    value={formData.set_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, set_id: e.target.value }))}
                  >
                    <option value="">No set</option>
                    {mediaSets.map((setRow) => (
                      <option key={setRow.id} value={setRow.id}>
                        {setRow.name || setRow.kind}
                        {setRow.name ? ` (${setRow.kind})` : ''}
                        {setRow.is_current ? ' - current' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="structured-fields-grid__full">
                  <label className="form-label">Captured</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.captured_at}
                    onChange={(e) => setFormData((prev) => ({ ...prev, captured_at: e.target.value }))}
                  />
                </div>
                <div className="structured-fields-grid__full">
                  <label className="form-label">Retouched</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.retouched_at}
                    onChange={(e) => setFormData((prev) => ({ ...prev, retouched_at: e.target.value }))}
                  />
                </div>
              </div>

              <div className="structured-toggle-row">
                <div className="structured-toggle-row__label">
                  <span className="form-label" style={{ marginBottom: 0 }}>Exclude from public</span>
                  <p className="section-helper" style={{ marginTop: '0.125rem' }}>Hide from portfolio / public surfaces</p>
                </div>
                <div className="toggle-group">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, exclude_from_public: false }))}
                    className={`toggle-option ${!formData.exclude_from_public ? 'active' : ''}`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, exclude_from_public: true }))}
                    className={`toggle-option ${formData.exclude_from_public ? 'active-private' : ''}`}
                  >
                    Yes
                  </button>
                </div>
              </div>
              <div className="structured-toggle-row">
                <div className="structured-toggle-row__label">
                  <span className="form-label" style={{ marginBottom: 0 }}>Exclude from agency</span>
                  <p className="section-helper" style={{ marginTop: '0.125rem' }}>Hide from agency-facing views</p>
                </div>
                <div className="toggle-group">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, exclude_from_agency: false }))}
                    className={`toggle-option ${!formData.exclude_from_agency ? 'active' : ''}`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, exclude_from_agency: true }))}
                    className={`toggle-option ${formData.exclude_from_agency ? 'active-private' : ''}`}
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>

            {/* Comp Card Role */}
            <div>
              <label className="section-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Comp Card Role</label>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.625rem' }}>
                Tag this photo so it appears in the right slot on your comp card.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {COMP_CARD_ROLES.map(r => {
                  const isActive = formData.metadata.role === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        metadata: { ...prev.metadata, role: isActive ? null : r.id }
                      }))}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        border: `1.5px solid ${isActive ? r.color : '#e5e7eb'}`,
                        background: isActive ? r.color : 'transparent',
                        color: isActive ? '#fff' : '#374151',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        transition: 'all 0.15s',
                      }}
                    >
                      {r.label}
                    </button>
                  );
                })}
                {formData.metadata.role && (
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      metadata: { ...prev.metadata, role: null }
                    }))}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '20px',
                      border: '1.5px solid #e5e7eb',
                      background: 'transparent',
                      color: '#9ca3af',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="section-label" style={{ display: 'block', marginBottom: '0.75rem' }}>Categories</label>
              <div className="tags-container">
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`tag-btn ${formData.metadata.tags.includes(tag) ? 'selected' : ''}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Credits */}
            <div>
              <label className="section-label" style={{ display: 'block', marginBottom: '1rem' }}>Credits</label>
              
              <div className="form-grid">
                <div className="full-width">
                   <label className="form-label">Photographer</label>
                   <input 
                     type="text" 
                     className="form-input"
                     placeholder="@photographer"
                     value={formData.metadata.credits.photographer}
                     onChange={(e) => updateCredit('photographer', e.target.value)}
                   />
                </div>
                <div>
                   <label className="form-label">Makeup Artist</label>
                   <input 
                     type="text" 
                     className="form-input"
                     placeholder="@mua"
                     value={formData.metadata.credits.mua}
                     onChange={(e) => updateCredit('mua', e.target.value)}
                   />
                </div>
                <div>
                   <label className="form-label">Stylist</label>
                   <input 
                     type="text" 
                     className="form-input"
                     placeholder="@stylist"
                     value={formData.metadata.credits.stylist}
                     onChange={(e) => updateCredit('stylist', e.target.value)}
                   />
                </div>
              </div>
            </div>

            {/* Caption */}
            <div>
              <label className="section-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Caption</label>
              <textarea 
                rows="3"
                className="form-textarea"
                placeholder="Add a description or context..."
                value={formData.metadata.caption}
                onChange={(e) => setFormData(prev => ({ ...prev, metadata: { ...prev.metadata, caption: e.target.value } }))}
              />
            </div>

          </div>

          <div className="modal-footer">
            <button 
              onClick={onClose}
              className="btn-cancel"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={loading}
              className="btn-save"
            >
              {loading ? 'Saving...' : (
                <>
                  <Save size={16} />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
