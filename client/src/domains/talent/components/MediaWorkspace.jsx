import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Plus, Star, Edit2, Crop, Trash2, EyeOff, Loader2, Upload, Film, ExternalLink, X, Download, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMedia } from '../hooks/useMedia';
import { useAuth } from '../../auth/hooks/useAuth';
import { TransferFailureNotice } from '../../../shared/components/states';
import { parseApiFailure } from '../../../shared/lib/api-error-message';
import { getClassificationState, formatTypeLabel } from '../../../shared/utils/imageClassification';
import { analyzePackageIntelligence } from '../../../shared/utils/packageIntelligence';
import FrameReadCaption from '../../../shared/components/frame/FrameReadCaption';
import { talentApi } from '../api/talent';
import FrameEditor from './FrameEditor';
import DigitalsBookPanel from './DigitalsBookPanel';
import ConfirmationDialog from '../../../shared/components/ui/ConfirmationDialog';
import PholioButton, {
  PholioIconButton,
} from '../../../shared/components/ui/PholioButton';
import { checkGatingStatus } from '../../../shared/utils/profileGating';
import CompCard from './CompCard';
import CompCardGate from './CompCardGate';
import './MediaWorkspace.css';
import './ClassificationReviewStrip.css';
import './DigitalsBookPanel.css';

const ARRIVE = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_FILES = 12;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

// Frames are grouped into clear, industry-true sections instead of one flat grid.
const SECTION_ORDER = ['digitals', 'book', 'tests', 'campaigns', 'tearsheets', 'motion'];
const SECTION_META = {
  digitals: {
    title: 'Digitals',
    blurb: 'Raw, dated agency reference — headshot, ¾, full-length, profile, back. Kept distinct from the book.',
  },
  book: {
    title: 'The Book',
    blurb: 'Your sequenced, styled portfolio. The opening frame is the cover.',
  },
  tests: { title: 'Tests', blurb: 'Test-shoot and TFP frames.' },
  campaigns: { title: 'Campaigns', blurb: 'Unpublished brand and advertising work.' },
  tearsheets: { title: 'Tearsheets', blurb: 'Published editorial and campaign pages, with credit.' },
  motion: { title: 'Motion', blurb: 'Showreel and video assets.' },
};

const DIGITALS_SLOT_LABELS = {
  headshot: 'Headshot',
  three_quarter: 'Three-quarter',
  full_length: 'Full length',
  profile: 'Profile',
  back: 'Back',
};

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function bucketFor(image) {
  if (normalizeToken(image?.asset_kind) === 'video') return 'motion';
  const t = normalizeToken(image?.image_type);
  if (t === 'digital') return 'digitals';
  if (t === 'test') return 'tests';
  if (t === 'campaign') return 'campaigns';
  if (t === 'tearsheet') return 'tearsheets';
  // portfolio, legacy editorial/runway/comp_card, and untyped frames fall to the book
  return 'book';
}

function getImageUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return `/uploads/${trimmed.replace(/^\/+/, '')}`;
}
function metadataFor(image) {
  if (!image?.metadata) return {};
  if (typeof image.metadata === 'object') return image.metadata;
  try { return JSON.parse(image.metadata); } catch { return {}; }
}
function isHiddenFromMarket(image) {
  const m = metadataFor(image);
  return (
    m.visibility === 'private' || image?.exclude_from_public ||
    image?.exclude_from_agency || image?.status === 'archived'
  );
}
function isVideoAsset(image) {
  return normalizeToken(image?.asset_kind) === 'video';
}
function formatDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
function normalizeMime(file) {
  const t = (file.type || '').toLowerCase().trim();
  return t === 'image/jpg' ? 'image/jpeg' : t;
}
function isAllowedFile(file) {
  if (ALLOWED_MIME.has(normalizeMime(file))) return true;
  return /\.(jpe?g|png|webp)$/.test((file.name || '').toLowerCase());
}
function partitionFiles(files) {
  const valid = [], invalid = [];
  files.forEach((file, index) => {
    if (index >= MAX_UPLOAD_FILES) invalid.push({ name: file.name || 'Unknown', reason: `Max ${MAX_UPLOAD_FILES} files at once` });
    else if (!isAllowedFile(file)) invalid.push({ name: file.name || 'Unknown', reason: 'Only JPEG, PNG, WebP' });
    else if (file.size > MAX_FILE_BYTES) invalid.push({ name: file.name || 'Unknown', reason: 'Max 25MB each' });
    else valid.push(file);
  });
  return { valid, invalid };
}
function showInvalidToasts(invalid) {
  if (invalid.length === 0) return;
  if (invalid.length === 1) { toast.error(`${invalid[0].name}: ${invalid[0].reason}`); return; }
  toast.error(`${invalid.length} files could not be uploaded`, {
    description: invalid.slice(0, 5).map((i) => `${i.name}: ${i.reason}`).join('\n'),
  });
}
function dateToInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateInputToIso(value) {
  if (!value || !String(value).trim()) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function markBroken(e) { e.currentTarget.classList.add('mw-frame__img--failed'); }

function MediaFrame({
  image, index, allowCover, onSetCover, onEdit, onCrop, onDelete, settingCoverId, classificationTimedOut,
  bulkMode, isSelected, onToggleSelect,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition, zIndex: isDragging ? 10 : 1,
  };
  const isCover = !!image.is_primary;
  const isPrivate = isHiddenFromMarket(image);
  const isVideo = isVideoAsset(image);
  const coverBusy = !!settingCoverId;
  const duration = isVideo ? formatDuration(image.video_duration_seconds) : null;
  const cls = [
    'mw-frame',
    isCover ? 'mw-frame--cover' : '',
    isDragging ? 'mw-frame--dragging' : '',
    isSelected ? 'mw-frame--selected' : '',
  ].filter(Boolean).join(' ');

  const dragProps = bulkMode ? {} : { ...attributes, ...listeners };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cls}
      aria-label={`Frame ${index + 1}`}
      onClick={(e) => {
        if (bulkMode) {
          e.stopPropagation();
          onToggleSelect(image.id);
        }
      }}
    >
      <div className="mw-frame__stage" {...dragProps}>
        {isVideo ? (
          <PholioButton
            type="button"
            variant="tertiary"
            tone="dark"
            className="mw-frame__motion"
            onClick={(e) => {
              e.stopPropagation();
              if (bulkMode) {
                onToggleSelect(image.id);
              } else {
                onEdit(image);
              }
            }}
            aria-label={image.label || 'Motion asset'}
          >
            <Film size={26} aria-hidden="true" />
            <span className="mw-frame__motion-label">{image.label || 'Motion asset'}</span>
            {duration ? <span className="mw-frame__motion-meta">{duration}</span> : null}
          </PholioButton>
        ) : (
          <img
            src={getImageUrl(image.public_url || image.path)}
            alt={metadataFor(image).caption || `Portfolio frame ${index + 1}`}
            className={`mw-frame__img ${isPrivate ? 'mw-frame__img--private' : ''}`}
            loading="lazy" decoding="async" draggable={false} onError={markBroken}
            onClick={(e) => {
              e.stopPropagation();
              if (bulkMode) {
                onToggleSelect(image.id);
              } else {
                onEdit(image);
              }
            }}
          />
        )}
        <span className="mw-frame__index">{String(index + 1).padStart(2, '0')}</span>
        {isCover ? (
          <span className="mw-frame__cover-mark" aria-label="Cover frame" title="Cover frame">
            <Star size={14} fill="currentColor" aria-hidden="true" />
          </span>
        ) : null}
        {isPrivate && !bulkMode ? (
          <span className="mw-frame__privacy-mark" aria-label="Private frame" title="Private frame">
            <EyeOff size={13} aria-hidden="true" />
          </span>
        ) : null}

        {bulkMode && (
          <span className="mw-frame__select-indicator" aria-label={isSelected ? 'Selected' : 'Unselected'}>
            {isSelected && <Check size={12} strokeWidth={3} aria-hidden="true" />}
          </span>
        )}

        {!bulkMode && (
          <div className="mw-frame__actions" aria-label="Frame actions">
            {allowCover && !isCover && !isVideo && (
              <PholioIconButton
                label="Make cover"
                tone="dark"
                className="mw-frame__action"
                title="Make cover"
                disabled={coverBusy}
                onClick={(e) => { e.stopPropagation(); onSetCover(image.id); }}
              >
                {settingCoverId === image.id ? <Loader2 size={14} className="mw-spin" aria-hidden="true" /> : <Star size={14} aria-hidden="true" />}
              </PholioIconButton>
            )}
            {isVideo && image.video_url ? (
              <PholioIconButton
                as="a"
                label="Open motion asset"
                tone="dark"
                className="mw-frame__action"
                title="Open motion asset"
                href={image.video_url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={14} aria-hidden="true" />
              </PholioIconButton>
            ) : null}
            <PholioIconButton
              label="Edit details"
              tone="dark"
              className="mw-frame__action"
              title="Edit details"
              onClick={(e) => { e.stopPropagation(); onEdit(image); }}
            >
              <Edit2 size={14} aria-hidden="true" />
            </PholioIconButton>
            {!isVideo && (
              <PholioIconButton
                label="Crop"
                tone="dark"
                className="mw-frame__action"
                title="Crop"
                onClick={(e) => { e.stopPropagation(); onCrop(image); }}
              >
                <Crop size={14} aria-hidden="true" />
              </PholioIconButton>
            )}
            <PholioIconButton
              label="Remove"
              danger
              tone="dark"
              className="mw-frame__action mw-frame__action--danger"
              title="Remove"
              onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
            >
              <Trash2 size={14} aria-hidden="true" />
            </PholioIconButton>
          </div>
        )}
      </div>
      <div className="mw-frame__foot">
        <FrameReadCaption image={image} classificationTimedOut={classificationTimedOut} />
      </div>
    </article>
  );
}

