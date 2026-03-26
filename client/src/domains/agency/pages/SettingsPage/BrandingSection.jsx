import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image as ImageIcon, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { updateAgencyBranding } from '../../api/agency';
import { AgencyButton } from '../../components/ui/AgencyButton';

export default function BrandingSection({ profile }) {
  const [logoPreview, setLogoPreview] = useState(profile?.agency_logo_path ? `/${profile.agency_logo_path}` : null);
  const [brandColor, setBrandColor] = useState(profile?.agency_brand_color || '#C9A55A');
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: updateAgencyBranding,
    onSuccess: (data) => {
      queryClient.invalidateQueries(['agency-profile']);
      toast.success('Branding updated');
      if (data.logo_path) setLogoPreview(`/${data.logo_path}`);
    }
  });

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const formData = new FormData();
      formData.append('agency_logo', file);
      updateMutation.mutate(formData);
    }
  };

  const handleColorSave = () => {
    const formData = new FormData();
    formData.append('agency_brand_color', brandColor);
    updateMutation.mutate(formData);
  };

  return (
    <div className="st-card">
      <div className="st-card-form">
        <div className="st-field">
          <label>Agency Logo</label>
          <div className="st-logo-grid">
            <div className="st-logo-preview">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" />
              ) : (
                <ImageIcon size={32} strokeWidth={1} />
              )}
            </div>
            <div className="st-logo-actions">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleLogoUpload} 
                className="hidden" 
                accept="image/*"
              />
              <AgencyButton 
                variant="secondary" 
                icon={Upload} 
                onClick={() => fileInputRef.current?.click()}
                disabled={updateMutation.isPending}
              >
                Upload New
              </AgencyButton>
              {logoPreview && (
                <AgencyButton 
                  variant="ghost" 
                  icon={X} 
                  onClick={() => {
                    const fd = new FormData();
                    fd.append('remove_logo', 'true');
                    updateMutation.mutate(fd);
                    setLogoPreview(null);
                  }}
                >
                  Remove
                </AgencyButton>
              )}
            </div>
          </div>
          <span className="st-help">SVG or High-res PNG. Min 400x400px recommended.</span>
        </div>

        <div className="st-divider" />

        <div className="st-field">
          <label>Primary Brand Color</label>
          <div className="st-color-row">
            <div className="st-color-input-wrap" style={{ borderColor: brandColor }}>
              <input 
                type="color" 
                value={brandColor} 
                onChange={(e) => setBrandColor(e.target.value)} 
                className="st-color-input"
              />
            </div>
            <div className="st-color-info">
              <code className="st-color-hex">{brandColor.toUpperCase()}</code>
              <AgencyButton 
                variant="ghost" 
                size="sm" 
                onClick={handleColorSave}
                disabled={updateMutation.isPending}
              >
                Apply
              </AgencyButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
