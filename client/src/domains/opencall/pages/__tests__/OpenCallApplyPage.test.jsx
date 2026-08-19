import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import OpenCallApplyPage from '../OpenCallApplyPage';
import ClaimPage from '../ClaimPage';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const AGENCY = {
  id: 'agency-1',
  name: 'Fashion Week Brooklyn',
  location: 'Brooklyn, NY',
  logo: null,
  website: 'https://fwbk.example.com',
};

const SPEC = {
  version: 1,
  fields: [
    { key: 'legal_name', kind: 'text', label: 'Legal name', requirement: 'required', stage: 'apply' },
    { key: 'email', kind: 'email', label: 'Email', requirement: 'required', stage: 'apply' },
    { key: 'phone', kind: 'phone', label: 'Phone', requirement: 'optional', stage: 'apply' },
    {
      key: 'adult_attestation',
      kind: 'attestation',
      label: 'I am 18 years of age or older',
      requirement: 'required',
      stage: 'apply',
    },
    { key: 'digital_headshot', kind: 'media', label: 'Headshot', requirement: 'required', stage: 'apply' },
    { key: 'digital_full_length', kind: 'media', label: 'Full length', requirement: 'required', stage: 'apply' },
  ],
  shortlistFields: [{ key: 'walk_video_url', label: 'Walk video', requirement: 'required' }],
  customQuestionLimits: { maxQuestions: 5, maxLabelLength: 160, maxAnswerLength: 500 },
};

const EMPTY_RESUME = {
  hasDraft: false,
  answers: {},
  customAnswers: {},
  mediaPresent: [],
  identityAttached: false,
  blockers: [],
  packageFingerprint: null,
};

function callPayload(overrides = {}) {
  return {
    valid: true,
    accountRequired: false,
    agency: AGENCY,
    brief: { who: 'Runway models, all lanes.', what: 'Two digitals.', deadline: '2026-09-30', ongoing: false },
    callKind: 'event_casting',
    event: { name: 'FWBK Queens', startsOn: '2026-10-04', endsOn: '2026-10-10', location: 'Queens, NY' },
    compensation: { type: 'paid', details: '$250 per show.' },
    closed: false,
    identityPolicy: 'account_optional',
    spec: SPEC,
    authenticated: false,
    resume: EMPTY_RESUME,
    ...overrides,
  };
}

/**
 * Mock at the module boundary the arrival-page test uses: one `fetch` stub that
 * routes by URL, so the page's own client code (headers, credentials, envelope
 * unwrapping) is exercised rather than stubbed out.
 */
function mockApi({ call, draft, onPost } = {}) {
  const calls = [];
  const fetchMock = vi.fn(async (url, options = {}) => {
    const href = String(url);
    calls.push({ url: href, method: options.method || 'GET', body: options.body });

    if (options.method === 'POST') {
      const handled = onPost?.(href, options);
      if (handled) return handled;
      if (href.includes('/draft/email')) {
        return { ok: true, json: async () => ({ success: true, data: { attached: true } }) };
      }
      if (href.includes('/submit')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { submitted: true, receiptEmailQueued: true } }),
        };
      }
      if (href.includes('/draft')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              savedKeys: ['legal_name'],
              blockers: [],
              identityAttached: false,
              mediaPresent: [],
              packageFingerprint: 'fp-1',
            },
          }),
        };
      }
      // The arrival page's own beacon, when the fallback renders.
      return { ok: true, json: async () => ({ data: { valid: true } }) };
    }

    if (href.includes('/opencall/call/') && href.endsWith('/draft')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: draft || { ...EMPTY_RESUME, hasDraft: true, identityAttached: true, packageFingerprint: 'fp-1' },
        }),
      };
    }
    if (href.includes('/opencall/call/')) {
      return { ok: true, json: async () => ({ success: true, data: call }) };
    }
    // `/api/public/open-call/:code` — the arrival page's endpoint.
    return { ok: true, json: async () => ({ data: call }) };
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

