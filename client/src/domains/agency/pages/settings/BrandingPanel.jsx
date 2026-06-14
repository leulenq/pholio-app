import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, X, Image as ImageIcon, Lock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { AgencyButton } from '../../components/ui/AgencyButton';
import { updateAgencyBranding } from '../../api/agency';
import {
  applyAgencyBrandTheme,
  DEFAULT_AGENCY_BRAND,
  isCustomBrandColor,
  resolveAgencyLogoUrl,
  validateAgencyLogoFile,
} from '../../lib/agency-branding';

export default function BrandingPanel({ profile, canManage }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [logo, setLogo] = useState(resolveAgencyLogoUrl(profile));
  const [color, setColor] = useState(profile?.agency_brand_color || DEFAULT_AGENCY_BRAND);
  const agencyName = profile?.agency_name || 'Your agency';
  const ro = !canManage;
  const hasCustomColor = isCustomBrandColor(profile?.agency_brand_color);
  const canResetColor = !ro && (hasCustomColor || isCustomBrandColor(color));

  const mutate = useMutation({
    mutationFn: (fd) => updateAgencyBranding(fd),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['agency-profile'] });
      if (data?.logo_path) {
        const next = data.logo_path.startsWith('http') ? data.logo_path : `/${data.logo_path.replace(/^\//, '')}`;
        setLogo(next);
      }
      applyAgencyBrandTheme(isCustomBrandColor(color) ? color : null);
      toast.success('Branding updated');
    },
    onError: (e) => toast.error(e?.message || 'Could not update branding'),
  });

  const onUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateAgencyLogoFile(file);
    if (err) {
      toast.error(err);
      e.target.value = '';
      return;
    }
    const fd = new FormData();
    fd.append('agency_logo', file);
    mutate.mutate(fd);
    e.target.value = '';
  };
  const onRemove = () => {
    const fd = new FormData();
    fd.append('remove_logo', 'true');
    setLogo(null);
    mutate.mutate(fd);
  };
  const onApplyColor = () => {
    applyAgencyBrandTheme(isCustomBrandColor(color) ? color : null);
    const fd = new FormData();
    fd.append('agency_brand_color', color);
    mutate.mutate(fd);
  };

  const onResetColor = () => {
    setColor(DEFAULT_AGENCY_BRAND);
    applyAgencyBrandTheme(null);
    if (!hasCustomColor) return;
    const fd = new FormData();
    fd.append('agency_brand_color', '');
    mutate.mutate(fd);
  };

  return (
    <>
      {ro && <div className="st-readonly"><Lock size={13} /> Read-only — ask an admin to change this.</div>}

      {/* Live identity preview */}
      <div className="st-brand-preview" style={{ '--brand': color }}>
        <span className="st-brand-chip">
          {logo ? <img src={logo} alt={agencyName} /> : <span className="st-brand-chip-ini">{(agencyName[0] || 'A').toUpperCase()}</span>}
        </span>
        <div className="st-brand-preview-id">
          <span className="st-brand-preview-name">{agencyName}</span>
          <span className="st-brand-preview-meta">Brand color <code>{color.toUpperCase()}</code></span>
        </div>
        <span className="st-brand-swatch" />
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Logo</h3>
          <p className="st-fieldset-sub">Replaces the agency name in the sidebar lockup. PNG or SVG (transparent), 400×400px+.</p>
        </div>
        <div className="st-logo-row">
          <div className="st-logo-frame">
            {logo ? <img src={logo} alt="Logo" /> : <ImageIcon size={30} strokeWidth={1.2} />}
          </div>
          {!ro && (
            <div className="st-logo-actions">
              <input type="file" ref={fileRef} onChange={onUpload} accept=".png,.svg,image/png,image/svg+xml" hidden />
              <AgencyButton variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()} disabled={mutate.isPending}>
                {logo ? 'Replace' : 'Upload'}
              </AgencyButton>
              {logo && <AgencyButton variant="ghost" icon={X} onClick={onRemove} disabled={mutate.isPending}>Remove</AgencyButton>}
            </div>
          )}
        </div>
      </div>

      <div className="st-fieldset">
        <div className="st-fieldset-head">
          <h3 className="st-fieldset-title">Brand color</h3>
          <p className="st-fieldset-sub">The accent used across your agency surfaces.</p>
        </div>
        <div className="st-color-row">
          <label className="st-color-well" style={{ borderColor: color }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={ro} />
            <span style={{ background: color }} />
          </label>
          <code className="st-color-hex">{color.toUpperCase()}</code>
          {!ro && (
            <div className="st-color-actions">
              <AgencyButton
                variant="ghost"
                size="sm"
                onClick={onApplyColor}
                disabled={mutate.isPending || color.toUpperCase() === (profile?.agency_brand_color || DEFAULT_AGENCY_BRAND).toUpperCase()}
              >
                Apply
              </AgencyButton>
              {canResetColor && (
                <AgencyButton
                  variant="ghost"
                  size="sm"
                  icon={RotateCcw}
                  onClick={onResetColor}
                  disabled={mutate.isPending}
                >
                  Reset
                </AgencyButton>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
