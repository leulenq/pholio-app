import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, test, expect, beforeEach } from 'vitest';

vi.mock('framer-motion', () => {
  const tagCache = new Map();
  const passthroughFor = (tag) => {
    if (!tagCache.has(tag)) {
      const Tag = tag;
      const Passthrough = ({ children, ...props }) => <Tag {...props}>{children}</Tag>;
      Passthrough.displayName = `motion.${tag}`;
      tagCache.set(tag, Passthrough);
    }
    return tagCache.get(tag);
  };
  return {
    motion: new Proxy({}, { get: (_target, tag) => passthroughFor(String(tag)) }),
    AnimatePresence: ({ children }) => <>{children}</>,
    useReducedMotion: () => false,
  };
});

vi.mock('../../../../../shared/lib/firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock('../../../../auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'talent@example.com' } }),
}));
vi.mock('../../../api/talent', () => ({
  talentApi: { createCheckoutSession: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { StudioMovement } = await import('../index');
const { STUDIO_LEDE, portalReturnStatus } = await import('../studioCopy');
const { talentApi } = await import('../../../api/talent');
const { toast } = await import('sonner');

const FREE = {
  planName: 'Free',
  status: 'free',
  isPro: false,
  isTrialing: false,
  priceLabel: '$0',
  priceUnit: '/month',
  renewalDate: null,
  trialEndDate: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
};

/** MemoryRouter never touches window.location, so the URL is read from here. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="search">{location.search}</span>;
}

function renderStudio({ route = '/dashboard/talent/settings/subscription', subscription = FREE } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <StudioMovement settings={{ subscription }} isLoading={false} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Studio+ membership section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('lede copy', () => {
    test('sells craft only — never submission volume or reach', () => {
      expect(STUDIO_LEDE).toBe(
        'Premium comp-card themes and 90-day portfolio analytics. Nothing an agency sees or receives changes with it.',
      );
      expect(STUDIO_LEDE).not.toMatch(/submission volume/i);
      expect(STUDIO_LEDE).not.toMatch(/unlimited/i);
      expect(STUDIO_LEDE).not.toMatch(/reach|ranking|priority/i);
    });

    test('is the lede actually rendered on the section', () => {
      renderStudio();
      expect(screen.getByText(STUDIO_LEDE)).toBeInTheDocument();
    });
  });

  describe('portal return (?billing=portal-return)', () => {
    test('states what is now true and strips the query param', async () => {
      renderStudio({
        route: '/dashboard/talent/settings/subscription?billing=portal-return',
        subscription: { ...FREE, status: 'canceled', planName: 'Free' },
      });

      const status = await screen.findByTestId('portal-return-status');
      expect(status).toHaveTextContent(/Studio\+ is canceled/i);
      expect(status).toHaveTextContent(/free plan/i);
      // No celebration, no win-back.
      expect(status).not.toHaveTextContent(/sorry|we'll miss|come back|welcome/i);

      // The param is consumed — a refresh must not re-announce a stale state —
      // while the status line, captured before the strip, stays on screen.
      await waitFor(() => {
        expect(screen.getByTestId('search').textContent).toBe('');
      });
      expect(screen.getByTestId('portal-return-status')).toBeInTheDocument();
    });

    test('is not shown on an ordinary visit', () => {
      renderStudio();
      expect(screen.queryByTestId('portal-return-status')).not.toBeInTheDocument();
    });
  });

  describe('jurisdiction-blocked checkout (403 region_unavailable)', () => {
    async function runCheckout(rejection) {
      const user = userEvent.setup();
      talentApi.createCheckoutSession.mockRejectedValue(rejection);
      renderStudio();

      await user.click(screen.getByRole('button', { name: /start studio\+/i }));
      await user.click(await screen.findByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: /start trial/i }));
    }

    test('renders the refusal on the page instead of a vanishing toast', async () => {
      const message =
        "Studio+ subscriptions aren't offered in California yet — legal review of " +
        "California's talent-services rules is still pending, so we've held the paid " +
        'tier back rather than sell into it. Nothing else changes: your profile, ' +
        'portfolio, comp card, and agency submissions are free and stay fully available.';

      await runCheckout(
        Object.assign(new Error(message), {
          name: 'ApiError',
          status: 403,
          data: { code: 'region_unavailable', region: 'CA', error: message },
        }),
      );

      const blocked = await screen.findByTestId('checkout-blocked');
      expect(blocked).toHaveTextContent(/aren't offered in California yet/i);
      expect(blocked).toHaveTextContent(/free and stay fully available/i);
      expect(toast.error).not.toHaveBeenCalled();
    });

    test('an ordinary checkout failure still uses the toast path', async () => {
      await runCheckout(
        Object.assign(new Error('Stripe is down'), { name: 'ApiError', status: 500, data: {} }),
      );

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Stripe is down'));
      expect(screen.queryByTestId('checkout-blocked')).not.toBeInTheDocument();
    });
  });

  describe('portalReturnStatus copy', () => {
    test('a scheduled cancellation states the end date and that no charge follows', () => {
      const line = portalReturnStatus({
        ...FREE,
        isPro: true,
        status: 'active',
        cancelAtPeriodEnd: true,
        renewalDate: '2026-09-01T00:00:00.000Z',
      });
      expect(line).toMatch(/set to end/i);
      expect(line).toMatch(/won't be charged again/i);
    });

    test('an active subscription states the renewal date and price', () => {
      const line = portalReturnStatus({
        ...FREE,
        isPro: true,
        status: 'active',
        renewalDate: '2026-09-01T00:00:00.000Z',
        renewalLabel: '$9.99/month',
      });
      expect(line).toMatch(/renews/i);
      expect(line).toMatch(/\$9\.99\/month/);
    });

    test('a trial states when it ends and what follows', () => {
      const line = portalReturnStatus({
        ...FREE,
        isPro: true,
        isTrialing: true,
        status: 'trialing',
        trialEndDate: '2026-09-01T00:00:00.000Z',
        renewalLabel: '$9.99/month',
      });
      expect(line).toMatch(/trial ends/i);
      expect(line).toMatch(/\$9\.99\/month/);
    });

    test('an unresolved subscription says so instead of guessing', () => {
      expect(portalReturnStatus(null)).toMatch(/checking your billing status/i);
    });
  });
});
