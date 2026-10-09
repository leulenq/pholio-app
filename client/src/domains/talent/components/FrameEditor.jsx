import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Cropper from 'react-easy-crop';
import { Crop, Film, RotateCcw, X } from 'lucide-react';
import { pholioToast } from '../../../shared/lib/pholio-toast';
import { talentApi } from '../api/talent';
import { classificationFormDefaults } from '../../../shared/utils/imageClassification';
import { getCroppedImgBlob } from '../../../shared/utils/canvasUtils';
import FrameSheet from './FrameSheet';
import {
  dateInputToPayload,
  EMPTY_RELEASE,
  EMPTY_RIGHTS,
  isoToDateInput,
  readMetadata,
  releaseFromRow,
  rightsFromRow,
} from './frameEditorModel';
import './FrameEditor.css';

/* ── Crop geometry ──────────────────────────────────────────────────────── */

const ASPECTS = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '2:3', label: '2:3', ratio: 2 / 3 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
];

const MAX_ZOOM = 4;
const INITIAL_CROP = { crop: { x: 0, y: 0 }, zoom: 1, quarter: 0, straighten: 0, aspectId: 'original' };

/**
 * Smallest zoom at which the crop rectangle sits entirely inside the
 * straightened photo, so a tilt never bakes black corners into the file.
 * react-easy-crop fits the crop to the rotated bounding box at zoom 1.
 */
function coverZoom(size, quarter, straighten, ratio) {
  if (!size || !straighten) return 1;
  const swap = quarter % 2 === 1;
  const iw = swap ? size.height : size.width;
  const ih = swap ? size.width : size.height;
  const rad = (Math.abs(straighten) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const bw = iw * c + ih * s;
  const bh = iw * s + ih * c;
  const a = ratio || iw / ih;
  const cw = bw / bh > a ? bh * a : bw;
  const ch = bw / bh > a ? bh : bw / a;
  return Math.max(1, (cw * c + ch * s) / iw, (cw * s + ch * c) / ih);
}

function getImageUrl(value) {
  if (!value) return '';
  if (value.startsWith('http')) return value;
  return value.startsWith('/') ? value : `/uploads/${value}`;
}

/* ── Straighten ruler: a tick scale with a gold needle ──────────────────── */

function StraightenRuler({ value, onChange }) {
  const shown = Math.round(value * 2) / 2;
  return (
    <div className="fe-ruler">
      <span className="fe-ruler__value" aria-hidden="true">
        {shown > 0 ? '+' : shown < 0 ? '−' : ''}{Math.abs(shown)}°
      </span>
      <div className="fe-ruler__track">
        <div className="fe-ruler__ticks" aria-hidden="true" />
        <input
          type="range"
          className="fe-ruler__input"
          min={-45}
          max={45}
          step={0.5}
          value={value}
          aria-label="Straighten"
          aria-valuetext={`${shown} degrees`}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => onChange(0)}
        />
      </div>
    </div>
  );
}

/* ── Editor ─────────────────────────────────────────────────────────────── */

