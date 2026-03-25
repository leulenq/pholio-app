import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../shared/lib/api-client';

export const useRecentPhotos = () => {
  return useQuery({
    queryKey: ['media', 'recent'],
    queryFn: async () => {
      // Endpoint returns { success: true, images: [...] }
      const data = await apiClient.get('/media/recent');
      return data.images || [];
    },
    staleTime: 60000, // 1 minute
    retry: 1
  });
};
