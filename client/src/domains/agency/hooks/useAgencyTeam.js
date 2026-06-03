import { useQuery } from '@tanstack/react-query';
import { getAgencyTeam } from '../api/agency';

export function useAgencyTeam() {
  return useQuery({
    queryKey: ['agency', 'team'],
    queryFn: getAgencyTeam,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    select: (data) => (Array.isArray(data) ? data : data?.members ?? []),
  });
}
