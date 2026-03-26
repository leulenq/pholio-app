import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { talentApi } from '../api/talent';
import { useFlash } from '../../../shared/hooks/useFlash';
import { useAuth } from '../../auth/hooks/useAuth';

export function useMedia() {
  const queryClient = useQueryClient();
  const { flash } = useFlash();
  const { images, isLoading } = useAuth(); // Images come from auth context
  const replacingRef = useRef(false);

  // Upload
  const uploadMutation = useMutation({
    mutationFn: (formData) => talentApi.uploadMedia(formData),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      flash('success', data.message || 'Images uploaded');
    },
    onError: (err) => flash('error', err.message || 'Upload failed')
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: (id) => talentApi.deleteMedia(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      flash('success', 'Image deleted');
    },
    onError: (err) => flash('error', err.message || 'Delete failed')
  });

  // Reorder
  const reorderMutation = useMutation({
    mutationFn: (imageIds) => talentApi.reorderMedia(imageIds),
    onSuccess: () => {
      // Optimistic update would be better but simple refetch is okay for now
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
    },
    onError: (err) => flash('error', err.message || 'Reorder failed')
  });

  // Set Hero
  const setHeroMutation = useMutation({
    mutationFn: (id) => talentApi.setHeroImage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      flash('success', 'Hero image updated');
    },
    onError: (err) => flash('error', err.message || 'Failed to set hero image')
  });

  const createSetMutation = useMutation({
    mutationFn: (payload) => talentApi.createMediaSet(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      queryClient.invalidateQueries({ queryKey: ['talent-media-sets'] });
      flash('success', data?.message || 'Media set created');
    },
    onError: (err) => flash('error', err.message || 'Failed to create media set')
  });

  const setCurrentSetMutation = useMutation({
    mutationFn: (setId) => talentApi.setCurrentMediaSet(setId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      queryClient.invalidateQueries({ queryKey: ['talent-media-sets'] });
      flash('success', data?.message || 'Current media set updated');
    },
    onError: (err) =>
      flash('error', err.message || 'Failed to set current media set')
  });

  const getLatestImages = () => {
    const entries = queryClient.getQueriesData({ queryKey: ['auth-user'] });
    for (const [, data] of entries) {
      if (Array.isArray(data?.images)) return data.images;
    }
    return images || [];
  };

  const fetchSets = useCallback(() => talentApi.getMediaSets(), []);

  return {
    images: images || [],
    heroId: images?.find((img) => img.is_primary)?.id,
    isLoading,
    isUploading: uploadMutation.isPending,
    upload: uploadMutation.mutateAsync,
    deleteImage: deleteMutation.mutateAsync,
    reorder: reorderMutation.mutateAsync,
    setHero: setHeroMutation.mutateAsync,
    fetchSets,
    createSet: createSetMutation.mutateAsync,
    setCurrentSet: setCurrentSetMutation.mutateAsync,
    replaceImage: async (oldId, newBlob) => {
      if (replacingRef.current) {
        throw new Error('A photo replace is already in progress');
      }
      replacingRef.current = true;
      try {
        // 0. Resolve old image first so we can preserve structured fields/rights
        let oldImage = getLatestImages().find((img) => img.id === oldId);
        if (!oldImage) {
          const latestProfile = await talentApi.getProfile();
          oldImage = latestProfile?.images?.find((img) => img.id === oldId);
        }
        if (!oldImage) {
          throw new Error('Original image no longer exists. Please refresh and try again.');
        }
        const oldSort =
          Number.isFinite(Number(oldImage.sort)) && Number(oldImage.sort) > 0
            ? Number(oldImage.sort)
            : null;

        // 1. Upload new image
        const formData = new FormData();
        const extByType = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
        };
        const ext = extByType[newBlob?.type] || 'jpg';
        formData.append('media', newBlob, `edited.${ext}`);
        const structuredKeys = [
          'image_type',
          'shot_type',
          'style_type',
          'status',
          'exclude_from_public',
          'exclude_from_agency',
          'captured_at',
          'retouched_at',
          'set_id',
        ];
        for (const key of structuredKeys) {
          const value = oldImage[key];
          if (value === undefined || value === null || value === '') continue;
          formData.append(key, String(value));
        }
        const uploadRes = await talentApi.uploadMedia(formData);
        const newImage = uploadRes?.images?.[0];
        if (!newImage) {
          const msg = uploadRes?.message;
          throw new Error(
            typeof msg === 'string' && msg.trim()
              ? msg
              : 'Replace upload did not return an image'
          );
        }

        // 2. Copy metadata
        if (oldImage.metadata) {
          try {
            await talentApi.updateMedia(newImage.id, { metadata: oldImage.metadata });
          } catch (err) {
            await talentApi.deleteMedia(newImage.id).catch(() => {});
            throw err;
          }
        }

        // 3. Copy rights row if present
        try {
          const rightsRes = await talentApi.getImageRights(oldId);
          const rights = rightsRes?.rights;
          if (rights && typeof rights === 'object') {
            await talentApi.updateImageRights(newImage.id, rights);
          }
        } catch {
          // Rights are best-effort; do not block replace if rights read/write fails.
        }

        // 4. Update hero if replaced image was primary
        if (oldImage.is_primary) {
          try {
            await talentApi.setHeroImage(newImage.id);
          } catch (err) {
            await talentApi.deleteMedia(newImage.id).catch(() => {});
            throw err;
          }
        }

        // 5. Delete old image (rollback hero/new image if this final step fails)
        try {
          await talentApi.deleteMedia(oldId);
        } catch (err) {
          if (oldImage.is_primary) {
            await talentApi.setHeroImage(oldId).catch(() => {});
          }
          await talentApi.deleteMedia(newImage.id).catch(() => {});
          throw err;
        }
        if (oldSort !== null) {
          try {
            const latestProfile = await talentApi.getProfile();
            const latestImages = Array.isArray(latestProfile?.images)
              ? [...latestProfile.images]
              : [];
            const currentIndex = latestImages.findIndex((img) => img.id === newImage.id);
            if (currentIndex >= 0) {
              const [moved] = latestImages.splice(currentIndex, 1);
              const targetIndex = Math.max(0, Math.min(oldSort - 1, latestImages.length));
              latestImages.splice(targetIndex, 0, moved);
              await talentApi.reorderMedia(latestImages.map((img) => img.id));
            }
          } catch {
            // Sort preservation is best-effort; keep replace successful.
          }
        }

        await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
        await queryClient.refetchQueries({ queryKey: ['auth-user'] });
        flash('success', 'Image updated');
        return newImage;
      } finally {
        replacingRef.current = false;
      }
    }
  };
}
