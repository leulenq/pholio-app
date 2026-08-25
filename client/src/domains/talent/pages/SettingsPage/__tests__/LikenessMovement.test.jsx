import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, test, expect, beforeEach } from 'vitest';

/* Motion is not what these tests are about; render the elements plainly and
   drop the motion-only props so they never reach the DOM. */
vi.mock('framer-motion', () => {
  const MOTION_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants', 'layout', 'layoutId',
    'whileHover', 'whileTap', 'whileInView', 'viewport', 'drag',
  ]);
  const cache = new Map();
  const passthroughFor = (tag) => {
    if (!cache.has(tag)) {
      const Tag = tag;
      const Passthrough = ({ children, ...props }) => {
        const clean = Object.fromEntries(
          Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)),
        );
        return <Tag {...clean}>{children}</Tag>;
      };
      Passthrough.displayName = `motion.${tag}`;
      cache.set(tag, Passthrough);
    }
    return cache.get(tag);
  };
  return {
    motion: new Proxy({}, { get: (_t, tag) => passthroughFor(String(tag)) }),
    AnimatePresence: ({ children }) => <>{children}</>,
    useReducedMotion: () => false,
  };
});

vi.mock('../../../api/talent', () => ({
  talentApi: {
    getLikenessConsent: vi.fn(),
    setLikenessConsent: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

const LikenessMovement = (await import('../LikenessMovement')).default;
const { talentApi } = await import('../../../api/talent');

/* Deliberately not the production strings. If either of these turns up on
   screen, the text came from the payload; if the real wording turns up, the
   component is carrying a copy of it, which is the failure this guards. */
const DISCLOSURES = {
  marketing_use:
    'SENTINEL-MARKETING — the exact marketing wording the server sent, and not one word of it rewritten.',
  ai_replica:
    'SENTINEL-REPLICA — the exact AI-likeness wording the server sent, and not one word of it rewritten.',
};

const VERSION = '2099-01-01';

function payload({ marketing = false, replica = false, history = [] } = {}) {
  return {
    state: {
      marketing_use: marketing,
      ai_replica: replica,
      disclosureVersion: VERSION,
      disclosures: DISCLOSURES,
    },
    history,
  };
}

const REPLICA_GRANT_ENTRY = {
  id: 'entry-grant',
  purpose: 'ai_replica',
  event_type: 'granted',
  scope: 'Editorial stills from the Spring book',
  use_purpose: 'One retailer lookbook',
  compensation: 'USD 4,000 flat',
  starts_on: '2099-01-01',
  ends_on: '2099-06-30',
  disclosure_version: VERSION,
  actor_type: 'talent',
  occurred_at: '2099-01-01T10:00:00.000Z',
};

function renderPanel(responses) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  talentApi.getLikenessConsent.mockImplementation(() =>
    Promise.resolve(queue.length > 1 ? queue.shift() : queue[0]),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LikenessMovement />
    </QueryClientProvider>,
  );
}

/** The card a heading belongs to, so assertions can't drift to the other one. */
function cardFor(headingText) {
  return screen.getByRole('heading', { name: headingText }).closest('.set-card');
}

beforeEach(() => {
  vi.clearAllMocks();
  talentApi.setLikenessConsent.mockResolvedValue({ state: {} });
});

describe('Likeness consent — the two permissions stay independent', () => {
  test('no control grants both permissions, and granting one leaves the other alone', async () => {
    const user = userEvent.setup();
    renderPanel([
      payload(),
      payload({ marketing: true, history: [{
        id: 'm1', purpose: 'marketing_use', event_type: 'granted',
        disclosure_version: VERSION, actor_type: 'talent',
        occurred_at: '2099-02-02T10:00:00.000Z',
      }] }),
    ]);

    await screen.findByText(DISCLOSURES.marketing_use);

    // Nothing on the surface offers to settle both at once.
    const buttonNames = screen.getAllByRole('button').map((b) => b.textContent || '');
    expect(buttonNames.length).toBeGreaterThan(0);
    for (const name of buttonNames) {
      expect(name).not.toMatch(/\ball\b|both|everything|accept all/i);
    }

    await user.click(screen.getByRole('button', { name: 'Grant marketing use' }));

    // Exactly one request, naming exactly one permission, carrying nothing else.
    await waitFor(() => expect(talentApi.setLikenessConsent).toHaveBeenCalledTimes(1));
    expect(talentApi.setLikenessConsent).toHaveBeenCalledWith({
      purpose: 'marketing_use',
      granted: true,
    });

    // And the AI permission is exactly where it was: not granted.
    await waitFor(() => {
      expect(within(cardFor('Marketing use')).getByText('Granted')).toBeInTheDocument();
    });
    expect(within(cardFor('AI likeness')).getByText('Not granted')).toBeInTheDocument();
    expect(talentApi.setLikenessConsent).toHaveBeenCalledTimes(1);
  });

  test('every request names exactly one purpose', async () => {
    const user = userEvent.setup();
    renderPanel(payload());
    await screen.findByText(DISCLOSURES.marketing_use);

    await user.click(screen.getByRole('button', { name: 'Grant marketing use' }));
    await waitFor(() => expect(talentApi.setLikenessConsent).toHaveBeenCalled());

    for (const [body] of talentApi.setLikenessConsent.mock.calls) {
      expect(typeof body.purpose).toBe('string');
      expect(['marketing_use', 'ai_replica']).toContain(body.purpose);
      expect(Array.isArray(body.purpose)).toBe(false);
      expect(body.purposes).toBeUndefined();
    }
  });
});

describe('Likeness consent — the disclosure shown is the server’s', () => {
  test('renders each purpose’s wording verbatim from the payload', async () => {
    renderPanel(payload());

    const marketing = await screen.findByText(DISCLOSURES.marketing_use);
    const replica = screen.getByText(DISCLOSURES.ai_replica);

    // Verbatim: the full string, not a prefix and not a truncation.
    expect(marketing).toHaveTextContent(DISCLOSURES.marketing_use);
    expect(marketing.textContent).toBe(DISCLOSURES.marketing_use);
    expect(replica.textContent).toBe(DISCLOSURES.ai_replica);

    // Each sits in its own card, so neither can be read as covering the other.
    expect(cardFor('Marketing use')).toContainElement(marketing);
    expect(cardFor('AI likeness')).toContainElement(replica);

    // The version a dispute is decided against is on the record too.
    expect(screen.getAllByText(`Disclosure ${VERSION}`).length).toBeGreaterThanOrEqual(2);
  });

  test('a purpose the server sent no wording for cannot be granted here', async () => {
    renderPanel({
      state: {
        marketing_use: false,
        ai_replica: false,
        disclosureVersion: VERSION,
        disclosures: { marketing_use: DISCLOSURES.marketing_use },
      },
      history: [],
    });

    await screen.findByText(DISCLOSURES.marketing_use);
    expect(screen.queryByRole('button', { name: 'Set the terms' })).not.toBeInTheDocument();
    expect(screen.getByText(/can’t show the exact wording/i)).toBeInTheDocument();
  });
});

describe('Likeness consent — an AI-replica grant states all four terms', () => {
  async function openTermsStep() {
    const user = userEvent.setup();
    renderPanel(payload());
    await screen.findByText(DISCLOSURES.ai_replica);
    await user.click(screen.getByRole('button', { name: 'Set the terms' }));
    return user;
  }

  const fill = (label, value) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  test('a grant missing a term is never sent', async () => {
    const user = await openTermsStep();

    fill('What it covers', 'Editorial stills from the Spring book');
    fill('What it is for', 'One retailer lookbook');
    fill('What you are paid', 'USD 4,000 flat');
    // Duration deliberately left off.

    const submit = screen.getByRole('button', { name: 'Grant this permission' });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/Still needed:/i)).toHaveTextContent('a start date');
    expect(screen.getByText(/Still needed:/i)).toHaveTextContent('an end date');

    await user.click(submit);
    expect(talentApi.setLikenessConsent).not.toHaveBeenCalled();

    // One date is still not a duration.
    fill('Starts on', '2099-01-01');
    expect(screen.getByRole('button', { name: 'Grant this permission' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Grant this permission' }));
    expect(talentApi.setLikenessConsent).not.toHaveBeenCalled();

    // Complete — and only now does it go.
    fill('Ends on', '2099-06-30');
    await user.click(screen.getByRole('button', { name: 'Grant this permission' }));

    await waitFor(() => expect(talentApi.setLikenessConsent).toHaveBeenCalledTimes(1));
    expect(talentApi.setLikenessConsent).toHaveBeenCalledWith({
      purpose: 'ai_replica',
      granted: true,
      scope: 'Editorial stills from the Spring book',
      usePurpose: 'One retailer lookbook',
      compensation: 'USD 4,000 flat',
      startsOn: '2099-01-01',
      endsOn: '2099-06-30',
    });
  });

  test('whitespace is not a term', async () => {
    const user = await openTermsStep();
    fill('What it covers', '   ');
    fill('What it is for', 'One retailer lookbook');
    fill('What you are paid', 'USD 4,000 flat');
    fill('Starts on', '2099-01-01');
    fill('Ends on', '2099-06-30');

    const submit = screen.getByRole('button', { name: 'Grant this permission' });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(talentApi.setLikenessConsent).not.toHaveBeenCalled();
  });

  test('the server’s own refusal is shown against the fields, not swallowed', async () => {
    const user = await openTermsStep();
    const serverMessage =
      'An AI-likeness consent must state compensation. The Fashion Workers Act requires all four, and a record that cannot state them is not consent.';
    talentApi.setLikenessConsent.mockRejectedValueOnce(new Error(serverMessage));

    fill('What it covers', 'Editorial stills');
    fill('What it is for', 'Lookbook');
    fill('What you are paid', 'TBD');
    fill('Starts on', '2099-01-01');
    fill('Ends on', '2099-06-30');
    await user.click(screen.getByRole('button', { name: 'Grant this permission' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(serverMessage);
    // The form stays open with the answers in it, so nothing has to be retyped.
    expect(screen.getByLabelText('What it covers')).toHaveValue('Editorial stills');
  });
});

describe('Likeness consent — default no, withdrawal always, append-only record', () => {
  test('absence of a grant reads “Not granted”, never unknown', async () => {
    renderPanel(payload());
    await screen.findByText(DISCLOSURES.marketing_use);

    expect(within(cardFor('Marketing use')).getByText('Not granted')).toBeInTheDocument();
    expect(within(cardFor('AI likeness')).getByText('Not granted')).toBeInTheDocument();
    expect(screen.queryByText(/unknown|pending|not set/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing recorded yet/i)).toBeInTheDocument();
  });

  test('withdrawing needs no terms restated', async () => {
    const user = userEvent.setup();
    renderPanel(payload({ replica: true, history: [REPLICA_GRANT_ENTRY] }));
    await screen.findByText(DISCLOSURES.ai_replica);

    await user.click(screen.getByRole('button', { name: 'Withdraw permission' }));
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));

    await waitFor(() => expect(talentApi.setLikenessConsent).toHaveBeenCalledTimes(1));
    expect(talentApi.setLikenessConsent).toHaveBeenCalledWith({
      purpose: 'ai_replica',
      granted: false,
    });
  });

  test('a withdrawal is its own entry and does not erase the grant above it', async () => {
    renderPanel(payload({
      replica: false,
      history: [
        {
          id: 'entry-withdraw',
          purpose: 'ai_replica',
          event_type: 'withdrawn',
          disclosure_version: VERSION,
          actor_type: 'talent',
          occurred_at: '2099-03-01T10:00:00.000Z',
        },
        REPLICA_GRANT_ENTRY,
      ],
    }));

    await screen.findByText(DISCLOSURES.ai_replica);
    const entries = screen.getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('AI likeness withdrawn');
    expect(entries[1]).toHaveTextContent('AI likeness granted');
    // The terms of the ended grant are still legible in the record.
    expect(entries[1]).toHaveTextContent('Editorial stills from the Spring book');
    expect(entries[1]).toHaveTextContent('USD 4,000 flat');
  });
});

describe('the ledger shows the wording each entry was agreed under', () => {
  /* An entry filed under an older disclosure version is the case that matters:
     what that person read is not what the page says today, and rendering the
     current words beside it would read as proof they agreed to text they never
     saw. The server sends `disclosure_text` only when it verified against the
     hash stored at the time, so the panel shows that or nothing. */

  const OLD_VERSION = '2098-01-01';

  function entryWith(extra) {
    return {
      id: 'entry-old',
      purpose: 'marketing_use',
      event_type: 'granted',
      disclosure_version: OLD_VERSION,
      actor_type: 'talent',
      occurred_at: '2098-01-01T10:00:00.000Z',
      ...extra,
    };
  }

  test('an older, verified wording is retrievable on the entry itself', async () => {
    const archived = 'SENTINEL-ARCHIVED — the words shown in 2098, kept verbatim.';
    renderPanel(payload({ history: [entryWith({ disclosure_text: archived })] }));

    expect(await screen.findByText(/read the wording shown at the time/i)).toBeInTheDocument();
    expect(screen.getByText(archived)).toBeInTheDocument();
    // And it is emphatically not today's text standing in for it.
    expect(screen.queryAllByText(DISCLOSURES.marketing_use)).toHaveLength(1);
  });

  test('an unverifiable wording says so rather than substituting the current one', async () => {
    renderPanel(payload({ history: [entryWith({ disclosure_text: null })] }));

    expect(await screen.findByText(/no longer on record/i)).toBeInTheDocument();
    expect(screen.queryByText(/read the wording shown at the time/i)).not.toBeInTheDocument();
  });

  test('an entry on the current version does not repeat what is already on the page', async () => {
    renderPanel(
      payload({
        history: [entryWith({ disclosure_version: VERSION, disclosure_text: DISCLOSURES.marketing_use })],
      }),
    );

    // Scoped to the ledger: the same version line legitimately appears on the
    // consent cards above, and an unscoped query would match those instead.
    const ledger = (await screen.findByRole('list')).closest('.set-ledger') ||
      document.querySelector('.set-ledger');
    expect(within(ledger).getByText(`Disclosure ${VERSION}`)).toBeInTheDocument();
    expect(screen.queryByText(/read the wording shown at the time/i)).not.toBeInTheDocument();
    expect(screen.queryAllByText(DISCLOSURES.marketing_use)).toHaveLength(1);
  });
});
