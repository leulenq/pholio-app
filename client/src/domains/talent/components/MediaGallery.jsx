import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useMedia } from '../hooks/useMedia';
import { Trash2, Plus, Edit2, EyeOff, Upload, Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ReadinessBar from './ReadinessBar';
import CompCardPreview from './CompCardPreview';
import ImageMetadataModal from './ImageMetadataModal';
import PhotoEditorModal from './PhotoEditorModal';
import ConfirmationDialog from '../../../shared/components/ui/ConfirmationDialog';
import './MediaGallery.css';

const MAX_PORTFOLIO_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PORTFOLIO_UPLOAD_FILES = 12;
const PORTFOLIO_ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function normalizePortfolioMime(file) {
  const t = (file.type || '').toLowerCase().trim();
  if (t === 'image/jpg') return 'image/jpeg';
  return t;
}

function isAllowedPortfolioFile(file) {
  const mime = normalizePortfolioMime(file);
  if (PORTFOLIO_ALLOWED_MIME.has(mime)) return true;
  const name = (file.name || '').toLowerCase();
  return /\.(jpe?g|png|webp)$/.test(name);
}

/**
 * @param {File[]} files
 * @returns {{ valid: File[], invalid: { name: string; reason: string }[] }}
 */
function partitionPortfolioUploadFiles(files) {
  const valid = [];
  const invalid = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (index >= MAX_PORTFOLIO_UPLOAD_FILES) {
      invalid.push({
        name: file.name || 'Unknown file',
        reason: `A maximum of ${MAX_PORTFOLIO_UPLOAD_FILES} files can be uploaded at once`,
      });
      continue;
    }
    if (!isAllowedPortfolioFile(file)) {
      invalid.push({
        name: file.name || 'Unknown file',
        reason: 'Only JPEG, PNG, and WebP are allowed',
      });
      continue;
    }
    if (file.size > MAX_PORTFOLIO_FILE_BYTES) {
      invalid.push({
        name: file.name || 'Unknown file',
        reason: 'Each file must be 5MB or smaller',
      });
      continue;
    }
    valid.push(file);
  }
  return { valid, invalid };
}

function showPortfolioUploadValidationToasts(invalid) {
  if (invalid.length === 0) return;
  if (invalid.length === 1) {
    const [{ name, reason }] = invalid;
    toast.error(`${name}: ${reason}`);
    return;
  }
  const lines = invalid.slice(0, 5).map((i) => `${i.name}: ${i.reason}`);
  const more = invalid.length > 5 ? `\n… and ${invalid.length - 5} more` : '';
  toast.error(`${invalid.length} files could not be uploaded`, {
    description: `${lines.join('\n')}${more}`,
  });
}

