import { useQuery } from '@tanstack/react-query';
import { talentApi } from '../api/talent';

/**
 * useIntel: the talent's placement read (GET /api/talent/intel). One composed
 * payload: filing, shots, agencies and the next five weeks.
 */
export function useIntel() {
  const query = useQuery({
    queryKey: ['talent-intel', 'placement'],
    queryFn: () => talentApi.getIntel(),
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  return {
    placement: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
