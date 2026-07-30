import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

const reportReactError = vi.fn();

vi.mock('../../lib/error-monitoring', () => ({
  reportReactError: (...args) => reportReactError(...args),
}));

const technicalError = new Error(
  'DATABASE_SETUP_REQUIRED at InternalWidget (/Users/private/src/InternalWidget.jsx:42)',
);

function BrokenChild() {
  throw technicalError;
}

function HealthyChild() {
  return <div>Healthy child</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    reportReactError.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    console.error.mockRestore?.();
  });

  test('shows a safe production fallback and reports the technical error', () => {
    vi.stubEnv('DEV', false);

    render(
      <ErrorBoundary boundary="app-root">
        <BrokenChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(
      screen.getByText("We couldn't display this page. Try again, or reload the page."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(
      screen.queryByText(/DATABASE_SETUP_REQUIRED|InternalWidget|Users\/private/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Error details')).not.toBeInTheDocument();

    expect(reportReactError).toHaveBeenCalledWith(
      technicalError,
      expect.objectContaining({
        componentStack: expect.stringContaining('BrokenChild'),
      }),
      { boundary: 'app-root' },
    );
  });

  test('keeps detailed diagnostics available in development', () => {
    vi.stubEnv('DEV', true);

    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>,
    );

    expect(screen.getAllByText(/DATABASE_SETUP_REQUIRED/).length).toBeGreaterThan(0);
    expect(screen.getByText('Error details')).toBeInTheDocument();
    expect(reportReactError).toHaveBeenCalled();
  });

  test('Try again resets the boundary and remounts children', () => {
    vi.stubEnv('DEV', false);

    let shouldThrow = true;
    function FlakyChild() {
      if (shouldThrow) {
        throw technicalError;
      }
      return <HealthyChild />;
    }

    render(
      <ErrorBoundary>
        <FlakyChild />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('Healthy child')).toBeInTheDocument();
  });
});
