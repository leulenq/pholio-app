import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import RequirementsPage from './index';

vi.mock('../../../auth/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/talent', () => ({
  talentApi: {
    getSpecRegistryRoutes: vi.fn(),
    preflightSpecRegistry: vi.fn(),
    exportSpecRegistrySet: vi.fn(),
    recordSpecRegistryOutboundClick: vi.fn(),
    listCallWindows: vi.fn(),
    logTrackedSubmission: vi.fn(),
  },
}));

import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RequirementsPage />
      </QueryClientProvider>,
    ),
  };
}

/**
 * The ledger card mounts as soon as the directory resolves — the column heads
 * are the page's navigation and must not wait on the per-route check. The rows
 * arrive with the preflight, so tests about cells wait for a row.
 */
async function renderWithLedger() {
  const utils = renderPage();
  await screen.findByRole('rowheader', { name: /profile/i });
  return utils;
}

async function renderWithPlate() {
  const utils = renderPage();
  await screen.findByRole('heading', { name: 'Attention · 4', level: 3 });
  return utils;
}

/** The geometric state of the mark carrying a given description. */
function markState(description) {
  return screen
    .getByText(description)
    .closest('[data-mark-state]')
    ?.getAttribute('data-mark-state');
}

function rowFor(pattern) {
  return screen
    .getAllByRole('row')
    .find((row) => pattern.test(within(row).queryAllByRole('rowheader')[0]?.textContent || ''));
}

/*
 * Mirrors `routeDto` in `src/domains/spec-registry/preflight-service.js`.
 * `acceptsPholioSubmissions` comes from the agency-routes join, not from
 * `origin` — an agency can be live on Pholio while Pholio researched its spec.
 */
const routes = [
  {
    seriesId: 'elite-models-na:online-general',
    revisionId: 'elite-models-na:online-general@3',
    agencyName: 'Elite Models',
    marketLabel: 'New York',
    sourceUrl: 'https://example.com/elite',
    sourceStatus: 'confirmed',
    sourceCheckedOn: '2026-08-09',
    sourceFreshness: { state: 'checked', nextReviewOn: '2026-11-09' },
    acceptsPholioSubmissions: false,
    channel: { type: 'official_web_form', url: 'https://example.com/elite' },
    // `verificationDto` — a real-shaped NYSDOL row, positive-only (ruling R3).
    verification: {
      registry: 'ny_dol',
      certificateNumber: '26-69YIX-LSFW',
      expiresOn: '2028-07-31',
      registryStatus: 'active',
      verifiedOn: '2026-08-15',
    },
    // `callWindowDto` — the route's copy carries no verification date.
    callWindows: [
      {
        id: 'elite-thu',
        displayName: 'Elite Models',
        label: 'Walk-in open call',
        weekday: 4,
        startMinute: 900,
        endMinute: 960,
        timezone: 'America/New_York',
        location: '245 Fifth Avenue',
        instructions: null,
        sourceUrl: null,
      },
    ],
  },
  {
    seriesId: 'models1-uk:online',
    revisionId: 'models1-uk:online@1',
    agencyName: 'Models 1',
    marketLabel: 'London',
    sourceUrl: null,
    sourceStatus: 'confirmed',
    sourceCheckedOn: null,
    sourceFreshness: { state: 'unknown', nextReviewOn: null },
    acceptsPholioSubmissions: true,
    channel: { type: 'official_web_form', url: null },
    // Pholio holds no registry match for this one — a UK agency is not in a New
    // York register, and that is not a mark against it.
    verification: null,
    callWindows: [],
  },
];

/**
 * `GET /api/talent/call-windows`. Que and MSA belong to no spec-pack
 * organisation — they are curated windows with no route to hang off, and the
 * strip lists them all the same.
 */
