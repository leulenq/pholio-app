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
import { Trash2, Plus, Edit2, EyeOff, Upload } from 'lucide-react';
import { toast } from 'sonner';
import ReadinessBar from './ReadinessBar';
import CompCardPreview from './CompCardPreview';
import ImageMetadataModal from './ImageMetadataModal';
import PhotoEditorModal from './PhotoEditorModal';
import ConfirmationDialog from '../../../shared/components/ui/ConfirmationDialog';
import './MediaGallery.css';

/* ─── Portfolio Image Card ─────────────────────────────────── */
function PortfolioImage({ image, onDelete, onEdit }) {
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

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return path.startsWith('/') ? path : `/uploads/${path}`;
  };

  const isPrivate = image.metadata?.visibility === 'private';
  const cardRole = image.metadata?.role || null;

  const roleBadgeColors = {
    headshot:  { bg: '#C9A55A', label: 'Headshot' },
    full_body: { bg: '#2563EB', label: 'Full Body' },
    editorial: { bg: '#7C3AED', label: 'Editorial' },
    lifestyle: { bg: '#059669', label: 'Lifestyle' },
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="portfolio-image-card group"
      title="Drag to reorder"
    >
      {/* The Image */}
      <img
        src={getImageUrl(image.path)}
        alt="Portfolio"
        className={`portfolio-image ${isPrivate ? 'opacity-75 grayscale' : ''}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        {...attributes}
        {...listeners}
      />

      {/* Role Badge */}
      {cardRole && roleBadgeColors[cardRole] && (
        <div className="role-badge" style={{ background: roleBadgeColors[cardRole].bg }}>
          {roleBadgeColors[cardRole].label}
        </div>
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
  const { images, heroId, upload, deleteImage, reorder, setHero, replaceImage, isUploading, isLoading } = useMedia();
  const [localImages, setLocalImages] = React.useState(images);
  const [editingImage, setEditingImage] = React.useState(null);
  const [editorImage, setEditorImage] = React.useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = React.useState(null);

  React.useEffect(() => {
    setLocalImages(images);
  }, [images]);

  React.useEffect(() => {
    document.title = 'Portfolio | Pholio';
  }, []);

  // Optimistic update for metadata
  const handleUpdateMetadata = (id, newMetadata) => {
    setLocalImages(prev => prev.map(img => 
      img.id === id ? { ...img, metadata: newMetadata } : img
    ));
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
    if (active.id !== over.id) {
      const oldIndex = localImages.findIndex((item) => item.id === active.id);
      const newIndex = localImages.findIndex((item) => item.id === over.id);
      const newOrder = arrayMove(localImages, oldIndex, newIndex);
      setLocalImages(newOrder);
      const ids = newOrder.map(img => img.id);
      await reorder(ids);
    }
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('media', files[i]);
    }
    try {
      await upload(formData);
    } finally {
      e.target.value = null;
    }
  };

  const handleDelete = (id) => {
    setDeleteConfirmation(id);
  };

  const confirmDelete = async () => {
    if (deleteConfirmation) {
      await deleteImage(deleteConfirmation);
      setDeleteConfirmation(null);
    }
  };

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return path.startsWith('/') ? path : `/uploads/${path}`;
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
        />
      )}

      {/* Editor Modal */}
      {editorImage && (
        <PhotoEditorModal
          imageSrc={getImageUrl(editorImage.path)}
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
            accept="image/png, image/jpeg, image/webp"
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
          <CompCardPreview images={localImages} heroId={heroId} />
        </aside>

      </div>
    </div>
  );
}
