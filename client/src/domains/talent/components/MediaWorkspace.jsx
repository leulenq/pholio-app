import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, Star, Edit2, Crop, Trash2, EyeOff, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useMedia } from '../hooks/useMedia';
import { useAuth } from '../../auth/hooks/useAuth';
import { TransferFailureNotice } from '../../../shared/components/states';
import { parseApiFailure } from '../../../shared/lib/api-error-message';
import { getClassificationState, formatTypeLabel } from '../../../shared/utils/imageClassification';
import { talentApi } from '../api/talent';
import FrameEditor from './FrameEditor';
import ClassificationReviewStrip, { FrameTypeCaption } from './ClassificationReviewStrip';
import DigitalsBookPanel from './DigitalsBookPanel';
import ConfirmationDialog from '../../../shared/components/ui/ConfirmationDialog';
import PholioButton from '../../../shared/components/ui/PholioButton';
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

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_FILES = 12;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

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
    else if (file.size > MAX_FILE_BYTES) invalid.push({ name: file.name || 'Unknown', reason: 'Max 5MB each' });
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
function markBroken(e) { e.currentTarget.classList.add('mw-frame__img--failed'); }

function PortfolioFrame({ image, index, onSetCover, onEdit, onCrop, onDelete, settingCoverId, classificationTimedOut }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition, zIndex: isDragging ? 10 : 1,
  };
  const isCover = !!image.is_primary;
  const isPrivate = isHiddenFromMarket(image);
  const coverBusy = !!settingCoverId;
  const cls = ['mw-frame', isCover ? 'mw-frame--cover' : '', isDragging ? 'mw-frame--dragging' : ''].filter(Boolean).join(' ');

  return (
    <article ref={setNodeRef} style={style} className={cls} aria-label={`Frame ${index + 1}`}>
      <div className="mw-frame__stage" {...attributes} {...listeners}>
        <img
          src={getImageUrl(image.public_url || image.path)}
          alt={metadataFor(image).caption || `Portfolio frame ${index + 1}`}
          className={`mw-frame__img ${isPrivate ? 'mw-frame__img--private' : ''}`}
          loading="lazy" decoding="async" draggable={false} onError={markBroken}
          onClick={(e) => { e.stopPropagation(); onEdit(image); }}
        />
        <span className="mw-frame__index">{String(index + 1).padStart(2, '0')}</span>
        {isCover ? (
          <span className="mw-frame__cover-mark" aria-label="Cover frame" title="Cover frame">
            <Star size={14} fill="currentColor" aria-hidden="true" />
          </span>
        ) : null}

        <div className="mw-frame__actions" aria-label="Frame actions">
          {!isCover && (
            <button type="button" className="mw-frame__action" title="Make cover" aria-label="Make cover"
              disabled={coverBusy} onClick={(e) => { e.stopPropagation(); onSetCover(image.id); }}>
              {settingCoverId === image.id ? <Loader2 size={14} className="mw-spin" aria-hidden="true" /> : <Star size={14} aria-hidden="true" />}
            </button>
          )}
          <button type="button" className="mw-frame__action" title="Edit details" aria-label="Edit details"
            onClick={(e) => { e.stopPropagation(); onEdit(image); }}><Edit2 size={14} aria-hidden="true" /></button>
          <button type="button" className="mw-frame__action" title="Crop" aria-label="Crop"
            onClick={(e) => { e.stopPropagation(); onCrop(image); }}><Crop size={14} aria-hidden="true" /></button>
          <button type="button" className="mw-frame__action mw-frame__action--danger" title="Remove" aria-label="Remove"
            onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}><Trash2 size={14} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="mw-frame__foot">
        {isPrivate ? (
          <p className="mw-frame__status-line">
            Private
          </p>
        ) : null}
        <FrameTypeCaption image={image} classificationTimedOut={classificationTimedOut} />
      </div>
    </article>
  );
}

