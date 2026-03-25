import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../shared/lib/api-client';

export const useStats = () => {
  return useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: async () => {
      // apiClient.get automatically parses JSON
      return await apiClient.get('/analytics/summary');
    },
    staleTime: 300000, // 5 minutes
    retry: 1
  });
};
