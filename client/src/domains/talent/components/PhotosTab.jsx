import React, { useState, useEffect, useRef } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../api/talent';
import { useAuth } from '../../auth/hooks/useAuth';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_FILES = 12;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/** Prefer CDN/public URL; fall back to stored path (relative or absolute). */
function resolveTalentImageUrl(img) {
  if (!img) return '';
  const raw = typeof img === 'string' ? img : img.public_url || img.path || '';
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return `/uploads/${value.replace(/^\/+/, '')}`;
}

function mapImagesToPhotos(images) {
  return (images || []).map((img) => ({
    id: img.id,
    url: resolveTalentImageUrl(img),
    isPrimary: !!img.is_primary,
    isTemp: false,
  }));
}

function normalizeMime(file) {
  const t = (file.type || '').toLowerCase().trim();
  if (t === 'image/jpg') return 'image/jpeg';
  return t;
}

function isAllowedImageFile(file) {
  const mime = normalizeMime(file);
  if (ALLOWED_MIME.has(mime)) return true;
  const name = (file.name || '').toLowerCase();
  return /\.(jpe?g|png|webp)$/.test(name);
}

/**
 * @param {File[]} files
 * @returns {{ valid: File[], invalid: { name: string; reason: string }[] }}
 */
function partitionUploadFiles(files) {
  const valid = [];
  const invalid = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (index >= MAX_UPLOAD_FILES) {
      invalid.push({
        name: file.name || 'Unknown file',
        reason: `A maximum of ${MAX_UPLOAD_FILES} files can be uploaded at once`,
      });
      continue;
    }
    if (!isAllowedImageFile(file)) {
      invalid.push({ name: file.name || 'Unknown file', reason: 'Only JPEG, PNG, and WebP are allowed' });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      invalid.push({ name: file.name || 'Unknown file', reason: 'Each file must be 5MB or smaller' });
      continue;
    }
    valid.push(file);
  }
  return { valid, invalid };
}