function DigitalsSetControl({ pkg, sets, onSelectSet, onCreateSet, busy, slug, hasDigitals }) {
  const set = pkg.digitalsSet || { filledCount: 0, requiredCount: 5, missingSlots: [] };
  const missing = (set.missingSlots || []).map((k) => DIGITALS_SLOT_LABELS[k] || k);
  const recency = pkg.recency || {};
  const currentSet = sets.find((s) => s.is_current) || null;
  const [downloading, setDownloading] = React.useState(false);

  // The digitals sheet — the raw, dated set + measurements agencies request.
  const handleDownloadDigitals = async () => {
    if (!slug || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(`/pdf/digitals/${slug}?download=1`, { credentials: 'include' });
      if (!res.ok) throw new Error('Could not generate your digitals sheet.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pholio-${slug}-digitals.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err?.message || 'Could not download your digitals sheet.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mw-digitals-set">
      <div className="mw-digitals-set__coverage">
        <span className="mw-digitals-set__count">
          {set.filledCount} of {set.requiredCount} slots
        </span>
        {missing.length > 0 ? (
          <span className="mw-digitals-set__missing">Missing {missing.join(' · ')}</span>
        ) : (
          <span className="mw-digitals-set__missing">Set complete</span>
        )}
        {pkg.suppressBodyImagery ? (
          <span className="mw-digitals-set__missing">Body frames held until guardian consent</span>
        ) : null}
        {recency.oldestDays != null ? (
          <span className={`mw-digitals-set__recency${recency.isStale ? ' mw-digitals-set__recency--stale' : ''}`}>
            {recency.isStale
              ? `Oldest ${recency.oldestDays}d — reshoot to stay current`
              : `Current — within the 3-month window (oldest ${recency.oldestDays}d)`}
          </span>
        ) : null}
      </div>
      <div className="mw-digitals-set__controls">
        {sets.length > 0 ? (
          <label className="mw-digitals-set__picker">
            <span className="mw-meta">Current set</span>
            <select
              className="mw-digitals-set__select"
              value={currentSet?.id || ''}
              disabled={busy}
              onChange={(e) => e.target.value && onSelectSet(e.target.value)}
            >
              <option value="" disabled>Select a set</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.kind}{s.is_current ? ' — current' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <PholioButton type="button" variant="secondary" disabled={busy} onClick={onCreateSet}>
          <Plus size={14} aria-hidden="true" /> Start new dated set
        </PholioButton>
        {hasDigitals && slug ? (
          <PholioButton
            type="button"
            variant="secondary"
            disabled={downloading}
            onClick={handleDownloadDigitals}
            title="Download your digitals as a dated PDF sheet"
          >
            {downloading ? (
              <Loader2 size={14} className="mw-spin" aria-hidden="true" />
            ) : (
              <Download size={14} aria-hidden="true" />
            )}
            Download digitals
          </PholioButton>
        ) : null}
      </div>
    </div>
  );
}

function UploadDatePrompt({ count, onConfirm, onSkip, onCancel }) {
  const [value, setValue] = React.useState('');
  const today = dateToInput(new Date());
  return (
    <div className="mw-modal-overlay" onClick={onCancel}>
      <div className="mw-modal" role="dialog" aria-modal="true" aria-label="Shoot date" onClick={(e) => e.stopPropagation()}>
        <header className="mw-modal__head">
          <h3 className="mw-modal__title">When were these shot?</h3>
          <PholioIconButton
            label="Cancel"
            className="mw-modal__close"
            onClick={onCancel}
          >
            <X size={16} aria-hidden="true" />
          </PholioIconButton>
        </header>
        <p className="mw-modal__body">
          A real shoot date keeps your recency honest — agencies read digitals by when they were taken,
          not when they were uploaded. Adding {count} {count === 1 ? 'frame' : 'frames'}.
        </p>
        <label className="mw-modal__field">
          <span className="mw-meta">Shoot date</span>
          <input type="date" max={today} value={value} onChange={(e) => setValue(e.target.value)} className="mw-modal__input" />
        </label>
        <div className="mw-modal__actions">
          <PholioButton type="button" variant="secondary" onClick={onSkip}>I&rsquo;m not sure — skip</PholioButton>
          <PholioButton variant="primary" disabled={!value} onClick={() => onConfirm(dateInputToIso(value))}>
            Add with date
          </PholioButton>
        </div>
      </div>
    </div>
  );
}

function MotionAddPrompt({ onSubmit, onCancel, busy }) {
  const [url, setUrl] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [duration, setDuration] = React.useState('');
  const [captured, setCaptured] = React.useState('');
  const today = dateToInput(new Date());
  const submit = () => {
    const trimmed = url.trim();
    if (!trimmed) { toast.error('Add a video URL'); return; }
    onSubmit({
      video_url: trimmed,
      label: label.trim() || undefined,
      video_duration_seconds: duration ? Number(duration) : undefined,
      captured_at: dateInputToIso(captured) || undefined,
    });
  };
  return (
    <div className="mw-modal-overlay" onClick={onCancel}>
      <div className="mw-modal" role="dialog" aria-modal="true" aria-label="Add motion" onClick={(e) => e.stopPropagation()}>
        <header className="mw-modal__head">
          <h3 className="mw-modal__title">Add a motion asset</h3>
          <PholioIconButton
            label="Cancel"
            className="mw-modal__close"
            onClick={onCancel}
          >
            <X size={16} aria-hidden="true" />
          </PholioIconButton>
        </header>
        <p className="mw-modal__body">Link a showreel or clip by URL — your stills pipeline is untouched.</p>
        <label className="mw-modal__field">
          <span className="mw-meta">Video URL</span>
          <input type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className="mw-modal__input" />
        </label>
        <label className="mw-modal__field">
          <span className="mw-meta">Label</span>
          <input type="text" placeholder="Showreel 2026" value={label} onChange={(e) => setLabel(e.target.value)} className="mw-modal__input" />
        </label>
        <div className="mw-modal__row">
          <label className="mw-modal__field">
            <span className="mw-meta">Length (sec)</span>
            <input type="number" min="0" placeholder="45" value={duration} onChange={(e) => setDuration(e.target.value)} className="mw-modal__input" />
          </label>
          <label className="mw-modal__field">
            <span className="mw-meta">Shoot date</span>
            <input type="date" max={today} value={captured} onChange={(e) => setCaptured(e.target.value)} className="mw-modal__input" />
          </label>
        </div>
        <div className="mw-modal__actions">
          <PholioButton type="button" variant="secondary" onClick={onCancel}>Cancel</PholioButton>
          <PholioButton variant="primary" disabled={busy || !url.trim()} onClick={submit}>
            {busy ? 'Adding…' : 'Add motion'}
          </PholioButton>
        </div>
      </div>
    </div>
  );
}

const CATEGORY_OPTIONS = [
  { value: 'portfolio', label: 'The Book' },
  { value: 'digital', label: 'Digitals' },
  { value: 'test', label: 'Tests' },
  { value: 'campaign', label: 'Campaigns' },
  { value: 'tearsheet', label: 'Tearsheets' },
];

function BulkReclassifyModal({ sets, onConfirm, onCancel, busy }) {
  const [category, setCategory] = React.useState('portfolio');
  const [setId, setSetId] = React.useState('');

  const submit = () => {
    onConfirm({
      image_type: category,
      set_id: category === 'digital' ? (setId || null) : null,
    });
  };

  return (
    <div className="mw-modal-overlay" onClick={onCancel}>
      <div className="mw-modal" role="dialog" aria-modal="true" aria-label="Bulk reclassify" onClick={(e) => e.stopPropagation()}>
        <header className="mw-modal__head">
          <h3 className="mw-modal__title">Bulk reclassify frames</h3>
          <PholioIconButton
            label="Cancel"
            className="mw-modal__close"
            onClick={onCancel}
          >
            <X size={16} aria-hidden="true" />
          </PholioIconButton>
        </header>
        <p className="mw-modal__body">
          Move the selected frames to a different portfolio section or dated set.
        </p>
        <label className="mw-modal__field">
          <span className="mw-meta">Target section</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mw-modal__input"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        {category === 'digital' && sets.length > 0 && (
          <label className="mw-modal__field">
            <span className="mw-meta">Add to dated set</span>
            <select
              value={setId}
              onChange={(e) => setSetId(e.target.value)}
              className="mw-modal__input"
            >
              <option value="">No set (current)</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.kind}{s.is_current ? ' — current' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="mw-modal__actions">
          <PholioButton type="button" variant="secondary" onClick={onCancel}>Cancel</PholioButton>
          <PholioButton variant="primary" disabled={busy} onClick={submit}>
            {busy ? 'Updating…' : 'Move frames'}
          </PholioButton>
        </div>
      </div>
    </div>
  );
}

export default function MediaWorkspace() {
  const shouldReduce = useReducedMotion();
  const {
    images, upload, deleteImage, reorder, setHero, replaceImage, restoreImage,
    isUploading, isLoading, sets, createSet, setCurrentSet, addVideo, isAddingVideo,
    bulkDeleteMedia, bulkUpdateMedia,
  } = useMedia();
  const { profile, refetch: refetchAuth } = useAuth();
  const queryClient = useQueryClient();

  const [localImages, setLocalImages] = React.useState(images || []);
  const [editor, setEditor] = React.useState(null); // { image, mode: 'details'|'crop' }
  const [deleteId, setDeleteId] = React.useState(null);
  const [settingCoverId, setSettingCoverId] = React.useState(null);
  const [uploadError, setUploadError] = React.useState(null);
  const [pendingFiles, setPendingFiles] = React.useState(null);
  const [showMotionPrompt, setShowMotionPrompt] = React.useState(false);
  const [setBusy, setSetBusy] = React.useState(false);
  
  // Bulk operation states
  const [bulkMode, setBulkMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [showBulkReclassifyModal, setShowBulkReclassifyModal] = React.useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = React.useState(false);

  const fileInputRef = React.useRef(null);
  const pollStartedRef = React.useRef(null);
  const prevClassRef = React.useRef(new Map());
  const toastedAutoRef = React.useRef(new Set());
  const [classificationTimedOutIds, setClassificationTimedOutIds] = React.useState(() => new Set());
  const timeoutToastedRef = React.useRef(false);

  // Sync server images into local state during render (adjust during render).
  const [prevImages, setPrevImages] = React.useState(images);
  if (images !== prevImages) {
    setPrevImages(images);
    setLocalImages(images || []);
  }
  React.useEffect(() => { document.title = 'Portfolio | Pholio'; }, []);

  React.useEffect(() => {
    for (const img of localImages) {
      const prev = prevClassRef.current.get(img.id);
      const state = getClassificationState(img);
      if (
        prev?.status === 'pending'
        && state.status === 'ready'
        && state.source === 'auto'
        && state.shotType
        && !toastedAutoRef.current.has(img.id)
      ) {
        toastedAutoRef.current.add(img.id);
        const label = formatTypeLabel(state.shotType, state.imageType, state.styleType);
        toast(`Pholio read this as ${label}`, {
          action: {
            label: 'Clear read',
            onClick: () => {
              talentApi.updateMedia(img.id, {
                shot_type: null,
                image_type: null,
                style_type: null,
                metadata: {
                  ...(typeof img.metadata === 'object' ? img.metadata : {}),
                  ai: {
                    classification: {
                      source: 'user',
                      confirmed: true,
                      band: 'ask',
                    },
                  },
                },
              }).then(() => {
                queryClient.invalidateQueries({ queryKey: ['auth-user'] });
              }).catch(() => {
                toast.error('Could not clear the frame read');
              });
            },
          },
        });
      }
      prevClassRef.current.set(img.id, state);
    }
  }, [localImages, queryClient]);

  const hasPendingClassification = React.useMemo(
    () => localImages.some((img) => getClassificationState(img).status === 'pending'),
    [localImages],
  );

  // Adjust during render: clear timed-out IDs when pending classification resolves.
  const [prevHasPending, setPrevHasPending] = React.useState(hasPendingClassification);
  if (hasPendingClassification !== prevHasPending) {
    setPrevHasPending(hasPendingClassification);
    if (!hasPendingClassification) setClassificationTimedOutIds(new Set());
  }

  React.useEffect(() => {
    if (!hasPendingClassification) {
      pollStartedRef.current = null;
      timeoutToastedRef.current = false;
      return undefined;
    }
    if (!pollStartedRef.current) pollStartedRef.current = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - pollStartedRef.current > 30000) {
        clearInterval(interval);
        const stillPending = localImages
          .filter((img) => getClassificationState(img).status === 'pending')
          .map((img) => img.id);
        if (stillPending.length > 0) {
          setClassificationTimedOutIds(new Set(stillPending));
          if (!timeoutToastedRef.current) {
            timeoutToastedRef.current = true;
            toast.error('Some frames need a manual read. Open details to place them.');
          }
        }
        return;
      }
      try {
        const res = await talentApi.getMediaClassificationStatus();
        const imagesStatus = res?.images || [];
        let anyReady = false;
        for (const img of localImages) {
          if (getClassificationState(img).status === 'pending') {
            const match = imagesStatus.find((si) => si.id === img.id);
            if (match && match.classification_status === 'ready') {
              anyReady = true;
            }
          }
        }
        if (anyReady) {
          queryClient.invalidateQueries({ queryKey: ['auth-user'] });
          refetchAuth?.();
        }
      } catch (err) {
        console.warn('[Classification poll] error:', err.message);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [hasPendingClassification, queryClient, refetchAuth, localImages]);

  const frames = localImages;
  const visibleCount = frames.filter((img) => !isHiddenFromMarket(img)).length;

  const grouped = React.useMemo(() => {
    const g = { digitals: [], book: [], tests: [], campaigns: [], tearsheets: [], motion: [] };
    for (const img of frames) g[bucketFor(img)].push(img);
    return g;
  }, [frames]);

  // Profile is threaded so minor-suppression activates on the /media surface.
  const pkg = React.useMemo(
    () => analyzePackageIntelligence({ images: frames, profile }),
    [frames, profile],
  );

  const compCardGating = React.useMemo(
    () => checkGatingStatus(profile, images),
    [profile, images],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Touch: long-press to arm a drag so normal vertical swipes still scroll the page.
    // TouchSensor is inert for mouse input, so desktop PointerSensor behavior is unchanged.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = null;
    if (files.length === 0) return;
    const { valid, invalid } = partitionFiles(files);
    showInvalidToasts(invalid);
    if (valid.length === 0) return;
    // Prompt for a real shoot date before upload — never silently stamp now().
    setPendingFiles(valid);
  };

  const runUpload = async (capturedAtIso) => {
    const valid = pendingFiles || [];
    setPendingFiles(null);
    if (valid.length === 0) return;
    const formData = new FormData();
    valid.forEach((f) => formData.append('media', f));
    if (capturedAtIso) formData.append('captured_at', capturedAtIso);
    try {
      setUploadError(null);
      const result = await upload(formData);
      const uploaded = Array.isArray(result?.images) ? result.images : [];
      if (uploaded.length > 0) {
        setLocalImages((prev) => {
          const seen = new Set(prev.map((img) => img.id));
          const merged = [...prev];
          uploaded.forEach((img) => {
            if (!img?.id || seen.has(img.id)) return;
            seen.add(img.id);
            merged.push(img);
          });
          return merged;
        });
      }
    } catch (err) {
      const failure = parseApiFailure(err, 'Upload failed');
      let message = failure.toastMessage || failure.body || 'Failed to upload image(s)';
      if (err?.data?.error === 'onboarding_required') {
        message = 'Finish onboarding before adding portfolio images, or complete your casting flow first.';
      } else if (err?.status === 0 || /network error/i.test(message)) {
        message = 'Could not reach the server. Wait a moment and try again (the API may still be restarting).';
      }
      setUploadError(message);
      toast.error(message);
    }
  };

  const handleSectionReorder = async (sectionKey, activeId, overId) => {
    if (activeId === overId) return;
    const items = grouped[sectionKey];
    const oldIndex = items.findIndex((i) => i.id === activeId);
    const newIndex = items.findIndex((i) => i.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    const prev = frames;
    const next = SECTION_ORDER.flatMap((k) => (k === sectionKey ? reordered : grouped[k]));
    setLocalImages(next);
    try { await reorder(next.map((i) => i.id)); }
    catch (err) { setLocalImages(prev); toast.error(err?.message || 'Failed to reorder'); }
  };

  const handleSetCover = async (id) => {
    setSettingCoverId(id);
    try {
      await setHero(id);
      setLocalImages((prev) => prev.map((img) => ({ ...img, is_primary: img.id === id })));
    } catch (err) { toast.error(err?.message || 'Failed to set cover'); }
    finally { setSettingCoverId(null); }
  };

  const handleSelectSet = async (id) => {
    setSetBusy(true);
    try { await setCurrentSet(id); }
    catch (err) { toast.error(err?.message || 'Failed to set current set'); }
    finally { setSetBusy(false); }
  };

  const handleCreateSet = async () => {
    setSetBusy(true);
    try {
      const name = `Digitals — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      await createSet({ kind: 'digitals', name, is_current: true });
    } catch (err) { toast.error(err?.message || 'Failed to create set'); }
    finally { setSetBusy(false); }
  };

  const handleAddVideo = async (payload) => {
    try {
      const res = await addVideo(payload);
      const img = res?.image;
      if (img?.id) {
        setLocalImages((prev) => (prev.some((p) => p.id === img.id) ? prev : [...prev, img]));
      }
      setShowMotionPrompt(false);
    } catch (err) { toast.error(err?.message || 'Failed to add motion asset'); }
  };

  const handleUpdateMetadata = (id, patch) =>
    setLocalImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...patch } : img)));

  const handleClassificationConfirm = (id, nextImage) => {
    setLocalImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...nextImage } : img)));
    queryClient.invalidateQueries({ queryKey: ['auth-user'] });
  };

  const handleReplace = async (blob) => {
    if (!editor) return;
    try { await replaceImage(editor.image.id, blob); setEditor(null); }
    catch (err) { console.error(err); toast.error('Failed to save edited photo. Please try again.'); }
  };

  const handleRestore = async (id) => {
    try { await restoreImage(id); setEditor(null); }
    catch (err) { toast.error(err?.message || 'Failed to restore original'); }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try { await deleteImage(deleteId); setDeleteId(null); }
    catch (err) { toast.error(err?.message || 'Failed to delete image'); }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      await bulkDeleteMedia(ids);
      setSelectedIds(new Set());
      setBulkMode(false);
      setShowBulkDeleteConfirm(false);
    } catch (err) {
      toast.error(err?.message || 'Bulk delete failed');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkUpdate = async (patch) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsBulkUpdating(true);
    try {
      await bulkUpdateMedia({ imageIds: ids, patch });
      setSelectedIds(new Set());
      setBulkMode(false);
      setShowBulkReclassifyModal(false);
    } catch (err) {
      toast.error(err?.message || 'Bulk update failed');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const renderSection = (key) => {
    const items = grouped[key];
    if (items.length === 0) return null;
    const meta = SECTION_META[key];
    const allowCover = key === 'book';
    return (
      <section key={key} className="mw-section" aria-label={meta.title}>
        <div className="mw-section__head">
          <h2 className="mw-h2">{meta.title}</h2>
          <span className="mw-section__count mw-meta">{items.length} {items.length === 1 ? 'frame' : 'frames'}</span>
        </div>
        <p className="mw-sub mw-section__blurb">{meta.blurb}</p>
        {key === 'digitals' ? (
          <DigitalsSetControl
            pkg={pkg}
            sets={sets}
            busy={setBusy}
            onSelectSet={handleSelectSet}
            onCreateSet={handleCreateSet}
            slug={profile?.slug}
            hasDigitals={items.length > 0}
          />
        ) : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragEnd={(e) => { if (e.over) handleSectionReorder(key, e.active.id, e.over.id); }}>
          <div className="mw-grid">
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              {items.map((image, index) => (
                <motion.div key={image.id}
                  initial={shouldReduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: shouldReduce ? 0 : 0.32, delay: shouldReduce ? 0 : index * 0.03, ease: [0.22, 1, 0.36, 1] }}>
                  <MediaFrame
                    image={image} index={index}
                    allowCover={allowCover}
                    onSetCover={handleSetCover}
                    onEdit={(img) => setEditor({ image: img, mode: 'details' })}
                    onCrop={(img) => setEditor({ image: img, mode: 'crop' })}
                    onDelete={setDeleteId}
                    settingCoverId={settingCoverId}
                    classificationTimedOut={classificationTimedOutIds.has(image.id)}
                    bulkMode={bulkMode}
                    isSelected={selectedIds.has(image.id)}
                    onToggleSelect={handleToggleSelect}
                  />
                </motion.div>
              ))}
            </SortableContext>
            {key === 'motion' ? (
              <PholioButton type="button" variant="secondary" className="mw-add-tile" onClick={() => setShowMotionPrompt(true)} disabled={isAddingVideo}>
                <Film size={20} aria-hidden="true" />
                <span>{isAddingVideo ? 'Adding…' : 'Add motion'}</span>
              </PholioButton>
            ) : (
              <PholioButton type="button" variant="secondary" className="mw-add-tile" onClick={openFilePicker} disabled={isUploading}>
                <Plus size={20} aria-hidden="true" />
                <span>{isUploading ? 'Adding…' : 'Add images'}</span>
              </PholioButton>
            )}
          </div>
        </DndContext>
      </section>
    );
  };

  const hasAnyFrame = frames.length > 0;

  return (
    <div className="mw-root">
      <div className="mw-wrap">
        {editor && (
          <FrameEditor
            image={editor.image}
            initialMode={editor.mode}
            mediaSets={sets}
            onClose={() => setEditor(null)}
            onUpdate={handleUpdateMetadata}
            onReplace={handleReplace}
            onRestore={handleRestore}
          />
        )}
        {pendingFiles && (
          <UploadDatePrompt
            count={pendingFiles.length}
            onConfirm={(iso) => runUpload(iso)}
            onSkip={() => runUpload(null)}
            onCancel={() => setPendingFiles(null)}
          />
        )}
        {showMotionPrompt && (
          <MotionAddPrompt onSubmit={handleAddVideo} onCancel={() => setShowMotionPrompt(false)} busy={isAddingVideo} />
        )}
        {showBulkReclassifyModal && (
          <BulkReclassifyModal
            sets={sets}
            onConfirm={handleBulkUpdate}
            onCancel={() => setShowBulkReclassifyModal(false)}
            busy={isBulkUpdating}
          />
        )}
        <ConfirmationDialog
          isOpen={deleteId !== null}
          title="Remove frame?"
          message="This frame will be removed from your portfolio and from active representation materials."
          confirmLabel="Remove frame"
          cancelLabel="Cancel"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteId(null)}
        />
        <ConfirmationDialog
          isOpen={showBulkDeleteConfirm}
          title="Remove selected frames?"
          message={`These ${selectedIds.size} selected frames will be permanently removed from your portfolio and active representation materials.`}
          confirmLabel="Remove frames"
          cancelLabel="Cancel"
          danger
          onConfirm={handleBulkDeleteConfirm}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
        {bulkMode && (
          <div className="mw-bulk-bar">
            <span className="mw-bulk-bar__count">
              {selectedIds.size} {selectedIds.size === 1 ? 'item' : 'items'} selected
            </span>
            <div className="mw-bulk-bar__actions">
              <PholioButton
                variant="secondary"
                disabled={selectedIds.size === 0 || isBulkUpdating}
                onClick={() => setShowBulkReclassifyModal(true)}
              >
                Move / Reclassify
              </PholioButton>
              <PholioButton
                variant="primary"
                danger
                disabled={selectedIds.size === 0 || isBulkDeleting}
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                Delete Selected
              </PholioButton>
              <PholioButton
                variant="tertiary"
                onClick={() => {
                  setBulkMode(false);
                  setSelectedIds(new Set());
                }}
              >
                Cancel
              </PholioButton>
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file" multiple
          accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          onChange={handleFileSelect}
          className="mw-file-input"
          disabled={isUploading}
        />

        <motion.header className="mw-masthead" {...(shouldReduce ? {} : ARRIVE)}>
          <div className="mw-masthead__copy">
            <h1 className="mw-h1">
              The <em>Book.</em>
            </h1>
            <p className="mw-sub">Curate the frames agencies see — then compose your comp card from them.</p>
            <span className="mw-meta mw-masthead__meta">
              {frames.length} {frames.length === 1 ? 'frame' : 'frames'} · {visibleCount} visible to agencies
            </span>
          </div>
          <div className="mw-masthead__actions">
            {hasAnyFrame && (
              <PholioButton
                variant={bulkMode ? 'secondary' : 'secondary'}
                onClick={() => {
                  setBulkMode(!bulkMode);
                  setSelectedIds(new Set());
                }}
              >
                {bulkMode ? 'Cancel Selection' : 'Select Multiple'}
              </PholioButton>
            )}
            <PholioButton variant="secondary" onClick={() => setShowMotionPrompt(true)} disabled={isAddingVideo || bulkMode}>
              <Film size={15} aria-hidden="true" /> Add motion
            </PholioButton>
            <PholioButton variant="primary" onClick={openFilePicker} disabled={isUploading || bulkMode}>
              <Plus size={15} aria-hidden="true" /> {isUploading ? 'Adding…' : 'Add images'}
            </PholioButton>
          </div>
        </motion.header>

        {uploadError && (
          <TransferFailureNotice
            title="Upload interrupted"
            body={uploadError}
            retry={{ label: 'Dismiss', onClick: () => setUploadError(null) }}
          />
        )}

        <section aria-label="Frame library" className="mw-library">
          <div className="mw-section-head">
            <DigitalsBookPanel
              images={frames}
              profile={profile}
              onConfirm={handleClassificationConfirm}
              onEdit={(img) => setEditor({ image: img, mode: 'details' })}
            />
          </div>

          {isLoading ? (
            <div className="mw-grid">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="mw-skeleton" />)}
            </div>
          ) : hasAnyFrame ? (
            <>
              {SECTION_ORDER.map((key) => renderSection(key))}
              <p className="mw-helper">JPEG · PNG · WEBP — up to 25MB, 12 at a time</p>
            </>
          ) : (
            <div className="mw-empty">
              <span className="mw-empty__title">No frames yet.</span>
              <PholioButton variant="primary" onClick={openFilePicker} disabled={isUploading}>
                <Upload size={14} aria-hidden /> Upload Media
              </PholioButton>
              <p className="mw-helper">JPEG · PNG · WEBP — up to 25MB, 12 at a time</p>
            </div>
          )}
        </section>

        <div className="mw-divider" aria-hidden="true" />

        <section aria-label="Comp card" className="mw-comp-card">
          {compCardGating.isBlocked ? (
            <CompCardGate
              missingTasks={compCardGating.missingTasks}
              missingFields={compCardGating.missingFields}
              completedCount={compCardGating.completedCount}
              totalRequired={compCardGating.totalRequired}
            />
          ) : (
            <CompCard images={frames} profile={profile} />
          )}
        </section>
      </div>
    </div>
  );
}
