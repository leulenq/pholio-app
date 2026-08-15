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

  test('exposes the 0-100 score alongside the existing checklist fields', () => {
    mockUseAuth.mockReturnValue({ profile: COMPLETE_PROFILE, images: [], isLoading: false });

    const { result } = renderHook(() => useProfileReadiness());

    expect(typeof result.current.score).toBe('number');
    expect(result.current.score).toBeGreaterThan(0);
    expect(result.current.score).toBeLessThanOrEqual(100);

    // Existing contract must survive the score being re-added.
    expect(result.current).toHaveProperty('isLoading', false);
    expect(result.current).toHaveProperty('fieldCompletion');
    expect(Array.isArray(result.current.topGaps)).toBe(true);
    expect(typeof result.current.totalGaps).toBe('number');
    expect(typeof result.current.missingRequiredCount).toBe('number');
    expect(typeof result.current.isRequiredComplete).toBe('boolean');
  });

  test('exposes the threshold band and its label', () => {
    mockUseAuth.mockReturnValue({ profile: COMPLETE_PROFILE, images: [], isLoading: false });

    const { result } = renderHook(() => useProfileReadiness());

    expect(result.current.threshold).toMatchObject({
      value: result.current.score,
      label: result.current.thresholdLabel,
    });
    expect(['In progress', 'Core complete', 'Submission-ready']).toContain(
      result.current.thresholdLabel,
    );
    expect(['ink', 'gold', 'celebration']).toContain(result.current.threshold.tone);
  });

  test('an empty profile scores zero and reads as in progress', () => {
    mockUseAuth.mockReturnValue({ profile: null, images: null, isLoading: true });

    const { result } = renderHook(() => useProfileReadiness());

    expect(result.current.score).toBe(0);
    expect(result.current.thresholdLabel).toBe('In progress');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isRequiredComplete).toBe(false);
  });
});
