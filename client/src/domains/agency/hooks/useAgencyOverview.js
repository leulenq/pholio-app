import { useQuery } from '@tanstack/react-query';
import { getAgencyOverview, getRecentApplicants } from '../api/agency';

export function useAgencyOverview() {
  return useQuery({
    queryKey: ['agency', 'overview'],
    queryFn: getAgencyOverview,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useRecentApplicants(limit = 6) {
  return useQuery({
    queryKey: ['agency', 'recent-applicants', limit],
    queryFn: () => getRecentApplicants(limit),
    staleTime: 60 * 1000,
    retry: 1,
  });
}
