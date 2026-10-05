import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import IntelPage from '../index';

vi.mock('../../../hooks/useIntel', () => ({
  useIntel: () => ({
    // The old Intel payload: what a not-yet-restarted API still returns.
    placement: { meta: { tier: 'free', days: 7 }, decisions: [], submissions: {} },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

describe('IntelPage', () => {
  test('an unrecognised payload shows the retry state instead of crashing', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <IntelPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Intel could not load.');
  });
});
