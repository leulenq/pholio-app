import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

import { VerifiedAdultSection } from '../VerifiedAdultSection';
import { talentApi } from '../../../api/talent';
import {
  AGE_VERIFICATION_STATES,
  describeFailure,
  formatVerifiedDate,
  isPollingStatus,
  nextPollDelay,
  resolveAgeVerificationState,
  verifiedProvenanceLine,
} from '../ageVerificationState';
import { calculateProfileStrength } from '../../../../../shared/utils/profileScoring';

vi.mock('framer-motion', () => {
  const tagCache = new Map();
  const passthroughFor = (tag) => {
    if (!tagCache.has(tag)) {
      const Tag = tag;
      const Passthrough = ({ children, ...props }) => {
        // Strip motion-only props so React does not warn about unknown DOM attrs.
        const { initial, animate, exit, transition, ...rest } = props;
        void initial;
        void animate;
        void exit;
        void transition;
        return <Tag {...rest}>{children}</Tag>;
      };
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

vi.mock('../../../api/talent', () => ({
  talentApi: {
    getAgeVerification: vi.fn(),
    createAgeVerificationSession: vi.fn(),
    getAdultContext: vi.fn(),
    updateAdultContext: vi.fn(),
  },
}));

vi.mock('../../../../../shared/lib/pholio-toast', () => ({
  pholioToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    fromFailure: vi.fn(),
  },
}));

const ADULT_DOB = '1995-05-15';

function verificationFixture(overrides = {}) {
  return {
    verifiedAdult: false,
    verifiedAt: null,
    status: 'not_started',
    failureCode: null,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-search">{location.search}</span>;
}

function renderSection({ dateOfBirth = ADULT_DOB, onEditDateOfBirth, route = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <VerifiedAdultSection
          dateOfBirth={dateOfBirth}
          onEditDateOfBirth={onEditDateOfBirth}
        />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

/** Opens the panel via the collapsed entry row's text link. */
async function openPanel(user, label) {
  const link = await screen.findByRole('button', { name: label });
  await user.click(link);
}

describe('resolveAgeVerificationState', () => {
  test('under 18 resolves to the minor state (the section renders nothing)', () => {
    expect(resolveAgeVerificationState({ age: 15 }).id).toBe(
      AGE_VERIFICATION_STATES.MINOR,
    );
  });

  test('missing date of birth resolves before any session status is consulted', () => {
    const state = resolveAgeVerificationState({
      age: null,
      verification: verificationFixture({ status: 'processing' }),
    });
    expect(state.id).toBe(AGE_VERIFICATION_STATES.DOB_MISSING);
    expect(state.showDobFix).toBe(true);
  });

  test('no prior session resolves to the locked explainer', () => {
    const state = resolveAgeVerificationState({ age: 30, verification: undefined });
    expect(state.id).toBe(AGE_VERIFICATION_STATES.LOCKED);
    expect(state.showExplainer).toBe(true);
    expect(state.actionLabel).toBe('Verify with Stripe');
    expect(state.actionVariant).toBe('primary');
  });

  test('processing polls; every settled state does not', () => {
    const processing = resolveAgeVerificationState({
      age: 30,
      verification: verificationFixture({ status: 'processing' }),
    });
    expect(processing.id).toBe(AGE_VERIFICATION_STATES.PROCESSING);
    expect(processing.isPolling).toBe(true);
    expect(processing.actionLabel).toBeNull();

    ['not_started', 'requires_input', 'canceled', 'failed', 'verified'].forEach((status) => {
      expect(isPollingStatus(status)).toBe(false);
    });
    expect(isPollingStatus('processing')).toBe(true);
  });

  test('requires_input carries the failure reason and a secondary retry', () => {
    const state = resolveAgeVerificationState({
      age: 30,
      verification: verificationFixture({
        status: 'requires_input',
        failureCode: 'document_expired',
      }),
    });
    expect(state.id).toBe(AGE_VERIFICATION_STATES.REQUIRES_INPUT);
    expect(state.statusLine).toBe('The document Stripe saw has expired.');
    expect(state.actionLabel).toBe('Try again');
    expect(state.actionVariant).toBe('secondary');
  });

  test('canceled is neutral and retryable', () => {
    const state = resolveAgeVerificationState({
      age: 30,
      verification: verificationFixture({ status: 'canceled' }),
    });
    expect(state.id).toBe(AGE_VERIFICATION_STATES.CANCELED);
    expect(state.statusLine).toMatch(/canceled before it finished/i);
    expect(state.actionLabel).toBe('Try again');
  });

  test('dob_mismatch offers both fix paths', () => {
    const state = resolveAgeVerificationState({
      age: 30,
      verification: verificationFixture({ status: 'failed', failureCode: 'dob_mismatch' }),
    });
    expect(state.id).toBe(AGE_VERIFICATION_STATES.DOB_MISMATCH);
    expect(state.showDobFix).toBe(true);
    expect(state.actionLabel).toBe('Try again');
  });

  test('other failures fall through to the generic failed state', () => {
    const state = resolveAgeVerificationState({
      age: 30,
      verification: verificationFixture({ status: 'failed', failureCode: 'under_18' }),
    });
    expect(state.id).toBe(AGE_VERIFICATION_STATES.FAILED);
    expect(state.statusLine).toBe(describeFailure('under_18'));
  });

  test('verifiedAdult wins over the session status', () => {
    const state = resolveAgeVerificationState({
      age: 30,
      verification: verificationFixture({
        verifiedAdult: true,
        verifiedAt: '2026-03-12',
        status: 'verified',
      }),
    });
    expect(state.id).toBe(AGE_VERIFICATION_STATES.VERIFIED);
    expect(state.showForm).toBe(true);
    expect(state.statusLine).toBe(
      'Verified 18+ · documents redacted by Stripe · March 12, 2026',
    );
  });

  test('a verified session with the flag cleared reads as DOB-edit invalidation', () => {
    // The backend's invalidateAdultVerification() clears adult_context only —
    // the age_verifications row keeps status 'verified'. The UI must not read
    // that stale row as "still verified".
    const state = resolveAgeVerificationState({
      age: 30,
      verification: verificationFixture({ verifiedAdult: false, status: 'verified' }),
    });
    expect(state.id).toBe(AGE_VERIFICATION_STATES.INVALIDATED);
    expect(state.showForm).toBe(false);
    expect(state.statusLine).toMatch(/date of birth changed/i);
    expect(state.actionLabel).toBe('Verify with Stripe');
  });

  test('every non-minor state has a plain-text status line', () => {
    const cases = [
      { age: null },
      { age: 30, verification: verificationFixture() },
      { age: 30, verification: verificationFixture({ status: 'processing' }) },
      { age: 30, verification: verificationFixture({ status: 'requires_input' }) },
      { age: 30, verification: verificationFixture({ status: 'canceled' }) },
      {
        age: 30,
        verification: verificationFixture({ status: 'failed', failureCode: 'dob_mismatch' }),
      },
      { age: 30, verification: verificationFixture({ status: 'failed' }) },
      { age: 30, verification: verificationFixture({ status: 'verified' }) },
      { age: 30, verification: verificationFixture({ verifiedAdult: true }) },
    ];
    cases.forEach((input) => {
      const state = resolveAgeVerificationState(input);
      expect(typeof state.statusLine).toBe('string');
      expect(state.statusLine.length).toBeGreaterThan(0);
    });
  });
});

describe('poll backoff + date provenance helpers', () => {
  test('nextPollDelay backs off from 3s and caps at 30s', () => {
    expect(nextPollDelay(0)).toBe(3000);
    expect(nextPollDelay(1)).toBe(4800);
    expect(nextPollDelay(2)).toBe(7680);
    expect(nextPollDelay(20)).toBe(30000);
    expect(nextPollDelay(-5)).toBe(3000);
  });

  test('formatVerifiedDate handles date-only and full ISO timestamps alike', () => {
    expect(formatVerifiedDate('1995-03-15')).toBe('March 15, 1995');
    expect(formatVerifiedDate('1995-03-15T05:00:00.000Z')).toBe('March 15, 1995');
    expect(formatVerifiedDate(null)).toBeNull();
    expect(formatVerifiedDate('not-a-date')).toBeNull();
  });

  test('the provenance line degrades without a date rather than printing junk', () => {
    expect(verifiedProvenanceLine(null)).toBe(
      'Verified 18+ · documents redacted by Stripe',
    );
  });
});

describe('VerifiedAdultSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    talentApi.getAgeVerification.mockResolvedValue(verificationFixture());
    talentApi.getAdultContext.mockResolvedValue({
      verifiedAdult: true,
      verifiedAt: '2026-03-12',
      contentBoundaries: [],
      onlyfansUrl: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('renders nothing at all for a minor', () => {
    const { container } = renderSection({ dateOfBirth: '2014-01-01' });
    expect(container.querySelector('#verified-adult')).toBeNull();
    expect(screen.queryByRole('heading', { name: /private context/i })).not.toBeInTheDocument();
    expect(talentApi.getAgeVerification).not.toHaveBeenCalled();
  });

  test('locked: a collapsed quiet row, no card, no nagging', async () => {
    renderSection();

    expect(
      await screen.findByText('Optional. Never shown to agencies or in discovery.'),
    ).toBeInTheDocument();
    const entry = screen.getByRole('button', { name: 'Set up' });
    expect(entry).toHaveAttribute('aria-expanded', 'false');

    // Nothing from the opened panel leaks into the collapsed row.
    expect(screen.queryByText(/Powered by Stripe/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /verify with stripe/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Private context');
  });

  test('locked: opening reveals the explainer, the three data-story lines and the plain-text Stripe line', async () => {
    const user = userEvent.setup();
    renderSection();
    await openPanel(user, 'Set up');

    expect(
      screen.getByText('Stripe checks a government ID and a selfie — Pholio never sees them'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'We store only the result: verified 18+, and whether the birthdate matches your profile',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Stripe deletes the documents after evaluation — we ask for redaction automatically.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /verify with stripe/i })).toBeInTheDocument();
    expect(screen.getByText('Powered by Stripe')).toBeInTheDocument();
    expect(screen.getByText(/Editing your date of birth afterwards ends the verification/i))
      .toBeInTheDocument();
    expect(
      screen.getByText(
        'Private to you. Shared only if you attach it to a specific submission.',
      ),
    ).toBeInTheDocument();

    // The Stripe handoff is Stripe's own UI — we render no facsimile of it.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/Stripe Identity/)).not.toBeInTheDocument();
  });

  test('locked: the verify action creates a session and hands off', async () => {
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    });
    talentApi.createAgeVerificationSession.mockResolvedValue({
      url: 'https://verify.stripe.com/start/test',
      status: 'requires_input',
    });

    const user = userEvent.setup();
    renderSection();
    await openPanel(user, 'Set up');
    await user.click(screen.getByRole('button', { name: /verify with stripe/i }));

    await waitFor(() => {
      expect(talentApi.createAgeVerificationSession).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith('https://verify.stripe.com/start/test');
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  test('processing: self-updating status line, no retry action', async () => {
    talentApi.getAgeVerification.mockResolvedValue(
      verificationFixture({ status: 'processing' }),
    );
    const user = userEvent.setup();
    renderSection();
    await openPanel(user, 'View');

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(
      'Stripe is reviewing — usually under a minute; this page updates itself',
    );
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Check now' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Private to you. Shared only if you attach it to a specific submission.',
      ),
    ).toBeInTheDocument();
  });

  test('requires_input: the reason is shown with a retry', async () => {
    talentApi.getAgeVerification.mockResolvedValue(
      verificationFixture({ status: 'requires_input', failureCode: 'selfie_face_mismatch' }),
    );
    const user = userEvent.setup();
    renderSection();
    await openPanel(user, 'Resume');

    expect(
      screen.getByText('The selfie did not match the photo on the document.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Private to you. Shared only if you attach it to a specific submission.',
      ),
    ).toBeInTheDocument();
  });

  test('canceled: neutral copy and a retry', async () => {
    talentApi.getAgeVerification.mockResolvedValue(
      verificationFixture({ status: 'canceled' }),
    );
    const user = userEvent.setup();
    renderSection();
    await openPanel(user, 'Resume');

    expect(
      screen.getByText('The check was canceled before it finished. Nothing was stored.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  test('dob mismatch: both fix paths, and the profile path calls back', async () => {
    talentApi.getAgeVerification.mockResolvedValue(
      verificationFixture({ status: 'failed', failureCode: 'dob_mismatch' }),
    );
    const onEditDateOfBirth = vi.fn();
    const user = userEvent.setup();
    renderSection({ onEditDateOfBirth });
    await openPanel(user, 'Resume');

    expect(
      screen.getByRole('status'),
    ).toHaveTextContent('The ID’s birthdate doesn’t match your profile');

    const fixLink = screen.getByRole('button', {
      name: 'correct the date of birth on your profile',
    });
    await user.click(fixLink);
    expect(onEditDateOfBirth).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  test('DOB edit invalidation: a stale verified session is reported as ended, not verified', async () => {
    talentApi.getAgeVerification.mockResolvedValue(
      verificationFixture({ verifiedAdult: false, status: 'verified' }),
    );
    const user = userEvent.setup();
    renderSection();
    await openPanel(user, 'Set up');

    expect(screen.getByRole('status')).toHaveTextContent(/date of birth changed/i);
    expect(screen.getByRole('button', { name: /verify with stripe/i })).toBeInTheDocument();
    // The adult-context form stays closed and is never fetched.
    expect(
      screen.queryByRole('button', { name: /save private context/i }),
    ).not.toBeInTheDocument();
    expect(talentApi.getAdultContext).not.toHaveBeenCalled();
  });

  test('verified: provenance line plus the adult-context form', async () => {
    talentApi.getAgeVerification.mockResolvedValue(
      verificationFixture({
        verifiedAdult: true,
        verifiedAt: '2026-03-12T00:00:00.000Z',
        status: 'verified',
      }),
    );
    talentApi.getAdultContext.mockResolvedValue({
      verifiedAdult: true,
      verifiedAt: '2026-03-12T00:00:00.000Z',
      contentBoundaries: ['Swimwear'],
      onlyfansUrl: 'https://onlyfans.com/nova',
    });
    talentApi.updateAdultContext.mockResolvedValue({
      verifiedAdult: true,
      verifiedAt: '2026-03-12T00:00:00.000Z',
      contentBoundaries: ['Swimwear'],
      onlyfansUrl: 'https://onlyfans.com/nova',
    });

    const user = userEvent.setup();
    renderSection();

    expect(
      await screen.findByText(
        'Verified 18+ · documents redacted by Stripe · March 12, 2026',
      ),
    ).toBeInTheDocument();

    await openPanel(user, 'Open');

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://onlyfans.com/nova')).toBeInTheDocument();
    });
    expect(screen.getByText('Content boundaries')).toBeInTheDocument();

    const save = screen.getByRole('button', { name: /save private context/i });
    await user.click(save);
    await waitFor(() => {
      expect(talentApi.updateAdultContext).toHaveBeenCalledWith({
        contentBoundaries: ['Swimwear'],
        onlyfansUrl: 'https://onlyfans.com/nova',
      });
    });

    expect(
      screen.getByText(
        'Private to you. Shared only if you attach it to a specific submission.',
      ),
    ).toBeInTheDocument();
    // The provenance line is plain text, never a badge or pill.
    expect(screen.queryByText(/^Verified$/)).not.toBeInTheDocument();
  });

  test('no date of birth: the panel points at Identity instead of at Stripe', async () => {
    const onEditDateOfBirth = vi.fn();
    const user = userEvent.setup();
    renderSection({ dateOfBirth: '', onEditDateOfBirth });

    expect(
      screen.getByText('Optional. Add your date of birth in Identity to use this.'),
    ).toBeInTheDocument();
    expect(talentApi.getAgeVerification).not.toHaveBeenCalled();

    await openPanel(user, 'Set up');
    await user.click(screen.getByRole('button', { name: 'Add your date of birth' }));
    expect(onEditDateOfBirth).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: /verify with stripe/i }),
    ).not.toBeInTheDocument();
  });

  test('returning from Stripe reopens the panel and clears the return param', async () => {
    talentApi.getAgeVerification.mockResolvedValue(
      verificationFixture({ status: 'processing' }),
    );
    renderSection({ route: '/dashboard/talent/profile?age_verification=return&tab=details' });

    // The panel the talent left is open again, showing the live status …
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Stripe is reviewing/);
    });
    // … and the one-shot return marker is gone so a reload does not re-open it,
    // while unrelated query params survive.
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('?tab=details');
    });
    expect(screen.getByTestId('location-search').textContent).not.toMatch(
      /age_verification/,
    );
  });

  test('the panel toggles closed again from the entry row', async () => {
    const user = userEvent.setup();
    renderSection();
    await openPanel(user, 'Set up');
    expect(screen.getByText('Powered by Stripe')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Powered by Stripe')).not.toBeInTheDocument();
  });

  test('carries no banned status chrome: no badge, pill, or dot markup', async () => {
    talentApi.getAgeVerification.mockResolvedValue(
      verificationFixture({ verifiedAdult: true, verifiedAt: '2026-03-12' }),
    );
    const user = userEvent.setup();
    const { container } = renderSection();
    await openPanel(user, 'Open');

    const suspicious = container.querySelectorAll(
      '[class*="badge" i], [class*="pill" i], [class*="chip" i], [class*="dot" i]',
    );
    expect(suspicious).toHaveLength(0);
  });
});

describe('readiness coupling', () => {
  test('adult verification and adult context never move the readiness score', () => {
    const base = {
      first_name: 'Nova',
      last_name: 'Lane',
      email: 'nova@example.com',
      phone: '+15550000000',
      city: 'New York',
      bio: 'Professional model with editorial and commercial experience.',
      date_of_birth: '1995-05-15',
      height_cm: 175,
      images: [],
    };
    const withAdultSignals = {
      ...base,
      verifiedAdult: true,
      verified_adult: true,
      verified_adult_at: '2026-03-12',
      age_verification_status: 'verified',
      contentBoundaries: ['Swimwear'],
      content_boundaries: ['Swimwear'],
      onlyfansUrl: 'https://onlyfans.com/nova',
      onlyfans_url: 'https://onlyfans.com/nova',
    };

    expect(JSON.stringify(calculateProfileStrength(withAdultSignals))).toBe(
      JSON.stringify(calculateProfileStrength(base)),
    );
  });

  test('the section renders no readiness affordance of its own', async () => {
    talentApi.getAgeVerification.mockResolvedValue(verificationFixture());
    const user = userEvent.setup();
    const { container } = renderSection();
    await openPanel(user, 'Set up');

    expect(within(container).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/readiness|profile strength|complete your profile/i);
  });
});
