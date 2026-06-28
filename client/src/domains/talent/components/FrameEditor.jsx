import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import {
  Calendar, Camera, Crop, EyeOff, Image as ImageIcon,
  RotateCcw, RotateCw, Save, ScanLine, Shield, Tags, X, ZoomIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { talentApi } from '../api/talent';
import { classificationFormDefaults } from '../../../shared/utils/imageClassification';
import {
  shotPickerOptions,
  imageTypePickerOptions,
  stylePickerOptions,
  expressionPickerOptions,
} from '../../../shared/constants/frameTaxonomy';
import { getCroppedImgBlob } from '../../../shared/utils/canvasUtils';
import PholioButton from '../../../shared/components/ui/PholioButton';
import './FrameEditor.css';

const ASPECTS = [
  { val: 2 / 3, label: 'Portrait', meta: '2:3' },
  { val: 4 / 5, label: 'Editorial', meta: '4:5' },
  { val: 1, label: 'Square', meta: '1:1' },
  { val: 16 / 9, label: 'Wide', meta: '16:9' },
];

// Status — operational state (affects comp card eligibility)
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const RIGHTS_STATUS_OPTIONS = [
  { value: '', label: 'Unset' },
  { value: 'pending', label: 'Pending review' },
  { value: 'cleared', label: 'Cleared for distribution' },
  { value: 'licensed', label: 'Licensed' },
  { value: 'owned', label: 'Owned' },
  { value: 'approved', label: 'Approved' },
  { value: 'restricted', label: 'Restricted' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'denied', label: 'Denied' },
];

const LICENSE_TYPE_OPTIONS = [
  { value: '', label: 'Unset' },
  { value: 'owned', label: 'Owned by talent' },
  { value: 'licensed', label: 'Licensed use' },
  { value: 'model_release', label: 'Model release on file' },
  { value: 'agency_permission', label: 'Agency permission' },
  { value: 'editorial_release', label: 'Editorial release' },
];

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

/** License expiry read — drives the "expires in N days / expired" indicator. */
function expiryState(expiresAtIso, now = new Date()) {
  if (!expiresAtIso) return null;
  const d = new Date(expiresAtIso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { label: `Rights expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`, expired: true };
  if (days === 0) return { label: 'Rights expire today', expired: false };
  return { label: `Rights expire in ${days} day${days === 1 ? '' : 's'}`, expired: false };
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

function toText(value) {
  if (value == null) return '';
  return String(value);
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
  const [rights, setRights] = useState({
    license_type: '',
    rights_status: '',
    copyright_owner: '',
    photographer_name: '',
    usage_scope: '',
    territory: '',
    start_at: '',
    expires_at: '',
    exclusive: false,
  });
  const [rightsLoaded, setRightsLoaded] = useState(false);
  const [rightsLoading, setRightsLoading] = useState(true);
  const [rightsError, setRightsError] = useState('');
  const [releaseOnFile, setReleaseOnFile] = useState(false);
  // Model-release artifact (P1 #6) — a real release record attached to the frame.
  const [release, setRelease] = useState({
    release_url: '',
    signer_name: '',
    signed_at: '',
  });
  const [releaseLoaded, setReleaseLoaded] = useState(false);
  const [releaseDirty, setReleaseDirty] = useState(false);
  const initialMeta = readMetadata(image.metadata);
  const initialCredits = initialMeta.credits || {};
  const classDefaults = classificationFormDefaults(image);
  const [form, setForm] = useState({
    metadata: {
      credits: {
        photographer: initialCredits.photographer || '',
        mua: initialCredits.mua || '',
        hair_stylist: initialCredits.hair_stylist || '',
        stylist: initialCredits.stylist || '',
        publication: initialCredits.publication || '',
        issue: initialCredits.issue || '',
        credit: initialCredits.credit || '',
      },
      description: initialMeta.description || initialMeta.caption || '',
      visibility: initialMeta.visibility || 'public',
    },
    image_type: classDefaults.image_type,
    shot_type: classDefaults.shot_type,
    style_type: classDefaults.style_type,
    expression: classDefaults.expression,
    status: image.status != null ? image.status : 'active',
    exclude_from_public: !!image.exclude_from_public,
    exclude_from_agency: !!image.exclude_from_agency,
    captured_at: isoToDateInput(image.captured_at),
    retouched_at: isoToDateInput(image.retouched_at),
    set_id: image.set_id ?? '',
  });

  const imageSrc = getImageUrl(image.public_url || image.path);

  React.useEffect(() => {
    let active = true;
    setRightsLoading(true);
    setRightsLoaded(false);
    setRightsError('');
    talentApi.getImageRights(image.id)
      .then((res) => {
        if (!active) return;
        const row = res?.rights || {};
        setRights({
          license_type: toText(row.license_type),
          rights_status: toText(row.rights_status),
          copyright_owner: toText(row.copyright_owner),
          photographer_name: toText(row.photographer_name),
          usage_scope: toText(row.usage_scope),
          territory: toText(row.territory),
          start_at: isoToDateInput(row.start_at),
          expires_at: isoToDateInput(row.expires_at),
          exclusive: !!row.exclusive,
        });
        if (res?.release_on_file) setReleaseOnFile(true);
        setRightsLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setRightsError('Rights metadata is unavailable right now.');
      })
      .finally(() => {
        if (!active) return;
        setRightsLoading(false);
      });

    talentApi.getModelRelease(image.id)
      .then((res) => {
        if (!active) return;
        const row = res?.release || {};
        setRelease({
          release_url: toText(row.release_url || row.release_ref),
          signer_name: toText(row.signer_name),
          signed_at: isoToDateInput(row.signed_at),
        });
        if (row.on_file) setReleaseOnFile(true);
        setReleaseLoaded(true);
      })
      .catch(() => { /* release is best-effort; rights UI still works */ });

    return () => {
      active = false;
    };
  }, [image.id]);

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
  const setReleaseField = (field, value) => {
    setReleaseDirty(true);
    setRelease((p) => ({ ...p, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalizedRightsStatus = rights.rights_status.trim().toLowerCase();
      const hasLicenseType = rights.license_type.trim().length > 0;
      const hasCredit = rights.copyright_owner.trim().length > 0
        || rights.photographer_name.trim().length > 0;
      if (normalizedRightsStatus === 'cleared' && (!hasLicenseType || !hasCredit)) {
        toast.error(
          "Set a license type and either copyright owner or photographer before marking rights as cleared.",
        );
        return;
      }

      const isDigitalUse = String(form.image_type || '').toLowerCase() === 'digital';
      const payload = {
        image_type: form.image_type || null,
        shot_type: form.shot_type || null,
        style_type: form.style_type || null,
        status: form.status || 'active',
        exclude_from_public: form.exclude_from_public,
        exclude_from_agency: form.exclude_from_agency,
        captured_at: dateInputToPayload(form.captured_at),
        // Digitals must stay raw — never persist a retouch date on a digital.
        retouched_at: isDigitalUse ? null : dateInputToPayload(form.retouched_at),
        set_id: form.set_id || null,
        metadata: {
          ...form.metadata,
          // Preserve legacy caption key for read compat
          caption: form.metadata.description || '',
          // Preserve existing AI signal data; mark classification as user-confirmed
          ai: {
            ...(initialMeta.ai || {}),
            signals: (() => {
              const next = { ...(initialMeta.ai?.signals || {}) };
              if (form.expression) next.expression = form.expression;
              else delete next.expression;
              return next;
            })(),
            classification: {
              ...(initialMeta.ai?.classification || {}),
              source: 'user',
              confirmed: true,
            },
          },
        },
      };
      const res = await talentApi.updateMedia(image.id, payload);
      if (res.success) {
        if (rightsLoaded) {
          await talentApi.updateImageRights(image.id, {
            license_type: rights.license_type || null,
            rights_status: rights.rights_status || null,
            copyright_owner: rights.copyright_owner || null,
            photographer_name: rights.photographer_name || null,
            usage_scope: rights.usage_scope || null,
            territory: rights.territory || null,
            start_at: dateInputToPayload(rights.start_at),
            expires_at: dateInputToPayload(rights.expires_at),
            exclusive: !!rights.exclusive,
          });
        }
        if (releaseLoaded && releaseDirty) {
          const releaseRes = await talentApi.updateModelRelease(image.id, {
            release_url: release.release_url || null,
            signer_name: release.signer_name || null,
            signed_at: dateInputToPayload(release.signed_at),
          });
          if (releaseRes?.release?.on_file != null) setReleaseOnFile(!!releaseRes.release.on_file);
          setReleaseDirty(false);
        }
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

  const isDigitalUse = String(form.image_type || '').toLowerCase() === 'digital';
  const isTearsheet = String(form.image_type || '').toLowerCase() === 'tearsheet';
  const expiry = expiryState(dateInputToPayload(rights.expires_at));
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
                  alt={initialMeta.description || initialMeta.caption || 'Portfolio frame'}
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

                  <PholioButton type="button" variant="inverse" size="sm" system="dashboard" className="fe-reset-btn" onClick={resetCrop}>
                    <ScanLine size={14} aria-hidden="true" />
                    Reset composition
                  </PholioButton>
                </>
              ) : (
                <>
                  {/* Publishing */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <Shield size={14} aria-hidden="true" />
                      <h3>Publishing</h3>
                    </div>
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

                  {/* Rights */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <Shield size={14} aria-hidden="true" />
                      <h3>Rights</h3>
                    </div>
                    {rightsError ? (
                      <p className="fe-rights-error">{rightsError}</p>
                    ) : (
                      <p className="fe-rights-note">
                        Required for comp card export and agency distribution.
                      </p>
                    )}
                    <div className="fe-grid">
                      <label>
                        <span className="fe-label">License type</span>
                        <select
                          className="fe-input"
                          value={rights.license_type}
                          disabled={rightsLoading}
                          onChange={(e) =>
                            setRights((p) => ({ ...p, license_type: e.target.value }))}
                        >
                          {LICENSE_TYPE_OPTIONS.map((option) => (
                            <option key={`license-${option.value || 'empty'}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="fe-label">Rights status</span>
                        <select
                          className="fe-input"
                          value={rights.rights_status}
                          disabled={rightsLoading}
                          onChange={(e) =>
                            setRights((p) => ({ ...p, rights_status: e.target.value }))}
                        >
                          {RIGHTS_STATUS_OPTIONS.map((option) => (
                            <option key={`status-${option.value || 'empty'}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="fe-label">Copyright owner</span>
                        <input
                          type="text"
                          className="fe-input"
                          placeholder="Name or entity"
                          value={rights.copyright_owner}
                          disabled={rightsLoading}
                          onChange={(e) =>
                            setRights((p) => ({ ...p, copyright_owner: e.target.value }))}
                        />
                      </label>
                      <label>
                        <span className="fe-label">Photographer</span>
                        <input
                          type="text"
                          className="fe-input"
                          placeholder="Photographer name"
                          value={rights.photographer_name}
                          disabled={rightsLoading}
                          onChange={(e) =>
                            setRights((p) => ({ ...p, photographer_name: e.target.value }))}
                        />
                      </label>
                      <label>
                        <span className="fe-label">Usage scope</span>
                        <input
                          type="text"
                          className="fe-input"
                          placeholder="e.g. editorial, advertising, web"
                          value={rights.usage_scope}
                          disabled={rightsLoading}
                          onChange={(e) =>
                            setRights((p) => ({ ...p, usage_scope: e.target.value }))}
                        />
                      </label>
                      <label>
                        <span className="fe-label">Territory</span>
                        <input
                          type="text"
                          className="fe-input"
                          placeholder="e.g. worldwide, US, EU"
                          value={rights.territory}
                          disabled={rightsLoading}
                          onChange={(e) =>
                            setRights((p) => ({ ...p, territory: e.target.value }))}
                        />
                      </label>
                      <label>
                        <span className="fe-label"><Calendar size={12} aria-hidden="true" />License start</span>
                        <input
                          type="date"
                          className="fe-input"
                          value={rights.start_at}
                          disabled={rightsLoading}
                          onChange={(e) => setRights((p) => ({ ...p, start_at: e.target.value }))}
                        />
                      </label>
                      <label>
                        <span className="fe-label"><Calendar size={12} aria-hidden="true" />License expiry</span>
                        <input
                          type="date"
                          className="fe-input"
                          value={rights.expires_at}
                          disabled={rightsLoading}
                          onChange={(e) => setRights((p) => ({ ...p, expires_at: e.target.value }))}
                        />
                      </label>
                      <label className="fe-grid__wide fe-switch">
                        <input
                          type="checkbox"
                          checked={rights.exclusive}
                          disabled={rightsLoading}
                          onChange={(e) => setRights((p) => ({ ...p, exclusive: e.target.checked }))}
                        />
                        <span>Exclusive license</span>
                      </label>
                    </div>
                    {expiry ? (
                      <p className={`fe-rights-expiry${expiry.expired ? ' fe-rights-expiry--expired' : ''}`}>
                        {expiry.label}
                        {expiry.expired ? ' — expired-rights frames are blocked from packages and export.' : ''}
                      </p>
                    ) : null}

                    {/* Model release */}
                    <div className="fe-release">
                      <div className="fe-release__head">
                        <span className="fe-label">Model release</span>
                        <span className={`fe-release__state${releaseOnFile ? ' fe-release__state--on' : ''}`}>
                          {releaseOnFile ? 'On file' : 'Not on file'}
                        </span>
                      </div>
                      <div className="fe-grid">
                        <label className="fe-grid__wide">
                          <span className="fe-label">Release reference / URL</span>
                          <input
                            type="text"
                            className="fe-input"
                            placeholder="Link or document reference"
                            value={release.release_url}
                            disabled={rightsLoading}
                            onChange={(e) => setReleaseField('release_url', e.target.value)}
                          />
                        </label>
                        <label>
                          <span className="fe-label">Signer</span>
                          <input
                            type="text"
                            className="fe-input"
                            placeholder="Signer name"
                            value={release.signer_name}
                            disabled={rightsLoading}
                            onChange={(e) => setReleaseField('signer_name', e.target.value)}
                          />
                        </label>
                        <label>
                          <span className="fe-label"><Calendar size={12} aria-hidden="true" />Signed</span>
                          <input
                            type="date"
                            className="fe-input"
                            value={release.signed_at}
                            disabled={rightsLoading}
                            onChange={(e) => setReleaseField('signed_at', e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Frame read */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <ImageIcon size={14} aria-hidden="true" />
                      <h3>Frame read</h3>
                    </div>
                    <div className="fe-grid">
                      <label>
                        <span className="fe-label">Framing</span>
                        <select className="fe-input" value={form.shot_type}
                          onChange={(e) => setForm((p) => ({ ...p, shot_type: e.target.value }))}>
                          {/* Show legacy profile_left/profile_right only if current image has that value */}
                          {shotPickerOptions(form.shot_type).map((o) => (
                            <option key={`st-${o.value || 'ns'}`} value={o.value} title={o.hint || undefined}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="fe-label">Register</span>
                        <select className="fe-input" value={form.style_type}
                          onChange={(e) => setForm((p) => ({ ...p, style_type: e.target.value }))}>
                          {stylePickerOptions().map((o) => (
                            <option key={`sty-${o.value || 'ns'}`} value={o.value} title={o.hint || undefined}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="fe-label">Use</span>
                        <select className="fe-input" value={form.image_type}
                          onChange={(e) => setForm((p) => ({ ...p, image_type: e.target.value }))}>
                          {imageTypePickerOptions(form.image_type).map((o) => (
                            <option key={`it-${o.value || 'ns'}`} value={o.value} title={o.hint || undefined}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="fe-label">Expression</span>
                        <select className="fe-input" value={form.expression}
                          onChange={(e) => setForm((p) => ({ ...p, expression: e.target.value }))}>
                          {expressionPickerOptions().map((o) => (
                            <option key={`ex-${o.value || 'ns'}`} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="fe-label">Library state</span>
                        <select className="fe-input" value={form.status}
                          onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                          {/* Show legacy retired/test values only if current image has them */}
                          {[
                            ...STATUS_OPTIONS,
                            ...(form.status === 'retired' ? [{ value: 'retired', label: 'Archived (legacy)' }] : []),
                            ...(form.status === 'test' ? [{ value: 'test', label: 'Test (legacy)' }] : []),
                          ].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>

                  {/* Shoot info */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <Camera size={14} aria-hidden="true" />
                      <h3>Shoot info</h3>
                    </div>
                    <div className="fe-grid">
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
                      {isDigitalUse ? (
                        <p className="fe-grid__wide fe-note-warn">
                          Digitals must stay raw — retouching is disabled on this frame. Replacing it with a
                          retouched version turns it into book work, not a digital.
                        </p>
                      ) : (
                        <label>
                          <span className="fe-label"><Calendar size={12} aria-hidden="true" />Retouched</span>
                          <input type="date" className="fe-input" value={form.retouched_at}
                            onChange={(e) => setForm((p) => ({ ...p, retouched_at: e.target.value }))} />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Credits */}
                  <div className="fe-section">
                    <div className="fe-section__head">
                      <Camera size={14} aria-hidden="true" />
                      <h3>Credits</h3>
                    </div>
                    <div className="fe-grid">
                      {isTearsheet ? (
                        <>
                          <label>
                            <span className="fe-label">Publication</span>
                            <input type="text" className="fe-input" placeholder="Vogue, Elle…"
                              value={form.metadata.credits.publication}
                              onChange={(e) => setCredit('publication', e.target.value)} />
                          </label>
                          <label>
                            <span className="fe-label">Issue</span>
                            <input type="text" className="fe-input" placeholder="March 2026"
                              value={form.metadata.credits.issue}
                              onChange={(e) => setCredit('issue', e.target.value)} />
                          </label>
                          <label className="fe-grid__wide">
                            <span className="fe-label">Credit line</span>
                            <input type="text" className="fe-input" placeholder="Story / editorial credit"
                              value={form.metadata.credits.credit}
                              onChange={(e) => setCredit('credit', e.target.value)} />
                          </label>
                        </>
                      ) : null}
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
                        <span className="fe-label">Hair stylist</span>
                        <input type="text" className="fe-input" placeholder="@hair"
                          value={form.metadata.credits.hair_stylist}
                          onChange={(e) => setCredit('hair_stylist', e.target.value)} />
                      </label>
                      <label className="fe-grid__wide">
                        <span className="fe-label">Stylist</span>
                        <input type="text" className="fe-input" placeholder="@stylist"
                          value={form.metadata.credits.stylist}
                          onChange={(e) => setCredit('stylist', e.target.value)} />
                      </label>
                      <label className="fe-grid__wide">
                        <span className="fe-label">Description</span>
                        <textarea rows={3} className="fe-input fe-textarea"
                          placeholder="Add context, publication, or shoot notes"
                          value={form.metadata.description}
                          onChange={(e) => setMeta({ description: e.target.value })} />
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
          <PholioButton type="button" variant="inverse" system="dashboard" onClick={onClose}>Cancel</PholioButton>
          {image.has_original && onRestore && (
            <PholioButton
              type="button" variant="inverse-ghost" size="sm" system="dashboard" className="fe-restore"
              onClick={handleRestore}
              disabled={isRestoring || isProcessing || saving}
              title="Remove all edits and restore the original uploaded file"
            >
              {isRestoring
                ? <><span className="fe-spin" aria-hidden="true" />Restoring…</>
                : 'Restore original'}
            </PholioButton>
          )}
          {mode === 'crop' ? (
            <PholioButton type="button" variant="primary" system="dashboard" onClick={handleApplyCrop} disabled={isProcessing || isRestoring}>
              {isProcessing
                ? <><span className="fe-spin" aria-hidden="true" />Processing…</>
                : <><Crop size={15} aria-hidden="true" />Apply crop</>}
            </PholioButton>
          ) : (
            <PholioButton type="button" variant="primary" system="dashboard" onClick={handleSave} disabled={saving || isRestoring}>
              {saving
                ? <><span className="fe-spin" aria-hidden="true" />Saving…</>
                : <><Save size={15} aria-hidden="true" />Save frame</>}
            </PholioButton>
          )}
        </footer>

      </section>
    </div>,
    document.body
  );
}
