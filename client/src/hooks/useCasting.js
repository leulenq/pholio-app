/**
 * Casting Call API Hooks
 * React Query hooks for casting call flow
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const CASTING_BASE_URL = '/onboarding';

/**
 * Fetch wrapper for casting endpoints
 */
async function castingRequest(endpoint, options = {}) {
  const url = `${CASTING_BASE_URL}${endpoint}`;

  const config = {
    credentials: 'include',
    ...options,
    headers: {
      'Accept': 'application/json',
      ...(!(options.body instanceof FormData) && { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const errorData = await response.json();
      message = errorData.error?.message || errorData.message || errorData.error || message;
    } catch (e) {
      // Fallback for non-JSON errors (like standard 500 HTML pages)
      message = `Server error (${response.status}): ${response.statusText || 'Internal Server Error'}`;
    }
    
    console.error(`[Casting Hook] Error at ${endpoint}:`, message);
    throw new Error(message);
  }

  return response.json();
}

/**
 * Hook: Get casting status
 * Polls current onboarding state
 */
export function useCastingStatus(enabled = true) {
  return useQuery({
    queryKey: ['casting', 'status'],
    queryFn: () => castingRequest('/status'),
    enabled,
    refetchInterval: 5000, // Poll every 5s
    refetchIntervalInBackground: false
  });
}

/**
 * Hook: Entry step (OAuth authentication)
 */
export function useCastingEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data) => {
      return castingRequest('/entry', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      // Invalidate status to refetch
      queryClient.invalidateQueries({ queryKey: ['casting', 'status'] });
    }
  });
}

/**
 * Hook: Scout step (photo upload)
 */
export function useCastingScout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData) => {
      return castingRequest('/scout', {
        method: 'POST',
        body: formData // FormData instance
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting', 'status'] });
    }
  });
}

/**
 * Hook: Scout step (set primary photo)
 */
export function useCastingPrimarySwap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ imageId }) => {
      return castingRequest('/scout/primary', {
        method: 'PATCH',
        body: JSON.stringify({ imageId })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting', 'status'] });
    }
  });
}

/**
 * Hook: Scout step (confirm primary and analyze)
 */
export function useCastingConfirm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return castingRequest('/scout/confirm', {
        method: 'POST'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting', 'status'] });
    }
  });
}

/**
 * Hook: Vibe step (psychographic questions)
 */
export function useCastingVibe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (answers) => {
      return castingRequest('/vibe', {
        method: 'POST',
        body: JSON.stringify(answers)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting', 'status'] });
    }
  });
}

/**
 * Hook: Measurements step (confirm/adjust Scout predictions)
 */
export function useCastingMeasurements() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (measurements) => {
      return castingRequest('/measurements', {
        method: 'POST',
        body: JSON.stringify(measurements)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting', 'status'] });
    }
  });
}

/**
 * Hook: Profile step (location and experience)
 */
export function useCastingProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileData) => {
      return castingRequest('/profile', {
        method: 'POST',
        body: JSON.stringify(profileData)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting', 'status'] });
    }
  });
}

/**
 * Hook: Reveal step
 */
export function useCastingReveal() {
  return useQuery({
    queryKey: ['casting', 'reveal'],
    queryFn: () => castingRequest('/reveal'),
    enabled: false, // Only fetch when explicitly requested
    retry: false
  });
}

/**
 * Hook: Reveal complete (mark reveal as viewed)
 */
export function useCastingRevealComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return castingRequest('/reveal-complete', {
        method: 'POST'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting', 'status'] });
    }
  });
}

/**
 * Hook: Complete casting call
 */
export function useCastingComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return castingRequest('/complete', {
        method: 'POST'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting', 'status'] });
    }
  });
}
