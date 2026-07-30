import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CastingCallPage from '../CastingCallPage';

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const componentCache = new Map();
  const motionOnlyProps = new Set([
    'animate',
    'exit',
    'initial',
    'layoutId',
    'transition',
    'variants',
    'whileHover',
    'whileTap',
  ]);
  const motion = new Proxy({}, {
    get: (_target, tag) => {
      if (!componentCache.has(tag)) {
        componentCache.set(tag, ReactModule.forwardRef(function MotionElement(props, ref) {
          const domProps = Object.fromEntries(
            Object.entries(props).filter(([key]) => !motionOnlyProps.has(key)),
          );
          return ReactModule.createElement(tag, { ...domProps, ref });
        }));
      }
      return componentCache.get(tag);
    },
  });

  return {
    AnimatePresence: ({ children }) => children,
    motion,
  };
});

vi.mock('../CastingEntry', () => ({
  default: ({ onComplete }) => (
    <button
      type="button"
      onClick={() => onComplete({
        method: 'google',
        name: 'Ava Martinez',
        email: 'ava@example.com',
        picture: '',
        date_of_birth: '2001-04-12',
        manualData: { name: 'Ava Martinez' },
      })}
    >
      Complete entry
    </button>
  ),
}));

vi.mock('../CastingGender', () => ({
  default: () => <div>Identity step</div>,
}));

vi.mock('../CastingScout', () => ({
  default: () => <div>Digitals step</div>,
}));

vi.mock('../CastingMeasurements', () => ({
  default: () => <div>Stats step</div>,
}));

vi.mock('../CastingProfile', () => ({
  default: () => <div>Details step</div>,
}));

vi.mock('../CastingVerifyEmail', () => ({
  default: () => <div>Verify email</div>,
}));

vi.mock('../AcknowledgmentBeat', () => ({
  default: () => null,
}));

vi.mock('../../hooks/useCasting', () => ({
  useCastingComplete: () => ({ mutateAsync: vi.fn() }),
  useCastingStatus: () => ({
    data: {
      profile: {},
      state: { current_step: 'entry', step_data: {} },
      user: {},
    },
    error: null,
    isLoading: false,
  }),
}));

vi.mock('../../../../shared/hooks/useBrandedStripeCheckout', () => ({
  useBrandedStripeCheckout: () => ({
    handoffOpen: false,
    redirectToCheckout: vi.fn(),
  }),
}));

vi.mock('../../../../shared/components/SubscriptionCheckoutDisclosure', () => ({
  SubscriptionCheckoutModal: () => null,
}));

vi.mock('../../../../shared/components/billing/CheckoutHandoff', () => ({
  default: () => null,
}));

describe('CastingCallPage entry continuation', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('continues from the entry DOB gate to Identity without a second birthdate scene', async () => {
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <CastingCallPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Complete entry' }));
    expect(await screen.findByText(/Good to meet you/i)).toBeInTheDocument();

    fireEvent.pointerDown(window);

    expect(await screen.findByText('Identity step')).toBeInTheDocument();
    expect(screen.queryByText('Birthdate')).not.toBeInTheDocument();
  });
});
