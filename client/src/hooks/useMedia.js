import { useMutation, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../api/talent';
import { useFlash } from './useFlash';
import { useAuth } from './useAuth';

export function useMedia() {
  const queryClient = useQueryClient();
  const { flash } = useFlash();
  const { images, profile, isLoading } = useAuth(); // Images come from auth context

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
    onSuccess: (data) => {
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
    onError: (err) => flash('error', 'Reorder failed')
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

  return {
    images: images || [],
    heroId: images?.find(img => img.is_primary)?.id,
    isLoading,
    isUploading: uploadMutation.isPending,
    upload: uploadMutation.mutateAsync,
    deleteImage: deleteMutation.mutateAsync,
    reorder: reorderMutation.mutateAsync,
    setHero: setHeroMutation.mutateAsync,
    replaceImage: async (oldId, newBlob) => {
      // 1. Upload new image
      const formData = new FormData();
      formData.append('media', newBlob, 'edited.jpg');
      const uploadRes = await uploadMutation.mutateAsync(formData);
      const newImage = uploadRes.images[0];

      // 2. Get old image details
      const oldImage = images.find(img => img.id === oldId);
      
      if (oldImage && newImage) {
        // 3. Copy metadata
        if (oldImage.metadata) {
          await talentApi.updateMedia(newImage.id, { metadata: oldImage.metadata });
        }

        // 4. Update hero if needed
        if (profile?.hero_image_path === oldImage.path) {
          await setHeroMutation.mutateAsync(newImage.id);
        }

        // 5. Delete old image
        await deleteMutation.mutateAsync(oldId);
      }
      return newImage;
    }
  };
}
