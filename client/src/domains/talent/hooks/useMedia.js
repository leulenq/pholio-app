import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { talentApi } from '../api/talent';
import { useFlash } from '../../../shared/hooks/useFlash';
import { useAuth } from '../../auth/hooks/useAuth';
import { TALENT_NOTIFICATIONS_QUERY_KEY } from '../../../shared/components/NotificationCenter/NotificationCenter';

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
      queryClient.invalidateQueries({ queryKey: TALENT_NOTIFICATIONS_QUERY_KEY });
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

  const fetchSets = useCallback(() => talentApi.getMediaSets(), []);

  const replaceImage = async (id, blob) => {
    if (replacingRef.current) {
      throw new Error('A photo replace is already in progress');
    }
    replacingRef.current = true;
    try {
      const ext = (blob?.type || '').includes('png') ? 'png'
        : (blob?.type || '').includes('webp') ? 'webp'
        : 'jpg';
      const formData = new FormData();
      formData.append('media', blob, `edited.${ext}`);
      const res = await talentApi.replaceImageFile(id, formData);
      await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      await queryClient.refetchQueries({ queryKey: ['auth-user'] });
      flash('success', 'Image updated');
      return res.image;
    } finally {
      replacingRef.current = false;
    }
  };

  const restoreImage = async (id) => {
    const res = await talentApi.restoreImageOriginal(id);
    await queryClient.invalidateQueries({ queryKey: ['auth-user'] });
    await queryClient.refetchQueries({ queryKey: ['auth-user'] });
    flash('success', 'Original restored');
    return res.image;
  };

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
    replaceImage,
    restoreImage,
  };
}