function renderApply() {
  render(
    <MemoryRouter initialEntries={['/opencall/FWBK123']}>
      <Routes>
        <Route path="/opencall/:code" element={<OpenCallApplyPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.findByRole('main');
}

async function advance(user) {
  await user.click(screen.getByRole('button', { name: /Continue/ }));
}

describe('OpenCallApplyPage — the anonymous flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // §7: `account_required` is today's behaviour, preserved exactly. The arrival
  // page keeps serving it, and the form never appears.
  test('an account_required link falls back to the arrival page', async () => {
    mockApi({
      call: {
        valid: true,
        accountRequired: true,
        agency: AGENCY,
        brief: { who: 'New faces.', what: 'Digitals.', deadline: '2026-09-30', ongoing: false },
        closed: false,
      },
    });
    await renderApply();

    expect(
      await screen.findByRole('button', { name: /Apply for this event|Begin your submission/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Continue/ })).not.toBeInTheDocument();
  });

  test('a signed-in Pholio talent falls back to the arrival page too', async () => {
    mockApi({ call: callPayload({ authenticated: true }) });
    await renderApply();
    expect(
      await screen.findByRole('button', { name: /Apply for this event|Begin your submission/i }),
    ).toBeInTheDocument();
  });

  // §5.1: screen one is the call AND the first question, on one stage.
  test('screen one carries the call and the first question together', async () => {
    mockApi({ call: callPayload() });
    await renderApply();

    expect(
      await screen.findByText('Fashion Week Brooklyn is casting for FWBK Queens.'),
    ).toBeInTheDocument();
    // The compensation sentence, verbatim — the same wording the consent records.
    expect(
      screen.getByText('Fashion Week Brooklyn states this is PAID. $250 per show.'),
    ).toBeInTheDocument();
    // Ruling R8, in plain words, not a badge.
    expect(screen.getByText('You must be 18 or older to apply.')).toBeInTheDocument();
    // And the first question is already here — no "Begin" button in between.
    expect(screen.getByRole('textbox', { name: 'Legal name' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Begin/ })).not.toBeInTheDocument();
  });

  test('the dock is dimmed until the screen is satisfiable', async () => {
    const user = userEvent.setup();
    mockApi({ call: callPayload() });
    await renderApply();

    const dock = screen.getByRole('button', { name: /Continue/ });
    expect(dock).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Legal name' }), 'Ava Mercer');
    expect(dock).toBeEnabled();
  });

  test('advancing a screen autosaves that screen’s answer', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ call: callPayload() });
    await renderApply();

    await user.type(screen.getByRole('textbox', { name: 'Legal name' }), 'Ava Mercer');
    await advance(user);

    const saved = calls.find(
      (entry) => entry.method === 'POST' && entry.url.endsWith('/draft'),
    );
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved.body)).toEqual({ answers: { legal_name: 'Ava Mercer' } });
  });

  // §7's upload gate, expressed as screen order: uploads are server-gated
  // behind the email step, so email is asked immediately before the digitals.
  test('email is asked immediately before the photos, and the photos are last', async () => {
    const user = userEvent.setup();
    mockApi({ call: callPayload() });
    await renderApply();

    await user.type(screen.getByRole('textbox', { name: 'Legal name' }), 'Ava Mercer');
    await advance(user);

    // The attestation is a statement to affirm, not a checkbox row.
    const attestation = await screen.findByRole('checkbox', {
      name: /I am 18 years of age or older/,
    });
    expect(attestation).toHaveAttribute('aria-checked', 'false');
    await user.click(attestation);
    await advance(user);

    // Email, framed as where the receipt goes — and never as an account check.
    expect(await screen.findByText(/Where should we send your/)).toBeInTheDocument();
    expect(screen.queryByText(/account/i)).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Email address' }), 'ava@example.com');
    await advance(user);

    // Then, and only then, the digitals.
    expect(await screen.findByRole('button', { name: /Headshot/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Full length/ })).toBeInTheDocument();
  });

  test('consent gates the send, and the payoff follows it', async () => {
    const user = userEvent.setup();
    mockApi({
      call: callPayload({
        resume: {
          ...EMPTY_RESUME,
          hasDraft: true,
          answers: { legal_name: 'Ava Mercer', email: 'ava@example.com', adult_attestation: true },
          identityAttached: true,
          mediaPresent: ['digital_headshot', 'digital_full_length'],
          packageFingerprint: 'fp-1',
        },
      }),
      draft: {
        hasDraft: true,
        answers: { legal_name: 'Ava Mercer', email: 'ava@example.com', adult_attestation: true },
        customAnswers: {},
        mediaPresent: ['digital_headshot', 'digital_full_length'],
        identityAttached: true,
        blockers: [],
        packageFingerprint: 'fp-1',
      },
    });
    await renderApply();

    // A complete draft resumes straight onto the consent screen.
    expect(await screen.findByText(/Read this once/)).toBeInTheDocument();
    expect(screen.getByText(/Picking up where you left off/)).toBeInTheDocument();
    // The retention clock, in ruling R4's words.
    expect(
      screen.getByText(/Pholio retains this event package until 2027-01-08/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not guarantee selection, a booking, or payment/),
    ).toBeInTheDocument();

    const send = screen.getByRole('button', { name: /Send application/ });
    expect(send).toBeDisabled();

    const confirmations = screen.getAllByRole('checkbox');
    expect(confirmations).toHaveLength(3);
    await user.click(confirmations[0]);
    expect(send).toBeDisabled();
    await user.click(confirmations[1]);
    await user.click(confirmations[2]);
    expect(send).toBeEnabled();

    await user.click(send);

    expect(
      await screen.findByText(/Your application is with/),
    ).toBeInTheDocument();
    expect(screen.getByText(/We emailed you a receipt/)).toBeInTheDocument();
  });

  test('an already-sent application lands on a calm terminal screen', async () => {
    mockApi({
      call: callPayload({ resume: { ...EMPTY_RESUME, hasDraft: true, submitted: true } }),
    });
    await renderApply();

    expect(await screen.findByText(/is already in/)).toBeInTheDocument();
    expect(screen.getByText(/Check your email for your receipt/)).toBeInTheDocument();
    // Nobody here has a dashboard to be sent to.
    expect(screen.queryByRole('button', { name: /View your submission/ })).not.toBeInTheDocument();
  });
});

function renderClaim() {
  render(
    <MemoryRouter initialEntries={['/opencall/claim/tok-1']}>
      <Routes>
        <Route path="/opencall/claim/:token" element={<ClaimPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.findByRole('main');
}

describe('ClaimPage — the receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('greets by name, names the organizer, and follows the redirect', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (options.method === 'POST') {
        return { ok: true, json: async () => ({ success: true, data: { redirect: '/onboarding' } }) };
      }
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            valid: true,
            alreadyClaimed: false,
            firstName: 'Ava',
            submissionsCount: 1,
            agencyNames: ['Fashion Week Brooklyn'],
          },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderClaim();

    expect(await screen.findByText(/Ava, this is/)).toBeInTheDocument();
    expect(screen.getByText(/Fashion Week Brooklyn/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      expect.stringContaining('/terms'),
    );

    await user.click(screen.getByRole('button', { name: /Keep my profile/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding', { replace: true }));
  });

  test('a spent link on a claimed identity sends them to sign in, not to a dead end', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, data: { valid: false, alreadyClaimed: true } }),
      })),
    );

    await renderClaim();

    expect(await screen.findByText(/already yours/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in/ })).toBeInTheDocument();
  });
});