export default function FrameEditor({
  image,
  initialMode = 'details',
  mediaSets = [],
  onClose,
  onUpdate,
  onReplace,
  onRestore,
}) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const isVideo = String(image.asset_kind || '').toLowerCase() === 'video';
  const imageSrc = isVideo ? '' : getImageUrl(image.public_url || image.path);
  const initialMeta = useMemo(() => readMetadata(image.metadata), [image.metadata]);

  /* Crop — staged locally; nothing touches the file until Save. */
  const [tool, setTool] = useState(initialMode === 'crop' && !isVideo ? 'crop' : 'view');
  const [geom, setGeom] = useState(INITIAL_CROP);
  const [mediaSize, setMediaSize] = useState(null);
  const [areaPixels, setAreaPixels] = useState(null);
  const [pending, setPending] = useState(null); // { blob, url, geom }
  const [rendering, setRendering] = useState(false);
  const geomOnEnter = useRef(INITIAL_CROP);

  /* Details */
  const buildForm = useCallback(() => {
    const credits = initialMeta.credits || {};
    const cls = classificationFormDefaults(image);
    return {
      image_type: cls.image_type,
      shot_type: cls.shot_type,
      style_type: cls.style_type,
      expression: cls.expression,
      status: image.status != null ? image.status : 'active',
      exclude_from_public: !!image.exclude_from_public,
      exclude_from_agency: !!image.exclude_from_agency,
      captured_at: isoToDateInput(image.captured_at),
      retouched_at: isoToDateInput(image.retouched_at),
      set_id: image.set_id ?? '',
      description: initialMeta.description || initialMeta.caption || '',
      credits: {
        photographer: credits.photographer || '',
        mua: credits.mua || '',
        hair_stylist: credits.hair_stylist || '',
        stylist: credits.stylist || '',
        publication: credits.publication || '',
        issue: credits.issue || '',
        credit: credits.credit || '',
      },
    };
  }, [image, initialMeta]);

  const [form, setForm] = useState(buildForm);
  const [baseForm, setBaseForm] = useState(form);
  const [rights, setRights] = useState(EMPTY_RIGHTS);
  const [baseRights, setBaseRights] = useState(EMPTY_RIGHTS);
  const [release, setRelease] = useState(EMPTY_RELEASE);
  const [baseRelease, setBaseRelease] = useState(EMPTY_RELEASE);
  const [rightsState, setRightsState] = useState('loading'); // loading | ready | error
  const [releaseReady, setReleaseReady] = useState(false);
  const [releaseOnFile, setReleaseOnFile] = useState(false);
  const [rightsOpen, setRightsOpen] = useState(false);
  const [problem, setProblem] = useState('');

  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'discard' | 'restore'

  useEffect(() => {
    let active = true;
    talentApi.getImageRights(image.id)
      .then((res) => {
        if (!active) return;
        const next = rightsFromRow(res?.rights);
        setRights(next);
        setBaseRights(next);
        if (res?.release_on_file) setReleaseOnFile(true);
        // One photographer field: fall back to the rights record when the credit is blank.
        if (next.photographer_name) {
          const fill = (p) => (p.credits.photographer ? p : { ...p, credits: { ...p.credits, photographer: next.photographer_name } });
          setForm(fill);
          setBaseForm(fill);
        }
        setRightsState('ready');
      })
      .catch(() => { if (active) setRightsState('error'); });

    talentApi.getModelRelease(image.id)
      .then((res) => {
        if (!active) return;
        const next = releaseFromRow(res?.release);
        setRelease(next);
        setBaseRelease(next);
        if (res?.release?.on_file) setReleaseOnFile(true);
        setReleaseReady(true);
      })
      .catch(() => { /* release is best-effort; the rest of the sheet still works */ });

    return () => { active = false; };
  }, [image.id]);

  useEffect(() => () => { if (pending?.url) URL.revokeObjectURL(pending.url); }, [pending]);

  const detailsDirty = JSON.stringify(form) !== JSON.stringify(baseForm);
  const rightsDirty = rightsState === 'ready' && (
    JSON.stringify(rights) !== JSON.stringify(baseRights)
    || form.credits.photographer !== baseForm.credits.photographer
  );
  const releaseDirty = releaseReady && JSON.stringify(release) !== JSON.stringify(baseRelease);
  const dirty = detailsDirty || rightsDirty || releaseDirty || !!pending;
  const busy = saving || restoring || rendering;

  /* ── Crop tool ── */

  const aspect = ASPECTS.find((a) => a.id === geom.aspectId) || ASPECTS[0];
  const ratio = aspect.ratio
    || (mediaSize ? (geom.quarter % 2 ? mediaSize.height / mediaSize.width : mediaSize.width / mediaSize.height) : 2 / 3);
  const minZoom = coverZoom(mediaSize, geom.quarter, geom.straighten, ratio);
  const rotation = geom.quarter * 90 + geom.straighten;
  const geomChanged = JSON.stringify({ ...geom, crop: null }) !== JSON.stringify({ ...INITIAL_CROP, crop: null })
    || Math.abs(geom.crop.x) > 0.5 || Math.abs(geom.crop.y) > 0.5;

  const patchGeom = (patch) => setGeom((g) => {
    const next = { ...g, ...patch };
    const nextRatio = (ASPECTS.find((a) => a.id === next.aspectId) || ASPECTS[0]).ratio
      || (mediaSize ? (next.quarter % 2 ? mediaSize.height / mediaSize.width : mediaSize.width / mediaSize.height) : ratio);
    const floor = coverZoom(mediaSize, next.quarter, next.straighten, nextRatio);
    return next.zoom < floor ? { ...next, zoom: floor } : next;
  });

  const openCrop = () => {
    geomOnEnter.current = geom;
    setTool('crop');
  };

  const cancelCrop = () => {
    setGeom(geomOnEnter.current);
    setTool('view');
  };

  /** Renders the crop. Returns the staged crop, null when the frame is untouched, false on failure. */
  const finishCrop = async () => {
    if (!geomChanged) {
      setPending(null);
      setTool('view');
      return null;
    }
    if (!areaPixels) return false;
    setRendering(true);
    try {
      const blob = await getCroppedImgBlob(imageSrc, areaPixels, rotation);
      const staged = { blob, url: URL.createObjectURL(blob) };
      setPending(staged);
      setTool('view');
      return staged;
    } catch {
      pholioToast.error('This photo could not be cropped. Try again, or restore the original first.');
      return false;
    } finally {
      setRendering(false);
    }
  };

  const undoCrop = () => {
    setPending(null);
    setGeom(INITIAL_CROP);
  };

  /* ── Save ── */

  const validate = () => {
    if (rightsState === 'ready' && rights.rights_status === 'cleared') {
      const hasCredit = rights.copyright_owner.trim() || form.credits.photographer.trim();
      if (!rights.license_type || !hasCredit) {
        return 'Cleared needs a license type and a copyright owner or photographer.';
      }
    }
    const releaseStarted = Object.values(release).some(Boolean);
    if ((rights.license_type === 'model_release' || releaseStarted)
      && (!release.release_url || !release.signer_name || !release.signer_role || !release.signed_at)) {
      return 'Add the release reference, signer, signer role and signed date, or clear them.';
    }
    return '';
  };

  const save = async () => {
    if (busy) return;
    let staged = pending;
    if (tool === 'crop') {
      staged = await finishCrop();
      if (staged === false) return;
    }
    const issue = validate();
    setProblem(issue);
    if (issue) { setRightsOpen(true); return; }
    if (!(detailsDirty || rightsDirty || releaseDirty || staged)) { onClose(); return; }

    setSaving(true);
    try {
      const isDigital = String(form.image_type || '').toLowerCase() === 'digital';

      // A crop doesn't change what the photo is. Confirming the read with it
      // stops the replace from clearing the classification and dropping the
      // photo out of its slot (e.g. the Digitals headshot).
      if (detailsDirty || staged) {
        const signals = { ...(initialMeta.ai?.signals || {}) };
        if (form.expression) signals.expression = form.expression;
        else delete signals.expression;
        // Classification columns go only when changed: an untouched legacy
        // value must not fail validation. The metadata lock below is what
        // keeps the read through a replace.
        const changedRead = Object.fromEntries(
          ['image_type', 'shot_type', 'style_type']
            .filter((k) => form[k] !== baseForm[k])
            .map((k) => [k, form[k] || null]),
        );
        const payload = {
          ...changedRead,
          status: form.status || 'active',
          exclude_from_public: form.exclude_from_public,
          exclude_from_agency: form.exclude_from_agency,
          captured_at: dateInputToPayload(form.captured_at),
          // Digitals stay raw: never persist a retouch date on a digital.
          retouched_at: isDigital ? null : dateInputToPayload(form.retouched_at),
          set_id: form.set_id || null,
          metadata: {
            credits: form.credits,
            description: form.description,
            caption: form.description, // legacy read key
            // The audience columns are enforced; this mirror is display-only.
            visibility: form.exclude_from_public ? 'private' : 'public',
            ai: {
              ...(initialMeta.ai || {}),
              signals,
              // band 'confirmed' takes the frame out of Frame reads; without it a
              // look- or section-only edit left the read queued as a suggestion.
              classification: { ...(initialMeta.ai?.classification || {}), source: 'user', confirmed: true, band: 'confirmed' },
            },
          },
        };
        const res = await talentApi.updateMedia(image.id, payload);
        const next = res?.image;
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
        } : payload);
        setBaseForm(form);
      }

      if (rightsDirty) {
        await talentApi.updateImageRights(image.id, {
          license_type: rights.license_type || null,
          rights_status: rights.rights_status || null,
          copyright_owner: rights.copyright_owner || null,
          photographer_name: form.credits.photographer || null,
          usage_scope: rights.usage_scope || null,
          territory: rights.territory || null,
          start_at: dateInputToPayload(rights.start_at),
          expires_at: dateInputToPayload(rights.expires_at),
          exclusive: !!rights.exclusive,
        });
        setBaseRights({ ...rights, photographer_name: form.credits.photographer });
        await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      }

      if (releaseDirty) {
        const res = await talentApi.updateModelRelease(image.id, {
          release_url: release.release_url || null,
          signer_name: release.signer_name || null,
          signer_role: release.signer_role || null,
          signed_at: dateInputToPayload(release.signed_at),
        });
        if (res?.release?.on_file != null) setReleaseOnFile(!!res.release.on_file);
        setBaseRelease(release);
      }

      // File last: replace keeps a user-confirmed classification, so the read
      // saved above survives the new pixels.
      if (staged) await onReplace(staged.blob);

      onClose();
    } catch (err) {
      pholioToast.error(err?.message || 'Changes were not saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    setRestoring(true);
    try {
      await onRestore(image.id);
      onClose();
    } catch (err) {
      pholioToast.error(err?.message || 'The original was not restored. Try again.');
      setRestoring(false);
      setConfirm(null);
    }
  };

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirm('discard');
    else onClose();
  };

  /* Keyboard: Esc steps back one layer; Cmd/Ctrl+S or Cmd/Ctrl+Enter saves. */
  const keyRef = useRef(null);
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (confirm) setConfirm(null);
      else if (tool === 'crop') cancelCrop();
      else requestClose();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
      e.preventDefault();
      save();
    }
  };
  useEffect(() => { keyRef.current = onKeyDown; });
  useEffect(() => {
    const onKey = (e) => keyRef.current?.(e);
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  /* ── Render ── */

  const spring = reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 30 };
  const shown = pending?.url || imageSrc;
  const alt = form.description || 'Portfolio frame';

  return createPortal(
    <motion.div
      className="fe"
      role="dialog"
      aria-modal="true"
      aria-label="Edit photo"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Stage */}
      <div className={`fe-stage${tool === 'crop' ? ' is-cropping' : ''}`}>
        <button type="button" className="fe-close" onClick={tool === 'crop' ? cancelCrop : requestClose} aria-label={tool === 'crop' ? 'Cancel crop' : 'Close'}>
          <X size={20} aria-hidden="true" />
        </button>

        <div className="fe-canvas">
          {isVideo ? (
            <div className="fe-motion">
              <Film size={36} aria-hidden="true" />
              <span>{image.label || 'Motion asset'}</span>
              {image.video_url ? (
                <a href={image.video_url} target="_blank" rel="noreferrer noopener">Open video</a>
              ) : null}
            </div>
          ) : tool === 'crop' ? (
            <Cropper
              image={imageSrc}
              crop={geom.crop}
              zoom={geom.zoom}
              rotation={rotation}
              aspect={ratio}
              minZoom={minZoom}
              maxZoom={MAX_ZOOM}
              objectFit="contain"
              onMediaLoaded={(m) => setMediaSize({ width: m.naturalWidth, height: m.naturalHeight })}
              onCropChange={(crop) => setGeom((g) => ({ ...g, crop }))}
              onZoomChange={(zoom) => setGeom((g) => ({ ...g, zoom }))}
              onCropComplete={(_, px) => setAreaPixels(px)}
              classes={{ containerClassName: 'fe-cropper', cropAreaClassName: 'fe-cropper__area' }}
            />
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.img
                key={shown}
                src={shown}
                alt={alt}
                className="fe-photo"
                draggable={false}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={spring}
              />
            </AnimatePresence>
          )}
        </div>

        {!isVideo && (
          <AnimatePresence mode="wait" initial={false}>
            {tool === 'crop' ? (
              <motion.div
                key="crop"
                className="fe-tools fe-tools--crop"
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={spring}
              >
                <StraightenRuler value={geom.straighten} onChange={(straighten) => patchGeom({ straighten })} />
                <div className="fe-tools__row">
                  <div className="fe-ratios" role="radiogroup" aria-label="Aspect ratio">
                    {ASPECTS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        role="radio"
                        aria-checked={geom.aspectId === a.id}
                        className={`fe-ratio${geom.aspectId === a.id ? ' is-on' : ''}`}
                        onClick={() => patchGeom({ aspectId: a.id, crop: { x: 0, y: 0 } })}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <div className="fe-tools__actions">
                    <button
                      type="button"
                      className="fe-iconbtn"
                      onClick={() => patchGeom({ quarter: (geom.quarter + 3) % 4, crop: { x: 0, y: 0 } })}
                      aria-label="Rotate left 90 degrees"
                      title="Rotate left"
                    >
                      <RotateCcw size={17} aria-hidden="true" />
                    </button>
                    <button type="button" className="fe-textbtn" onClick={() => setGeom(INITIAL_CROP)} disabled={!geomChanged}>
                      Reset
                    </button>
                    <button type="button" className="fe-textbtn fe-textbtn--strong" onClick={finishCrop} disabled={rendering}>
                      {rendering ? 'Cropping…' : 'Done'}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="view"
                className="fe-tools"
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={spring}
              >
                <div className="fe-tools__row fe-tools__row--center">
                  <button type="button" className="fe-pillbtn" onClick={openCrop} disabled={busy}>
                    <Crop size={15} aria-hidden="true" />
                    {pending ? 'Adjust crop' : 'Crop and straighten'}
                  </button>
                  {pending ? (
                    <button type="button" className="fe-textbtn" onClick={undoCrop} disabled={busy}>Undo crop</button>
                  ) : image.has_original && onRestore ? (
                    <button type="button" className="fe-textbtn" onClick={() => setConfirm('restore')} disabled={busy}>
                      Restore original
                    </button>
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Sheet */}
      <aside className="fe-side" aria-label="Photo details">
        <FrameSheet
          form={form}
          setForm={setForm}
          readSource={initialMeta.ai?.classification?.source}
          mediaSets={mediaSets}
          rights={rights}
          setRights={setRights}
          rightsState={rightsState}
          release={release}
          setRelease={setRelease}
          releaseOnFile={releaseOnFile}
          rightsOpen={rightsOpen}
          setRightsOpen={setRightsOpen}
          problem={problem}
          clearProblem={() => setProblem('')}
        />

        <footer className="fe-foot">
          <AnimatePresence mode="wait" initial={false}>
            {confirm ? (
              <motion.div
                key={confirm}
                className="fe-foot__row fe-foot__row--confirm"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                role="alertdialog"
                aria-label={confirm === 'discard' ? 'Discard changes' : 'Restore original'}
              >
                <p className="fe-foot__msg">
                  {confirm === 'discard'
                    ? 'Close without saving these changes?'
                    : 'Replace this photo with your original upload? Every crop made since is removed.'}
                </p>
                <div className="fe-foot__btns">
                  <button type="button" className="fe-btn fe-btn--quiet" onClick={() => setConfirm(null)} disabled={restoring}>
                    {confirm === 'discard' ? 'Keep editing' : 'Cancel'}
                  </button>
                  {confirm === 'discard' ? (
                    <button type="button" className="fe-btn fe-btn--danger" onClick={onClose}>Discard changes</button>
                  ) : (
                    <button type="button" className="fe-btn fe-btn--danger" onClick={restore} disabled={restoring}>
                      {restoring ? 'Restoring…' : 'Restore original'}
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="main"
                className="fe-foot__row"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
              >
                <p className="fe-foot__msg" aria-live="polite">
                  {tool === 'crop' ? 'Drag to move. Pinch or scroll to zoom.' : pending ? 'Crop not saved yet.' : ''}
                </p>
                <div className="fe-foot__btns">
                  <button type="button" className="fe-btn fe-btn--quiet" onClick={requestClose} disabled={busy}>Cancel</button>
                  <button type="button" className="fe-btn fe-btn--primary" onClick={save} disabled={busy}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </footer>
      </aside>
    </motion.div>,
    document.body,
  );
}
