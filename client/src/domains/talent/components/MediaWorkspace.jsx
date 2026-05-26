import React from 'react';
import { motion } from 'framer-motion';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, Star, Edit2, Crop, Trash2, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMedia } from '../hooks/useMedia';
import { useAuth } from '../../auth/hooks/useAuth';
import { TransferFailureNotice } from '../../../shared/components/states';
import { parseApiFailure } from '../../../shared/lib/api-error-message';
import ImageMetadataModal from './ImageMetadataModal';
import PhotoEditorModal from './PhotoEditorModal';
import ConfirmationDialog from '../../../shared/components/ui/ConfirmationDialog';
import CompCard from './CompCard';
import './MediaWorkspace.css';

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

function PortfolioFrame({ image, index, onSetCover, onEdit, onCrop, onDelete, settingCoverId }) {
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
        />
        <span className="mw-frame__index">{String(index + 1).padStart(2, '0')}</span>
        {isCover && <span className="mw-tag mw-tag--cover">Cover</span>}
        {isPrivate && !isCover && <span className="mw-tag mw-tag--private"><EyeOff size={9} aria-hidden="true" />Private</span>}

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
    </article>
  );
}

export default function MediaWorkspace() {
  const { images, upload, deleteImage, reorder, setHero, replaceImage, isUploading, isLoading } = useMedia();
  const { profile } = useAuth();

  const [localImages, setLocalImages] = React.useState(images || []);
  const [editingImage, setEditingImage] = React.useState(null);
  const [editorImage, setEditorImage] = React.useState(null);
  const [deleteId, setDeleteId] = React.useState(null);
  const [settingCoverId, setSettingCoverId] = React.useState(null);
  const [uploadError, setUploadError] = React.useState(null);
  const fileInputRef = React.useRef(null);

  React.useEffect(() => { setLocalImages(images || []); }, [images]);
  React.useEffect(() => { document.title = 'Portfolio | Pholio'; }, []);

  const frames = localImages;
  const visibleCount = frames.filter((img) => !isHiddenFromMarket(img)).length;

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

  const handleOpenEditor = (image) => { setEditingImage(null); setEditorImage(image); };

  const handleSaveEditedPhoto = async (blob) => {
    if (!editorImage) return;
    try { await replaceImage(editorImage.id, blob); setEditorImage(null); }
    catch (err) { console.error(err); toast.error('Failed to save edited photo. Please try again.'); }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try { await deleteImage(deleteId); setDeleteId(null); }
    catch (err) { toast.error(err?.message || 'Failed to delete image'); }
  };

  return (
    <div className="mw-root">
      <div className="mw-wrap">
        {editingImage && (
          <ImageMetadataModal
            image={editingImage}
            onClose={() => setEditingImage(null)}
            onUpdate={handleUpdateMetadata}
            onOpenEditor={handleOpenEditor}
            mediaSets={[]}
          />
        )}
        {editorImage && (
          <PhotoEditorModal
            imageSrc={getImageUrl(editorImage.public_url || editorImage.path)}
            onClose={() => setEditorImage(null)}
            onSave={handleSaveEditedPhoto}
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

        <motion.header className="mw-masthead" {...ARRIVE}>
          <div className="mw-masthead__copy">
            <span className="mw-kicker">The Book</span>
            <h1 className="mw-h1">
              The <em>Book.</em>
            </h1>
            <p className="mw-sub">Curate the frames agencies see — then compose your comp card from them.</p>
            <span className="mw-meta mw-masthead__meta">
              {frames.length} {frames.length === 1 ? 'frame' : 'frames'} · {visibleCount} visible to agencies
            </span>
          </div>
          <button type="button" className="mw-btn-gold" onClick={openFilePicker} disabled={isUploading}>
            <Plus size={15} aria-hidden="true" /> {isUploading ? 'Adding…' : 'Add images'}
          </button>
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
            <span className="mw-kicker">I — Library</span>
            <h2 className="mw-h2">Your frames</h2>
          </div>

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
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.32, delay: index * 0.035, ease: [0.22, 1, 0.36, 1] }}>
                        <PortfolioFrame
                          image={image} index={index}
                          onSetCover={handleSetCover} onEdit={setEditingImage}
                          onCrop={setEditorImage} onDelete={setDeleteId}
                          settingCoverId={settingCoverId}
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
              <button type="button" className="mw-btn-gold" onClick={openFilePicker} disabled={isUploading}>
                <Plus size={15} aria-hidden="true" /> Add images
              </button>
              <p className="mw-helper">JPEG · PNG · WEBP — up to 5MB, 12 at a time</p>
            </div>
          )}
        </section>

        <div className="mw-divider" aria-hidden="true" />

        <section aria-label="Comp card">
          <CompCard images={frames} profile={profile} />
        </section>
      </div>
    </div>
  );
}
