import { useQuery } from '@tanstack/react-query';
import { publicApi } from '../../domains/talent/api/public';

export function useReferenceLanguages() {
  return useQuery({
    queryKey: ['reference-languages'],
    queryFn: () => publicApi.getLanguages(),
    staleTime: 1000 * 60 * 60,
  });
}