const callWindows = [
  {
    id: 'muse-thu',
    organizationId: 'muse-management',
    displayName: 'Muse Management',
    label: 'Walk-in open call',
    weekday: 4,
    startMinute: 900,
    endMinute: 960,
    timezone: 'America/New_York',
    location: null,
    instructions: null,
    sourceUrl: null,
    verifiedOn: '2026-08-15',
  },
  {
    id: 'que-thu',
    organizationId: null,
    displayName: 'Que Management',
    label: 'Walk-in open call',
    weekday: 4,
    startMinute: 600,
    endMinute: 660,
    timezone: 'America/New_York',
    location: null,
    instructions: null,
    sourceUrl: null,
    verifiedOn: '2026-08-15',
  },
  // Day published, time not.
  {
    id: 'msa-tue',
    organizationId: null,
    displayName: 'MSA Models',
    label: 'Open call',
    weekday: 2,
    startMinute: null,
    endMinute: null,
    timezone: 'America/New_York',
    location: null,
    instructions: null,
    sourceUrl: null,
    verifiedOn: '2026-08-15',
  },
];

/** Mirrors `evaluationDto`: flat findings, `countSummary`, `shotCoverage`. */
const eliteEvaluation = {
  seriesId: 'elite-models-na:online-general',
  available: true,
  findings: [
    {
      id: 'shots:close-up-profile',
      categoryKey: 'shots',
      field: 'shot.view',
      matchValue: 'profile',
      sourceLabel: 'close-up profile, hair pulled back',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      category: 'Shots',
      guidance: 'Your current package has no confirmed match for “close-up profile, hair pulled back”.',
    },
    {
      id: 'shots:personality',
      categoryKey: 'shots',
      field: 'shot.frame',
      matchValue: 'personality',
      sourceLabel: 'personality shot',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      category: 'Shots',
    },
    {
      id: 'shots:full-length',
      categoryKey: 'shots',
      field: 'shot.frame',
      matchValue: 'full_length',
      sourceLabel: 'full-length',
      outcome: 'satisfied',
      severity: null,
      requiresAttention: false,
      category: 'Shots',
    },
    // Not a shot. Real registry data puts file limits and social handles in
    // this same flat list, and they must not land in the shot grid.
    {
      id: 'files:maximum-image-count',
      categoryKey: 'files',
      sourceLabel: 'Image count',
      outcome: 'violates',
      severity: 'attention',
      requiresAttention: true,
      category: 'Files',
    },
    {
      id: 'applicationFields:instagram',
      categoryKey: 'applicationFields',
      sourceLabel: 'Instagram',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      category: 'Application fields',
    },
    // Verbatim from `guidanceForOutcome` in preflight-service.js. Written to
    // state what Pholio knows rather than to instruct a send, because this
    // surface sends nothing.
    {
      id: 'setWide:hair',
      categoryKey: 'setWide',
      sourceLabel: 'Hair pulled back',
      outcome: 'unknown',
      severity: null,
      requiresAttention: false,
      category: 'Presentation',
      guidance:
        'Pholio cannot verify this from your saved profile or selected images. Confirm it yourself.',
    },
  ],
  summary: { needsAttention: 4, informational: 0, confirm: 0, included: 4 },
  shotCoverage: { selected: 5, published: 6, matched: 4 },
};

const models1Evaluation = {
  seriesId: 'models1-uk:online',
  available: true,
  findings: [
    {
      id: 'shots:full',
      categoryKey: 'shots',
      field: 'shot.frame',
      matchValue: 'full_length',
      sourceLabel: 'Full length',
      outcome: 'satisfied',
      requiresAttention: false,
      category: 'Shots',
    },
    {
      id: 'shots:prof',
      categoryKey: 'shots',
      field: 'shot.view',
      matchValue: 'profile',
      sourceLabel: 'Profile shot',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      category: 'Shots',
    },
  ],
  summary: { needsAttention: 0, informational: 0, confirm: 0, included: 3 },
  shotCoverage: { selected: 5, published: 3, matched: 3 },
};