export default function MediaWorkspace() {
  const shouldReduce = useReducedMotion();
  const { images, upload, deleteImage, reorder, setHero, replaceImage, restoreImage, isUploading, isLoading } = useMedia();
  const { profile, refetch: refetchAuth } = useAuth();
  const queryClient = useQueryClient();

  const [localImages, setLocalImages] = React.useState(images || []);
  const [editor, setEditor] = React.useState(null); // { image, mode: 'details'|'crop' }
  const [deleteId, setDeleteId] = React.useState(null);
  const [settingCoverId, setSettingCoverId] = React.useState(null);
  const [uploadError, setUploadError] = React.useState(null);
  const fileInputRef = React.useRef(null);
  const pollStartedRef = React.useRef(null);
  const prevClassRef = React.useRef(new Map());
  const toastedAutoRef = React.useRef(new Set());
  const [classificationTimedOutIds, setClassificationTimedOutIds] = React.useState(() => new Set());
  const timeoutToastedRef = React.useRef(false);

  React.useEffect(() => { setLocalImages(images || []); }, [images]);
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

  React.useEffect(() => {
    if (!hasPendingClassification) {
      pollStartedRef.current = null;
      timeoutToastedRef.current = false;
      setClassificationTimedOutIds(new Set());
      return undefined;
    }
    if (!pollStartedRef.current) pollStartedRef.current = Date.now();
    const interval = setInterval(() => {
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
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      refetchAuth?.();
    }, 2000);
    return () => clearInterval(interval);
  }, [hasPendingClassification, queryClient, refetchAuth, localImages]);

  const frames = localImages;
  const visibleCount = frames.filter((img) => !isHiddenFromMarket(img)).length;

  const compCardGating = React.useMemo(
    () => checkGatingStatus(profile, images),
    [profile, images],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const { valid, invalid } = partitionFiles(files);
    showInvalidToasts(invalid);
    if (valid.length === 0) { e.target.value = null; return; }
    const formData = new FormData();
    valid.forEach((f) => formData.append('media', f));
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
    } finally {
      e.target.value = null;
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = frames.findIndex((i) => i.id === active.id);
    const newIndex = frames.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const prev = frames;
    const next = arrayMove(frames, oldIndex, newIndex);
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

  return (
    <div className="mw-root">
      <div className="mw-wrap">
        {editor && (
          <FrameEditor
            image={editor.image}
            initialMode={editor.mode}
            mediaSets={[]}
            onClose={() => setEditor(null)}
            onUpdate={handleUpdateMetadata}
            onReplace={handleReplace}
            onRestore={handleRestore}
          />
        )}
        <ConfirmationDialog
          isOpen={deleteId !== null}
          title="Remove frame?"
          message="This frame will be removed from your portfolio and from active representation materials."
          confirmLabel="Remove frame"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteId(null)}
        />
        <input
          ref={fileInputRef}
          type="file" multiple
          accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          onChange={handleFileUpload}
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
          <PholioButton variant="solid" onClick={openFilePicker} disabled={isUploading}>
            <Plus size={15} aria-hidden="true" /> {isUploading ? 'Adding…' : 'Add images'}
          </PholioButton>
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
            <DigitalsBookPanel images={frames} />
          </div>

          <ClassificationReviewStrip
            images={frames}
            onConfirm={handleClassificationConfirm}
            onEdit={(img) => setEditor({ image: img, mode: 'details' })}
          />

          {isLoading ? (
            <div className="mw-grid">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="mw-skeleton" />)}
            </div>
          ) : frames.length > 0 ? (
            <>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <div className="mw-grid">
                  <SortableContext items={frames.map((i) => i.id)} strategy={rectSortingStrategy}>
                    {frames.map((image, index) => (
                      <motion.div key={image.id}
                        initial={shouldReduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: shouldReduce ? 0 : 0.32, delay: shouldReduce ? 0 : index * 0.035, ease: [0.22, 1, 0.36, 1] }}>
                        <PortfolioFrame
                          image={image} index={index}
                          onSetCover={handleSetCover}
                          onEdit={(img) => setEditor({ image: img, mode: 'details' })}
                          onCrop={(img) => setEditor({ image: img, mode: 'crop' })}
                          onDelete={setDeleteId}
                          settingCoverId={settingCoverId}
                          classificationTimedOut={classificationTimedOutIds.has(image.id)}
                        />
                      </motion.div>
                    ))}
                  </SortableContext>
                  <button type="button" className="mw-add-tile" onClick={openFilePicker} disabled={isUploading}>
                    <Plus size={20} aria-hidden="true" />
                    <span>{isUploading ? 'Adding…' : 'Add images'}</span>
                  </button>
                </div>
              </DndContext>
              <p className="mw-helper">JPEG · PNG · WEBP — up to 5MB, 12 at a time</p>
            </>
          ) : (
            <div className="mw-empty">
              <span className="mw-empty__title">No frames yet.</span>
              <PholioButton variant="solid" onClick={openFilePicker} disabled={isUploading}>
                <Upload size={14} aria-hidden /> Upload Media
              </PholioButton>
              <p className="mw-helper">JPEG · PNG · WEBP — up to 5MB, 12 at a time</p>
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
