import React, { useState } from 'react';
import { X, Save, Eye, EyeOff, Crop } from 'lucide-react';
import { toast } from 'sonner';
import { talentApi } from '../../api/talent';
import './ImageMetadataModal.css';

const COMP_CARD_ROLES = [
  { id: 'headshot',  label: 'Headshot',  color: '#C9A55A' },
  { id: 'full_body', label: 'Full Body', color: '#2563EB' },
  { id: 'editorial', label: 'Editorial', color: '#7C3AED' },
  { id: 'lifestyle', label: 'Lifestyle', color: '#059669' },
];

export default function ImageMetadataModal({ image, onClose, onUpdate, onOpenEditor }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    metadata: {
      role: image.metadata?.role || null,
      tags: image.metadata?.tags || [],
      credits: image.metadata?.credits || { photographer: '', mua: '', stylist: '' },
      caption: image.metadata?.caption || '',
      visibility: image.metadata?.visibility || 'public'
    }
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
      const response = await talentApi.updateMedia(image.id, { metadata: formData.metadata });
      if (response.success) {
        onUpdate(image.id, formData.metadata);
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