/* ─── Portfolio Image Card ─────────────────────────────────── */
function PortfolioImage({ image, onDelete, onEdit, onSetPrimary, settingHeroId }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: image.id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1
  };

  const getImageUrl = (value) => {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
    return `/uploads/${trimmed.replace(/^\/+/, '')}`;
  };

  const isPrivate = image.metadata?.visibility === 'private';
  const isPrimary = !!image.is_primary;
  const heroBusy = !!settingHeroId;

  const roleBadgeColors = {
    headshot:  { bg: '#C9A55A', label: 'Headshot' },
    full_body: { bg: '#2563EB', label: 'Full Body' },
    editorial: { bg: '#7C3AED', label: 'Editorial' },
    lifestyle: { bg: '#059669', label: 'Lifestyle' },
  };

  const shotBadgeMap = {
    headshot: { bg: '#C9A55A', label: 'Headshot' },
    three_quarter: { bg: '#2563EB', label: '3/4' },
    full_length: { bg: '#2563EB', label: 'Full length' },
    profile_left: { bg: '#475569', label: 'Profile L' },
    profile_right: { bg: '#475569', label: 'Profile R' },
    back: { bg: '#475569', label: 'Back' },
    detail: { bg: '#475569', label: 'Detail' },
  };

  const styleBadgeMap = {
    editorial: { bg: '#7C3AED', label: 'Editorial' },
    commercial: { bg: '#0284c7', label: 'Commercial' },
    lifestyle: { bg: '#059669', label: 'Lifestyle' },
    beauty: { bg: '#db2777', label: 'Beauty' },
    ecommerce: { bg: '#78716c', label: 'E-commerce' },
    swimwear: { bg: '#0d9488', label: 'Swimwear' },
    fitness: { bg: '#ea580c', label: 'Fitness' },
  };

  let cardBadge = null;
  if (image.shot_type && shotBadgeMap[image.shot_type]) {
    cardBadge = shotBadgeMap[image.shot_type];
  } else if (image.style_type && styleBadgeMap[image.style_type]) {
    cardBadge = styleBadgeMap[image.style_type];
  } else {
    const cardRole = image.metadata?.role || null;
    if (cardRole && roleBadgeColors[cardRole]) {
      cardBadge = { bg: roleBadgeColors[cardRole].bg, label: roleBadgeColors[cardRole].label };
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="portfolio-image-card group"
      title="Drag to reorder"
    >
      {/* The Image */}
      <img
        src={getImageUrl(image.public_url || image.path)}
        alt="Portfolio"
        className={`portfolio-image ${isPrivate ? 'opacity-75 grayscale' : ''}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        {...attributes}
        {...listeners}
      />

      {/* Shot / style / legacy role badge */}
      {cardBadge && (
        <div className="role-badge" style={{ background: cardBadge.bg }}>
          {cardBadge.label}
        </div>
      )}

      {isPrimary && (
        <div className="primary-badge">Primary</div>
      )}

      {/* Private Indicator */}
      {isPrivate && (
        <div className="image-indicators">
          <div className="indicator-badge indicator-private" title="Private">
            <EyeOff size={12} />
          </div>
        </div>
      )}

      {/* Hover Actions */}
      <div className="portfolio-image-overlay">
        <div className="portfolio-actions">
          {!isPrimary && onSetPrimary && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSetPrimary(image.id);
              }}
              className="action-button action-hero"
              disabled={heroBusy}
              title="Set as primary (comp card hero)"
              aria-label="Set as primary image"
            >
              {settingHeroId === image.id ? (
                <Loader2 size={14} className="action-button-spinner" aria-hidden />
              ) : (
                <Star size={14} />
              )}
            </button>
          )}
           <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(image); }}
            className="action-button action-edit"
            title="Edit Details"
            aria-label="Edit image details"
          >
            <Edit2 size={14} />
          </button>
          
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
            className="action-button action-delete"
            title="Delete"
            aria-label="Delete image"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Studio Page ──────────────────────────────────────────── */
export default function MediaGallery() {
  const {
    images,
    upload,
    deleteImage,
    reorder,
    setHero,
    replaceImage,
    fetchSets,
    createSet,
    setCurrentSet,
    isUploading,
    isLoading,
  } = useMedia();
  const [localImages, setLocalImages] = React.useState(images);
  const [editingImage, setEditingImage] = React.useState(null);
  const [editorImage, setEditorImage] = React.useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = React.useState(null);
  const [settingHeroId, setSettingHeroId] = React.useState(null);
  const [mediaSets, setMediaSets] = React.useState([]);
  const [selectedSetId, setSelectedSetId] = React.useState('');
  const [isRefreshingSets, setIsRefreshingSets] = React.useState(false);

  React.useEffect(() => {
    setLocalImages(images);
  }, [images]);

  const loadSets = React.useCallback(async () => {
    setIsRefreshingSets(true);
    try {
      const response = await fetchSets();
      const rows = Array.isArray(response?.sets) ? response.sets : [];
      setMediaSets(rows);
      const current = rows.find((row) => row.is_current);
      setSelectedSetId(current?.id || rows[0]?.id || '');
    } catch (err) {
      console.warn('Failed to load media sets', err);
    } finally {
      setIsRefreshingSets(false);
    }
  }, [fetchSets]);

  React.useEffect(() => {
    loadSets();
  }, [loadSets]);

  React.useEffect(() => {
    document.title = 'Portfolio | Pholio';
  }, []);

  // Optimistic update after metadata modal (metadata + structured top-level fields)
  const handleUpdateMetadata = (id, patch) => {
    setLocalImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, ...patch } : img)),
    );
  };

  // Helper: Open Editor (closes metadata modal)
  const handleOpenEditor = (image) => {
    setEditingImage(null);
    setEditorImage(image);
  };

  // Helper: Save Edited Photo
  const handleSaveEditedPhoto = async (blob) => {
    if (!editorImage) return;

    try {
      await replaceImage(editorImage.id, blob);
      setEditorImage(null);
    } catch (err) {
      console.error('Failed to save edited image', err);
      toast.error('Failed to save edited photo. Please try again.');
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localImages.findIndex((item) => item.id === active.id);
    const newIndex = localImages.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const previousOrder = localImages;
    const newOrder = arrayMove(localImages, oldIndex, newIndex);
    setLocalImages(newOrder);
    const ids = newOrder.map(img => img.id);
    try {
      await reorder(ids);
    } catch (err) {
      setLocalImages(previousOrder);
      toast.error(err?.message || 'Failed to reorder images');
    }
  };

  const handleSetPrimary = async (id) => {
    setSettingHeroId(id);
    try {
      await setHero(id);
      setLocalImages((prev) =>
        prev.map((img) => ({ ...img, is_primary: img.id === id }))
      );
    } catch (err) {
      toast.error(err?.message || 'Failed to set primary image');
    } finally {
      setSettingHeroId(null);
    }
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const { valid, invalid } = partitionPortfolioUploadFiles(list);
    showPortfolioUploadValidationToasts(invalid);
    if (valid.length === 0) {
      e.target.value = null;
      return;
    }
    const formData = new FormData();
    for (let i = 0; i < valid.length; i++) {
      formData.append('media', valid[i]);
    }
    if (selectedSetId) {
      formData.append('set_id', selectedSetId);
    }
    try {
      await upload(formData);
    } catch (err) {
      toast.error(err?.message || 'Failed to upload image(s)');
    } finally {
      e.target.value = null;
    }
  };

  const handleDelete = (id) => {
    setDeleteConfirmation(id);
  };

  const handleCreateSet = async () => {
    const kindInput = window.prompt('Set kind (e.g. portfolio_test, digitals, campaign):', 'portfolio_test');
    if (!kindInput || !kindInput.trim()) return;
    const nameInput = window.prompt('Set name (optional):', '');
    try {
      const res = await createSet({
        kind: kindInput.trim(),
        name: nameInput?.trim() || null,
        is_current: false,
      });
      const createdId = res?.set?.id;
      await loadSets();
      if (createdId) setSelectedSetId(createdId);
    } catch (err) {
      console.warn('Failed to create media set', err);
    }
  };

  const handleSetCurrent = async () => {
    if (!selectedSetId) return;
    try {
      await setCurrentSet(selectedSetId);
      await loadSets();
    } catch (err) {
      console.warn('Failed to set current media set', err);
    }
  };

  const confirmDelete = async () => {
    if (deleteConfirmation) {
      try {
        await deleteImage(deleteConfirmation);
        setDeleteConfirmation(null);
      } catch (err) {
        toast.error(err?.message || 'Failed to delete image');
      }
    }
  };

  const getImageUrl = (value) => {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
    return `/uploads/${trimmed.replace(/^\/+/, '')}`;
  };

  return (
    <div className="studio-container">
      {/* Metadata Modal */}
      {editingImage && (
        <ImageMetadataModal
          image={editingImage}
          onClose={() => setEditingImage(null)}
          onUpdate={handleUpdateMetadata}
          onOpenEditor={handleOpenEditor}
          mediaSets={mediaSets}
        />
      )}

      {/* Editor Modal */}
      {editorImage && (
        <PhotoEditorModal
          imageSrc={getImageUrl(editorImage.public_url || editorImage.path)}
          onClose={() => setEditorImage(null)}
          onSave={handleSaveEditedPhoto}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteConfirmation !== null}
        title="Delete Image?"
        message="This will permanently remove this image from your portfolio. This action cannot be undone."
        confirmLabel="Delete Image"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmation(null)}
      />

      {/* ─── Zone 1: Header ─────────────────────────────────── */}
      <motion.div
        className="studio-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div>
          <h1 className="studio-title">Portfolio</h1>
          <p className="studio-subtitle">Your images. Your comp card.</p>
        </div>
        <div>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={handleFileUpload}
            className="file-input-hidden"
            id="media-upload"
            disabled={isUploading}
          />
          <label
            htmlFor="media-upload"
            className={`studio-upload-btn ${isUploading ? 'studio-upload-btn--disabled' : ''}`}
          >
            <Plus size={16} />
            <span>{isUploading ? 'Uploading...' : 'Upload Images'}</span>
          </label>
        </div>
      </motion.div>

      <motion.div
        className="studio-setbar"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="studio-setbar__left">
          <span className="studio-setbar__label">Image Set</span>
          <select
            className="studio-setbar__select"
            value={selectedSetId}
            onChange={(e) => setSelectedSetId(e.target.value)}
            disabled={isRefreshingSets}
          >
            <option value="">No sets yet</option>
            {mediaSets.map((setRow) => (
              <option key={setRow.id} value={setRow.id}>
                {setRow.name || setRow.kind}
                {setRow.name ? ` (${setRow.kind})` : ''}
                {setRow.is_current ? ' - current' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="studio-setbar__actions">
          <button type="button" className="studio-setbar__btn" onClick={handleCreateSet}>
            New Set
          </button>
          <button
            type="button"
            className="studio-setbar__btn studio-setbar__btn--primary"
            onClick={handleSetCurrent}
            disabled={!selectedSetId}
          >
            Make Current
          </button>
        </div>
      </motion.div>

      {/* ─── Zone 2: Readiness Bar ──────────────────────────── */}
      <ReadinessBar images={localImages} />

      {/* ─── Zone 3: Two-Column Workspace ───────────────────── */}
      <div className="studio-workspace">
        
        {/* Left: Image Grid */}
        <div className="studio-grid-area">
          {isLoading ? (
            <div className="studio-grid">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="portfolio-image-card skeleton-media-card">
                  <div className="skeleton-media-image"></div>
                </div>
              ))}
            </div>
          ) : localImages.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localImages.map(img => img.id)}
                strategy={rectSortingStrategy}
              >
                <div className="studio-grid">
                  {localImages.map((image, index) => (
                    <motion.div
                      key={image.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <PortfolioImage
                        image={image}
                        onDelete={handleDelete}
                        onEdit={setEditingImage}
                        onSetPrimary={handleSetPrimary}
                        settingHeroId={settingHeroId}
                      />
                    </motion.div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <motion.div
              className="studio-empty"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="studio-empty__dropzone">
                <div className="studio-empty__icon">
                  <Upload size={28} strokeWidth={1.5} />
                </div>
                <h3 className="studio-empty__title">Start Your Portfolio</h3>
                <p className="studio-empty__description">
                  Upload professional images that represent your best work.
                  <br />
                  These will appear across your profile, comp cards, and agency submissions.
                </p>
                <label htmlFor="media-upload" className="studio-upload-btn">
                  <Plus size={16} />
                  <span>Upload Images</span>
                </label>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right: Comp Card Sidebar */}
        <aside className="studio-sidebar">
          <CompCardPreview images={localImages} />
        </aside>

      </div>
    </div>
  );
}