function showValidationToasts(invalid) {
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

export const PhotosTab = ({ onPhotoUploaded }) => {
  const queryClient = useQueryClient();
  const { images: authImages } = useAuth();
  const [photos, setPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef(null);
  const [settingHeroId, setSettingHeroId] = useState(null);

  useEffect(() => {
    if (!Array.isArray(authImages)) return;
    setPhotos(mapImagesToPhotos(authImages));
  }, [authImages]);

  const resyncPhotosFromServer = async () => {
    const data = await talentApi.getProfile();
    if (data?.images) {
      setPhotos(mapImagesToPhotos(data.images));
    }
  };

  const handleDelete = async (photoId) => {
    const snapshot = photos.map((p) => ({ ...p }));
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, pendingDelete: true } : p))
    );
    try {
      await talentApi.deleteMedia(photoId);

      setPhotos((prev) => prev.filter((p) => p.id !== photoId));

      await queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'auth-user',
      });

      toast.success('Photo removed');
    } catch (error) {
      console.error('Delete failed', error);
      setPhotos(snapshot);
      try {
        await resyncPhotosFromServer();
      } catch (refetchErr) {
        console.error('Failed to resync photos after delete error', refetchErr);
      }
      toast.error('Failed to delete photo');
    }
  };

  const uploadValidatedFiles = async (validFiles) => {
    if (validFiles.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    validFiles.forEach((file) => {
      formData.append('media', file);
    });

    try {
      const res = await talentApi.uploadMedia(formData);
      const uploaded = Array.isArray(res?.images) ? res.images : [];
      const failed = Array.isArray(res?.failedFiles) ? res.failedFiles : [];
      if (uploaded.length === 0) {
        toast.error('Upload did not return any images');
        return;
      }

      const newPhotos = uploaded.map((img) => ({
        id: img.id,
        url: resolveTalentImageUrl(img),
        isPrimary: !!img.is_primary,
        isTemp: false,
      }));

      setPhotos((prev) => [...prev, ...newPhotos]);
      toast.success(
        uploaded.length > 1 ? `${uploaded.length} photos uploaded` : 'Photo uploaded'
      );
      if (failed.length > 0) {
        const failedNames = failed.slice(0, 3).map((item) => item.name).filter(Boolean);
        const moreCount = failed.length > 3 ? ` and ${failed.length - 3} more` : '';
        toast.warning(`${failed.length} file${failed.length > 1 ? 's' : ''} failed to upload`, {
          description: failedNames.length > 0 ? `${failedNames.join(', ')}${moreCount}` : undefined,
        });
      }

      await queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'auth-user',
      });
      await queryClient.refetchQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'auth-user',
      });

      const primary = uploaded.find((i) => i.is_primary) || uploaded[0];
      const heroUrlFromResponse =
        typeof res.heroImagePath === 'string'
          ? resolveTalentImageUrl({ path: res.heroImagePath, public_url: res.heroImagePath })
          : '';
      const heroUrl = resolveTalentImageUrl(primary) || heroUrlFromResponse;
      if (onPhotoUploaded && heroUrl) onPhotoUploaded(heroUrl);
    } catch (error) {
      console.error('Upload failed', error);
      toast.error('Failed to upload photo');
    } finally {
      setIsUploading(false);
    }
  };

  const runFileSelection = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const { valid, invalid } = partitionUploadFiles(files);
    showValidationToasts(invalid);
    await uploadValidatedFiles(valid);
  };

  const handleFileChange = async (e) => {
    const { files } = e.target;
    try {
      await runFileSelection(files);
    } finally {
      e.target.value = '';
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (!isUploading) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    if (isUploading) return;
    const dt = e.dataTransfer;
    if (!dt?.files?.length) return;
    await runFileSelection(dt.files);
  };

  const openFilePicker = () => {
    if (!isUploading) fileInputRef.current?.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-slate-900 font-display">Manage Photos</h2>
        <p className="text-sm text-slate-500">Add high-quality photos to your portfolio to stand out.</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={openFilePicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFilePicker();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-colors group ${
          isUploading
            ? 'opacity-50 cursor-not-allowed border-slate-300'
            : isDragOver
              ? 'border-[#C9A55A] bg-[#C9A55A]/10 ring-2 ring-[#C9A55A]/30'
              : 'border-slate-300 hover:border-[#C9A55A] hover:bg-slate-50'
        }`}
      >
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-[#C9A55A]/10 transition-colors">
          {isUploading ? (
            <Loader2 className="w-6 h-6 text-[#C9A55A] animate-spin" />
          ) : (
            <ImagePlus className="w-6 h-6 text-slate-400 group-hover:text-[#C9A55A] transition-colors" />
          )}
        </div>
        <p className="text-slate-600 font-medium mb-1">
          {isUploading ? 'Uploading...' : isDragOver ? 'Drop photos to upload' : 'Drag & drop photos here, or click to select files'}
        </p>
        <p className="text-xs text-slate-400">Supports JPG, PNG, WebP up to 5MB</p>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-medium text-slate-900 mb-4 uppercase tracking-wider">Your Portfolio</h3>

        {photos.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-100">
            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <ImagePlus className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-900 font-medium">No photos yet</p>
            <p className="text-sm text-slate-500 mt-1">Upload your best shots to get discovered.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo) => {
              const isDeleting = !!photo.pendingDelete;
              const isSettingHero = settingHeroId === photo.id;
              const rowBusy = isDeleting || isSettingHero;

              return (
                <div
                  key={photo.id}
                  className="aspect-[3/4] bg-slate-100 rounded-lg border border-slate-200 relative group overflow-hidden"
                >
                  <img src={photo.url} alt="Portfolio" className="w-full h-full object-cover" />

                  {photo.isPrimary && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-[#C9A55A] text-white text-[10px] font-bold uppercase rounded shadow-sm z-10">
                      Primary
                    </div>
                  )}

                  {isDeleting && (
                    <div
                      className="absolute inset-0 bg-black/50 flex items-center justify-center z-20"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                  )}

                  <div
                    className={`absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 ${
                      rowBusy ? 'opacity-100 pointer-events-none' : ''
                    }`}
                  >
                    {!photo.isPrimary && (
                      <button
                        type="button"
                        disabled={rowBusy}
                        onClick={async () => {
                          const snapshot = photos.map((p) => ({ ...p }));
                          setSettingHeroId(photo.id);
                          setPhotos((prev) =>
                            prev.map((p) => ({
                              ...p,
                              isPrimary: p.id === photo.id,
                            }))
                          );
                          try {
                            await talentApi.setHeroImage(photo.id);
                            toast.success('Hero image updated');
                            queryClient.invalidateQueries({
                              predicate: (q) =>
                                Array.isArray(q.queryKey) && q.queryKey[0] === 'auth-user',
                            });
                            if (onPhotoUploaded) onPhotoUploaded(photo.url);
                          } catch {
                            setPhotos(snapshot);
                            toast.error('Failed to update hero');
                          } finally {
                            setSettingHeroId(null);
                          }
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white text-slate-900 text-xs font-medium rounded-lg hover:bg-[#C9A55A] hover:text-white transition-colors disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
                      >
                        {isSettingHero ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>Setting…</span>
                          </>
                        ) : (
                          'Set as Primary'
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => handleDelete(photo.id)}
                      className="p-1.5 bg-white/20 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed inline-flex items-center justify-center"
                      title="Remove photo"
                      aria-label="Remove photo"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <X size={16} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotosTab;
