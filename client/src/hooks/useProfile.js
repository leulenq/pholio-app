import { useMutation, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../api/talent';
import { useAuth } from './useAuth';
import { useFlash } from './useFlash';

export function useProfile() {
  const { profile, images, isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();
  const { flash } = useFlash();

  const updateProfileMutation = useMutation({
    mutationFn: (data) => talentApi.updateProfile(data),
    onSuccess: (response) => {
      // Invalidate and refetch auth/profile data
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
      flash('success', 'Profile updated successfully');
    },
    onError: (error) => {
      flash('error', error.message || 'Failed to update profile');
    }
  });

  return {
    profile,
    images,
    isLoading: isAuthLoading,
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdating: updateProfileMutation.isPending,
    error: updateProfileMutation.error
  };
}
