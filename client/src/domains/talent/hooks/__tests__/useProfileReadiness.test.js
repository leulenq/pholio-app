import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useProfileReadiness } from '../useProfileReadiness';

const mockUseAuth = vi.fn();

vi.mock('../../../auth/hooks/useAuth', () => ({
  useAuth: (...args) => mockUseAuth(...args),
}));

const COMPLETE_PROFILE = {
  first_name: 'Nova',
  last_name: 'Lane',
  city: 'Paris',
  date_of_birth: '1998-04-02',
  gender: 'female',
  height_cm: 178,
  bust: 84,
  waist: 61,
  hips: 89,
};

describe('useProfileReadiness', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  test('takes the score of record from the backend completeness payload', () => {
    mockUseAuth.mockReturnValue({
      completeness: { percentage: 74, label: 'Strong', coreReady: true, isComplete: false, nextSteps: ['Add a bio'] },
      profile: COMPLETE_PROFILE,
      images: [],
      isLoading: false,
    });

    const { result } = renderHook(() => useProfileReadiness());

    expect(result.current.score).toBe(74);
    expect(result.current.label).toBe('Strong');
    expect(result.current.coreReady).toBe(true);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.nextSteps).toEqual(['Add a bio']);
    expect(result.current.isLoading).toBe(false);
  });

  test('derives the checklist client-side alongside the backend score', () => {
    mockUseAuth.mockReturnValue({
      completeness: { percentage: 74 },
      profile: COMPLETE_PROFILE,
      images: [],
      isLoading: false,
    });

    const { result } = renderHook(() => useProfileReadiness());

    expect(result.current.fieldCompletion).toMatchObject({ name: true, city: true, height: true });
    expect(Array.isArray(result.current.topGaps)).toBe(true);
    expect(typeof result.current.totalGaps).toBe('number');
    // Digitals are still missing, so the required tier is not satisfied.
    expect(result.current.isRequiredComplete).toBe(false);
  });

  test('falls back to a zero score before the session payload lands', () => {
    mockUseAuth.mockReturnValue({ completeness: null, profile: null, images: null, isLoading: true });

    const { result } = renderHook(() => useProfileReadiness());

    expect(result.current.score).toBe(0);
    expect(result.current.label).toBe('Beginner');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isRequiredComplete).toBe(false);
  });
});