describe('RequirementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      profile: { images: [{ id: 'profile-image' }] },
      images: [
        { id: 'active-image', status: 'active', asset_kind: 'image' },
        { id: 'deleted-image', deleted_at: '2026-01-01' },
        { id: 'video-image', asset_kind: 'video' },
      ],
    });
    talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes });
    talentApi.preflightSpecRegistry.mockResolvedValue({
      results: [eliteEvaluation, models1Evaluation],
    });
    talentApi.listCallWindows.mockResolvedValue(callWindows);
    talentApi.logTrackedSubmission.mockResolvedValue({ id: 'tracked-1' });
  });

  test('checks the talent’s current agency-visible digitals, once, for every route', async () => {
    renderPage();

    await screen.findByRole('table');
    await waitFor(() => {
      expect(talentApi.preflightSpecRegistry).toHaveBeenCalledWith({
        seriesIds: ['elite-models-na:online-general', 'models1-uk:online'],
        imageIds: ['active-image'],
      });
    });
  });

  test('states the page and its provenance without an eyebrow above the title', async () => {
    renderPage();

    const title = await screen.findByRole('heading', { level: 1 });
    expect(title).toHaveTextContent('Agency requirements');
    expect(
      screen.getByText(
        'What each agency’s published route asks for, checked against your current digitals.',
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Registry verified continuously · 2 agencies'),
    ).toBeInTheDocument();
  });

  describe('open calls this week', () => {
    async function findStrip() {
      renderPage();
      const heading = await screen.findByRole('heading', {
        name: 'Open calls this week',
        level: 2,
      });
      return heading.closest('section');
    }

    test('reads the week as a call sheet — who, what, when, last checked', async () => {
      const strip = await findStrip();
      const row = within(strip)
        .getAllByRole('listitem')
        .find((item) => /Muse Management/.test(item.textContent));

      expect(within(row).getByText('Walk-in open call')).toBeInTheDocument();
      // The window's own zone, not the reader's: "Thursdays at 3pm their time"
      // is the fact, and it does not move when the reader does.
      expect(within(row).getByText('Thu · 3–4 PM ET')).toBeInTheDocument();
      expect(within(row).getByText('Verified on August 15, 2026')).toBeInTheDocument();
    });

    test('lists windows that belong to no spec-pack agency at all', async () => {
      const strip = await findStrip();

      // Que and MSA have no route, so they appear nowhere else on this page.
      expect(within(strip).getByText('Que Management')).toBeInTheDocument();
      expect(within(strip).getByText('MSA Models')).toBeInTheDocument();
    });

    test('orders by what happens next, and says the day when the time is unpublished', async () => {
      const strip = await findStrip();
      const names = within(strip)
        .getAllByRole('listitem')
        .map((item) => item.textContent);

      // Both fall on Thursday, so the earlier hour leads regardless of today.
      expect(names.findIndex((text) => /Que Management/.test(text))).toBeLessThan(
        names.findIndex((text) => /Muse Management/.test(text)),
      );
      // Day published, time not — the day is still worth stating.
      expect(within(strip).getByText('Tue')).toBeInTheDocument();
    });

    test('never invents a schedule when there is none to publish', async () => {
      talentApi.listCallWindows.mockResolvedValue([]);
      renderPage();

      await screen.findByRole('table');
      expect(
        screen.queryByRole('heading', { name: 'Open calls this week' }),
      ).not.toBeInTheDocument();
    });

    test('a failed calendar never takes the requirements page down with it', async () => {
      talentApi.listCallWindows.mockRejectedValue(new Error('offline'));
      renderPage();

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Open calls this week' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('the ledger', () => {
    test('aligns the same shot across agencies by taxonomy value, not by label', async () => {
      await renderWithLedger();

      // Elite calls it "close-up profile, hair pulled back"; Models 1 calls the
      // same `shot.view: profile` "Profile shot". One row, not two — matching on
      // the label would have produced two.
      const rows = screen.getAllByRole('row').slice(1);
      const headings = rows.map((row) => within(row).getAllByRole('rowheader')[0]?.textContent);
      expect(headings.filter((h) => /profile/i.test(h || ''))).toHaveLength(1);
    });

    test('leads with the shot that unlocks the most agencies', async () => {
      await renderWithLedger();

      // Both agencies want a profile and neither is covered → unlocks 2, the
      // highest, so it sorts to the top and becomes the recommendation.
      expect(await screen.findByText(/would satisfy 2 more agencies/i)).toBeInTheDocument();
      const firstRow = screen.getAllByRole('row')[1];
      expect(within(firstRow).getAllByRole('rowheader')[0].textContent).toMatch(/profile/i);
      // Emphasis, not a chip: the highest-leverage row label is the only one
      // set in the accent.
      expect(within(firstRow).getByText('Profile shot').tagName).toBe('EM');
    });

    test('draws the three cell states as marks, never as coloured dots', async () => {
      await renderWithLedger();

      expect(markState('Elite Models: full-length covered')).toBe('covered');
      expect(markState('Models 1: Profile shot still needed')).toBe('wanted');
      expect(markState('Models 1: does not ask for personality shot')).toBe('not_asked');
    });

    test('reads out how many agencies each missing shot would still satisfy', async () => {
      await renderWithLedger();

      expect(within(rowFor(/profile/i)).getByText('Still needed by 2')).toBeInTheDocument();
      expect(within(rowFor(/personality/i)).getByText('Still needed by 1')).toBeInTheDocument();
      expect(within(rowFor(/full[- ]length/i)).getByText('Covered')).toBeInTheDocument();
    });

    test('names each column by agency and office, and legends the marks once', async () => {
      await renderWithLedger();

      const column = screen.getByRole('button', { name: /^Elite Models/ });
      expect(within(column).getByText('New York')).toBeInTheDocument();
      expect(screen.getByText('In your set')).toBeInTheDocument();
      expect(screen.getByText('Asked for, not yet covered')).toBeInTheDocument();
      expect(screen.getByText('Not asked for')).toBeInTheDocument();
    });

    test('the ledger is the navigation — a column head opens that agency', async () => {
      const user = userEvent.setup();
      await renderWithLedger();

      const column = screen.getByRole('button', { name: /^Models 1/ });
      expect(column).toHaveAttribute('aria-pressed', 'false');
      await user.click(column);

      expect(
        await screen.findByRole('heading', { name: 'Models 1', level: 2 }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Models 1/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  describe('the opened agency', () => {
    test('opens on an agency that actually published a shot list', async () => {
      await renderWithPlate();
      // Not simply the first route — one that can demonstrate the check.
      const plate = screen
        .getByRole('heading', { name: 'Elite Models', level: 2 })
        .closest('section');
      expect(within(plate).getByText('New York')).toBeInTheDocument();
      expect(within(plate).getByText('Verified on August 9, 2026')).toBeInTheDocument();
    });

    test('stacks findings in a fixed order, with counts as plain text', async () => {
      await renderWithPlate();

      const plate = screen.getByRole('heading', { name: 'Elite Models', level: 2 }).closest('section');
      const groups = within(plate)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent);
      expect(groups).toEqual(['Attention · 4', 'Confirm · 1', 'Included · 1']);
    });

    test('keeps what needs doing open and the long, quiet groups closed', async () => {
      const user = userEvent.setup();
      await renderWithPlate();

      const plate = screen
        .getByRole('heading', { name: 'Elite Models', level: 2 })
        .closest('section');

      // Attention and Confirm are expanded; Included waits to be asked for.
      expect(within(plate).getByText('close-up profile, hair pulled back')).toBeInTheDocument();
      expect(within(plate).getByText('Hair pulled back')).toBeInTheDocument();
      expect(within(plate).queryByText('full-length')).not.toBeInTheDocument();

      await user.click(within(plate).getByRole('button', { name: /Included · 1/ }));
      expect(await within(plate).findByText('full-length')).toBeInTheDocument();
    });

    test('states the registration as a sentence, and only when Pholio holds one', async () => {
      const user = userEvent.setup();
      await renderWithPlate();

      expect(
        screen.getByText('NYSDOL-registered · Cert 26-69YIX-LSFW · expires July 2028'),
      ).toBeInTheDocument();
      // What the registration is for: the link below it goes to the house the
      // register names.
      expect(screen.getByText('Registry-verified official channel.')).toBeInTheDocument();

      // Models 1 has no registry match. Absence says nothing (ruling R3).
      await user.click(screen.getByRole('button', { name: /^Models 1/ }));
      await screen.findByRole('heading', { name: 'Models 1', level: 2 });
      expect(screen.queryByText(/NYSDOL/)).not.toBeInTheDocument();
      expect(screen.queryByText(/unverified/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/not verified/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Registry-verified official channel.')).not.toBeInTheDocument();
    });

    test('reads out a published open call in the agency’s own hours', async () => {
      await renderWithPlate();

      expect(
        screen.getByText('Walk-in open call: Thursdays 3–4 PM ET · 245 Fifth Avenue'),
      ).toBeInTheDocument();
    });

    test('names the errand an emailed application actually is', async () => {
      talentApi.getSpecRegistryRoutes.mockResolvedValue({
        routes: [
          { ...routes[0], channel: { type: 'official_email', url: 'mailto:new@example.com' } },
          routes[1],
        ],
      });
      await renderWithPlate();

      expect(
        screen.getByText('Applies by email — we prepare the message and attachments.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Applies via their own site — we prepare a conforming set.'),
      ).not.toBeInTheDocument();
    });

    test('says plainly when an agency cannot be applied to through Pholio', async () => {
      await renderWithPlate();

      expect(
        screen.getByText('Applies via their own site — we prepare a conforming set.'),
      ).toBeInTheDocument();
    });

    test('never frames a reference agency as somewhere a package is sent', async () => {
      await renderWithPlate();

      expect(screen.queryByText(/prepare this package/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Confirm it yourself\./)).toBeInTheDocument();
      expect(screen.queryByText(/before sending/i)).not.toBeInTheDocument();
    });

    test('carries provenance and non-affiliation, without needing to be opened', async () => {
      await renderWithPlate();

      // A calendar date on the wire, read back to the talent — not the raw value.
      expect(screen.queryByText(/2026-08-09/)).not.toBeInTheDocument();
      expect(
        screen.getByText(
          'Requirements as published by Elite Models. Pholio is not affiliated with Elite Models.',
        ),
      ).toBeInTheDocument();
    });

    test('exports a conforming set from the same selection it checked', async () => {
      const blob = new Blob(['zip'], { type: 'application/zip' });
      talentApi.exportSpecRegistrySet.mockResolvedValue({
        blob,
        filename: 'elite-models-digitals.zip',
        fileCount: 4,
      });
      const createObjectURL = vi.fn(() => 'blob:fake');
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = vi.fn();

      const user = userEvent.setup();
      await renderWithPlate();

      await user.click(
        screen.getByRole('button', { name: 'Export the Elite Models conforming set' }),
      );

      await waitFor(() => {
        expect(talentApi.exportSpecRegistrySet).toHaveBeenCalledWith({
          seriesId: 'elite-models-na:online-general',
          imageIds: ['active-image'],
        });
      });
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(
        await screen.findByText('4 files downloaded as elite-models-digitals.zip.'),
      ).toBeInTheDocument();
    });

    /**
     * The one fact Pholio cannot observe: whether the set was actually sent.
     * Exporting is intent; the sending happens on the agency's own site.
     */
    describe('after an export', () => {
      function stubDownload() {
        talentApi.exportSpecRegistrySet.mockResolvedValue({
          blob: new Blob(['zip'], { type: 'application/zip' }),
          filename: 'elite-models-digitals.zip',
          fileCount: 4,
        });
        URL.createObjectURL = vi.fn(() => 'blob:fake');
        URL.revokeObjectURL = vi.fn();
      }

      async function exportTheSet(user) {
        await user.click(
          screen.getByRole('button', { name: 'Export the Elite Models conforming set' }),
        );
        await screen.findByText('4 files downloaded as elite-models-digitals.zip.');
      }

      test('asks whether it was sent, and logs it against the export it came from', async () => {
        stubDownload();
        const user = userEvent.setup();
        const { queryClient } = await renderWithPlate();
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

        expect(screen.queryByText('Submitted it? Log it in your tracker.')).not.toBeInTheDocument();
        await exportTheSet(user);
        expect(
          await screen.findByText('Submitted it? Log it in your tracker.'),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Log it' }));

        const now = new Date();
        const pad = (value) => String(value).padStart(2, '0');
        await waitFor(() => {
          expect(talentApi.logTrackedSubmission).toHaveBeenCalledWith({
            agencyName: 'Elite Models',
            seriesId: 'elite-models-na:online-general',
            channel: 'official_web_form',
            submittedOn: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
            sentSummary: {
              revisionId: 'elite-models-na:online-general@3',
              fileCount: 4,
            },
          });
        });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tracker'] });
        expect(
          await screen.findByText('Logged — see your submission history.'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Log it' })).not.toBeInTheDocument();
      });

      test('a talent who has not sent it yet can put the question down', async () => {
        stubDownload();
        const user = userEvent.setup();
        await renderWithPlate();
        await exportTheSet(user);

        await user.click(screen.getByRole('button', { name: 'Not yet' }));
        expect(
          screen.queryByText('Submitted it? Log it in your tracker.'),
        ).not.toBeInTheDocument();
        expect(talentApi.logTrackedSubmission).not.toHaveBeenCalled();
      });

      test('a tracker that will not write never costs the talent their export', async () => {
        stubDownload();
        talentApi.logTrackedSubmission.mockRejectedValue(new Error('offline'));
        const user = userEvent.setup();
        await renderWithPlate();
        await exportTheSet(user);

        await user.click(screen.getByRole('button', { name: 'Log it' }));
        expect(
          await screen.findByText('That couldn’t be logged. Your export is unaffected.'),
        ).toBeInTheDocument();
        expect(
          screen.getByText('4 files downloaded as elite-models-digitals.zip.'),
        ).toBeInTheDocument();
      });
    });

    test('reports an export that could not be built instead of failing silently', async () => {
      talentApi.exportSpecRegistrySet.mockRejectedValue(
        new Error('None of your current images match a shot this agency publishes.'),
      );
      const user = userEvent.setup();
      await renderWithPlate();

      await user.click(
        screen.getByRole('button', { name: 'Export the Elite Models conforming set' }),
      );

      expect(
        await screen.findByText(
          'None of your current images match a shot this agency publishes.',
        ),
      ).toBeInTheDocument();
    });

    test('records the outbound click without standing between talent and agency', async () => {
      talentApi.recordSpecRegistryOutboundClick.mockResolvedValue({ recorded: true });
      const user = userEvent.setup();
      await renderWithPlate();

      const link = screen.getByRole('link', { name: /Open their application page/ });
      // Straight to the agency, not through a Pholio redirect.
      expect(link).toHaveAttribute('href', 'https://example.com/elite');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');

      await user.click(link);
      expect(talentApi.recordSpecRegistryOutboundClick).toHaveBeenCalledWith(
        'elite-models-na:online-general',
      );
    });

    test('a failed click count never blocks the talent reaching the agency', async () => {
      talentApi.recordSpecRegistryOutboundClick.mockRejectedValue(new Error('offline'));
      const user = userEvent.setup();
      await renderWithPlate();

      await user.click(screen.getByRole('link', { name: /Open their application page/ }));
      await waitFor(() => expect(talentApi.recordSpecRegistryOutboundClick).toHaveBeenCalled());
      expect(
        screen.getByRole('button', { name: 'Export the Elite Models conforming set' }),
      ).toBeEnabled();
    });
  });

  describe('page states', () => {
    test('offers a retry when the directory itself fails to load', async () => {
      talentApi.getSpecRegistryRoutes.mockReset();
      // The directory query is configured `retry: 1`, so the error only reaches
      // the surface after two failed attempts.
      talentApi.getSpecRegistryRoutes.mockRejectedValueOnce(new Error('offline'));
      talentApi.getSpecRegistryRoutes.mockRejectedValueOnce(new Error('offline'));
      talentApi.getSpecRegistryRoutes.mockResolvedValueOnce({ routes: [] });
      const user = userEvent.setup();
      renderPage();

      await screen.findByRole('alert', {}, { timeout: 3_000 });
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(
        await screen.findByText('No agency requirements are catalogued yet.'),
      ).toBeInTheDocument();
    });

    test('shows the empty state without checking or drawing a ledger', async () => {
      talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes: [] });
      renderPage();

      expect(
        await screen.findByText('No agency requirements are catalogued yet.'),
      ).toBeInTheDocument();
      expect(talentApi.preflightSpecRegistry).not.toHaveBeenCalled();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    test('is honest when catalogued agencies publish no shot list at all', async () => {
      talentApi.preflightSpecRegistry.mockResolvedValue({
        results: [
          { ...eliteEvaluation, findings: [], shotCoverage: null },
          { ...models1Evaluation, findings: [], shotCoverage: null },
        ],
      });
      renderPage();

      await waitFor(() => expect(talentApi.preflightSpecRegistry).toHaveBeenCalled());
      expect(
        await screen.findByText(/None of these agencies publishes a shot list yet/),
      ).toBeInTheDocument();
      // The column heads still work, so the plate is still reachable.
      expect(screen.getByRole('button', { name: /^Models 1/ })).toBeInTheDocument();
    });
  });
});
