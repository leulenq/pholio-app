import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../../talent/api/talent';

/**
 * useAuth Hook
 * Fetches user profile for auth context and initial data load
 */
export function useAuth(options = {}) {
  const queryClient = useQueryClient();

  const updateProfileMutation = useMutation({
    mutationFn: (data) => talentApi.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-user'] });
    },
  });

  const query = useQuery({
    queryKey: ['auth-user', options.skipRedirect],
    queryFn: async () => {
      const response = await talentApi.getProfile(options);
      // Expect response structure: { user, profile, images, completeness, ... }
      return response;
    },
    // Enable refetch on window focus to show fresh data after saves
    refetchOnWindowFocus: true,
    // Always check if data is stale when component mounts
    refetchOnMount: 'always',
    // Disable retries and redirects if we are specifically asking to skip them
    // This is crucial for the Login page to prevent loops
    retry: options.skipRedirect ? false : 1,
    staleTime: 1000 * 30,
  });

  return {
    ...query,
    user: query.data?.user,
    profile: query.data?.profile,
    images: query.data?.images,
    subscription: query.data?.subscription,
    completeness: query.data?.completeness,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data?.user,
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdatingProfile: updateProfileMutation.isPending,
  };
}
