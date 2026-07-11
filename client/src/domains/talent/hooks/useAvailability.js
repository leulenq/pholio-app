import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { talentApi } from '../api/talent';

/**
 * Availability + bookouts (Discover WS9 talent-side surfaces).
 * apiClient already unwraps { success, data } → data.
 */
export function useAvailability() {
  return useQuery({
    queryKey: ['talent-availability'],
    queryFn: () => talentApi.getAvailability(),
    staleTime: 1000 * 60,
  });
}

export function useBookouts() {
  return useQuery({
    queryKey: ['talent-bookouts'],
    queryFn: () => talentApi.getBookouts(),
    staleTime: 1000 * 60,
  });
}

export function useUpdateAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status) => talentApi.updateAvailability(status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-availability'] });
    },
  });
}

export function useCreateBookout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => talentApi.createBookout(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-bookouts'] });
    },
  });
}

export function useDeleteBookout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => talentApi.deleteBookout(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-bookouts'] });
    },
  });
}
