import { useQuery } from '@tanstack/react-query';
import { getBoards, getAgencyActivity } from '../api/agency';

export function useBoards() {
  return useQuery({
    queryKey: ['agency', 'boards'],
    queryFn: getBoards,
    staleTime: 60 * 1000,
    retry: 1,
    select: (data) => (Array.isArray(data) ? data : []),
  });
}

export function useAgencyActivity(limit = 7) {
  return useQuery({
    queryKey: ['agency', 'activity', limit],
    queryFn: () => getAgencyActivity(limit),
    staleTime: 60 * 1000,
    retry: 1,
    select: (data) => (Array.isArray(data) ? data : data?.data ?? []),
  });
}
