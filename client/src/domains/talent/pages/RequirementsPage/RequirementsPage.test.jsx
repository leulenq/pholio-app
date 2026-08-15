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

/** The rail mounts with the directory; the detail fills in with the preflight. */
async function renderWithMarket() {
  const utils = renderPage();
  await screen.findByRole('tab', { name: /Elite Models/ });
  return utils;
}

/** Elite is the reference house, so it is not the pane that opens by default. */
async function openElite(user) {
  await user.click(screen.getByRole('tab', { name: /Elite Models/ }));
  return screen.findByRole('heading', { name: 'Elite Models', level: 2 });
}

function elitePanel() {
  return screen.getByRole('heading', { name: 'Elite Models', level: 2 }).closest('section');
}

/**
 * A whole line, read the way a person reads it. The page sets emphasis inline
 * — an italic shot name, a lighter "of" between two numerals — so the string a
 * talent sees is spread across several elements and `getByText` alone cannot
 * see it.
 */
function line(scope, pattern) {
  const normalize = (node) => node.textContent.replace(/\s+/g, ' ').trim();
  return scope.queryAllByText(
    (_, element) => element?.tagName === 'P' && pattern.test(normalize(element)),
  );
}

/*
 * Mirrors `routeDto` in `src/domains/spec-registry/preflight-service.js`.
 * `acceptsPholioSubmissions` comes from the agency-routes join, not from
 * `origin` — an agency can be live on Pholio while Pholio researched its spec.
 */
const routes = [
  {
    // First in the payload, submittable, and publishes no shot list at all —
    // so it is the row the default selection has to step over.
    seriesId: 'wilhelmina:selected-market-online',
    revisionId: 'wilhelmina:selected-market-online@1',
    agencyName: 'Wilhelmina',
    marketLabel: 'Selected market',
    sourceUrl: 'https://example.com/wilhelmina',
    sourceStatus: 'confirmed',
    sourceCheckedOn: '2026-08-09',
    sourceFreshness: { state: 'checked', nextReviewOn: '2026-11-09' },
    acceptsPholioSubmissions: true,
    channel: { type: 'official_web_form', url: 'https://example.com/wilhelmina' },
    verification: null,
    callWindows: [],
  },
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
    seriesId: 'storm-management-uk:online',
    revisionId: 'storm-management-uk:online@1',
    agencyName: 'Storm Management',
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

/** A slice of `registryTaxonomyLabels()`, the vocabulary the page speaks in. */
const labels = {
  'shot.frame': {
    label: 'Shot frame',
    values: {
      full_length: { label: 'Full length' },
      portrait_length: { label: 'Portrait length' },
      close_up: { label: 'Close-up' },
      headshot: { label: 'Headshot' },
      mid_length: { label: 'Mid-length' },
    },
  },
  'shot.view': { label: 'Shot view', values: { profile: { label: 'Profile' } } },
  'shot.purpose': {
    label: 'Shot purpose',
    values: { personality: { label: 'Personality' } },
  },
  'appearance.hair_state': {
    label: 'Hair state',
    values: { pulled_back: { label: 'Pulled back' } },
  },
  'appearance.makeup_level': { label: 'Makeup level', values: {} },
  'expression.smile': { label: 'Smile visible', values: {} },
  'file.size_bytes': { label: 'File size', values: {} },
  'applicant.age_years': { label: 'Age', values: {} },
  'contact.email': { label: 'Email', values: {} },
  'social.instagram': { label: 'Instagram', values: {} },
  'measurements.height': { label: 'Height field', values: {} },
  'files.per_file_size': { label: 'Per-file size limit', values: {} },
  'presentation.background': { label: 'Background guidance', values: {} },
};

/** `findingDto` — every field Q1 landed, defaults included. */
function finding(overrides) {
  return {
    categoryKey: 'shots',
    category: 'Shots',
    outcome: 'satisfied',
    modality: 'requested',
    severity: null,
    requiresAttention: false,
    field: null,
    matchValue: null,
    matchValues: [],
    matchKey: null,
    guidance: null,
    target: null,
    assignments: [],
    actual: null,
    minimum: null,
    maximum: null,
    factStates: [],
    ...overrides,
  };
}

/**
 * Elite publishes six shots and four of them are conjunctions. `matchValue` is
 * null for every one of those, which is exactly why the old grid drew two.
 */
const eliteEvaluation = {
  seriesId: 'elite-models-na:online-general',
  available: true,
  findings: [
    finding({
      id: 'shots:full-length',
      slotKey: 'elite-models-na:online-general#shots:full-length',
      field: 'shot.frame',
      matchValue: 'full_length',
      matchValues: [{ field: 'shot.frame', operator: 'equals', value: 'full_length' }],
      matchKey: 'shot.frame:equals:full_length',
      sourceLabel: 'Full length',
      assignments: [{ instance: 1, imageId: 'active-image' }],
    }),
    finding({
      id: 'shots:full-length-profile',
      slotKey: 'elite-models-na:online-general#shots:full-length-profile',
      matchValues: [
        { field: 'shot.frame', operator: 'equals', value: 'full_length' },
        { field: 'shot.view', operator: 'equals', value: 'profile' },
      ],
      matchKey: 'shot.frame:equals:full_length&shot.view:equals:profile',
      sourceLabel: 'Full length profile',
    }),
    finding({
      id: 'shots:portrait-length',
      slotKey: 'elite-models-na:online-general#shots:portrait-length',
      field: 'shot.frame',
      matchValue: 'portrait_length',
      matchValues: [{ field: 'shot.frame', operator: 'equals', value: 'portrait_length' }],
      matchKey: 'shot.frame:equals:portrait_length',
      sourceLabel: 'Portrait length',
    }),
    finding({
      id: 'shots:close-up-hair-pulled-back',
      slotKey: 'elite-models-na:online-general#shots:close-up-hair-pulled-back',
      matchValues: [
        { field: 'shot.frame', operator: 'equals', value: 'close_up' },
        { field: 'appearance.hair_state', operator: 'equals', value: 'pulled_back' },
      ],
      matchKey: 'appearance.hair_state:equals:pulled_back&shot.frame:equals:close_up',
      sourceLabel: 'Close up (hair pulled back)',
    }),
    finding({
      id: 'shots:close-up-profile-hair-pulled-back',
      slotKey: 'elite-models-na:online-general#shots:close-up-profile',
      matchValues: [
        { field: 'shot.frame', operator: 'equals', value: 'close_up' },
        { field: 'shot.view', operator: 'equals', value: 'profile' },
        { field: 'appearance.hair_state', operator: 'equals', value: 'pulled_back' },
      ],
      matchKey:
        'appearance.hair_state:equals:pulled_back&shot.frame:equals:close_up&shot.view:equals:profile',
      sourceLabel: 'Close up profile (hair pulled back)',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      target: { href: '/dashboard/talent/media', label: 'Open the book' },
    }),
    finding({
      id: 'shots:personality-pic',
      slotKey: 'elite-models-na:online-general#shots:personality-pic',
      field: 'shot.purpose',
      matchValue: 'personality',
      matchValues: [{ field: 'shot.purpose', operator: 'equals', value: 'personality' }],
      matchKey: 'shot.purpose:equals:personality',
      sourceLabel: 'Personality pic',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      target: { href: '/dashboard/talent/media', label: 'Open the book' },
    }),
    finding({
      id: 'shotCount:count',
      slotKey: 'elite-models-na:online-general#shotCount:count',
      categoryKey: 'shotCount',
      category: 'Shot count',
      outcome: 'missing',
      minimum: 6,
      maximum: 6,
      actual: 5,
      sourceLabel: 'Shot Count',
    }),
    finding({
      id: 'setWide:no-makeup',
      slotKey: 'elite-models-na:online-general#setWide:no-makeup',
      categoryKey: 'setWide',
      category: 'Presentation',
      field: 'appearance.makeup_level',
      modality: 'prohibited',
      sourceLabel: 'do not wear any makeup',
      outcome: 'missing',
    }),
    finding({
      id: 'setWide:no-smiles',
      slotKey: 'elite-models-na:online-general#setWide:no-smiles',
      categoryKey: 'setWide',
      category: 'Presentation',
      field: 'expression.smile',
      modality: 'prohibited',
      sourceLabel: 'No smiles',
      outcome: 'unknown',
    }),
    finding({
      id: 'files:maximum-image-size',
      slotKey: 'elite-models-na:online-general#files:maximum-image-size',
      categoryKey: 'files',
      category: 'Files',
      field: 'file.size_bytes',
      modality: 'required',
      sourceLabel: 'Max. 5mb each',
      outcome: 'unknown',
    }),
    finding({
      id: 'eligibility:minimum-age',
      slotKey: 'elite-models-na:online-general#eligibility:minimum-age',
      categoryKey: 'eligibility',
      category: 'Eligibility',
      field: 'applicant.age_years',
      modality: 'preferred',
      sourceLabel: 'female identified persons ages 15 and up',
      outcome: 'missing',
      factStates: [{ field: 'applicant.age_years', state: 'missing', source: 'profile' }],
      target: { href: '/dashboard/talent/profile', label: 'Open profile' },
    }),
    finding({
      id: 'applicationFields:email',
      slotKey: 'elite-models-na:online-general#applicationFields:email',
      categoryKey: 'applicationFields',
      category: 'Application fields',
      field: 'contact.email',
      sourceLabel: 'E-mail',
      outcome: 'unknown',
    }),
    finding({
      id: 'applicationFields:height',
      slotKey: 'elite-models-na:online-general#applicationFields:height',
      categoryKey: 'applicationFields',
      category: 'Application fields',
      field: 'measurements.height',
      sourceLabel: 'Height',
      outcome: 'unknown',
    }),
    finding({
      id: 'applicationFields:instagram',
      slotKey: 'elite-models-na:online-general#applicationFields:instagram',
      categoryKey: 'applicationFields',
      category: 'Application fields',
      field: 'social.instagram',
      sourceLabel: 'Instagram URL',
      outcome: 'unknown',
    }),
    finding({
      id: 'sourceUnknown:files.per_file_size:1',
      slotKey: 'elite-models-na:online-general#sourceUnknown:files.per_file_size:1',
      categoryKey: 'sourceUnknown',
      category: 'Not published',
      field: 'files.per_file_size',
      sourceLabel: 'Per File Size',
      outcome: 'unknown',
    }),
    finding({
      id: 'sourceUnknown:presentation.background:1',
      slotKey: 'elite-models-na:online-general#sourceUnknown:presentation.background:1',
      categoryKey: 'sourceUnknown',
      category: 'Not published',
      field: 'presentation.background',
      sourceLabel: 'Background',
      outcome: 'unknown',
    }),
  ],
  summary: { needsAttention: 4, informational: 0, confirm: 6, included: 4 },
  shotCoverage: { selected: 5, published: 6, matched: 4 },
};

/** Storm is one headshot away from a complete set — the recommendation's subject. */
const stormEvaluation = {
  seriesId: 'storm-management-uk:online',
  available: true,
  findings: [
    finding({
      id: 'shots:headshot',
      slotKey: 'storm-management-uk:online#shots:headshot',
      field: 'shot.frame',
      matchValue: 'headshot',
      matchValues: [{ field: 'shot.frame', operator: 'equals', value: 'headshot' }],
      matchKey: 'shot.frame:equals:headshot',
      // The agency's own wording is a form asterisk, never a shot name.
      sourceLabel: 'Headshot *',
      outcome: 'missing',
      severity: 'attention',
      requiresAttention: true,
      target: { href: '/dashboard/talent/media', label: 'Open the book' },
    }),
    finding({
      id: 'shots:mid-length',
      slotKey: 'storm-management-uk:online#shots:mid-length',
      field: 'shot.frame',
      matchValue: 'mid_length',
      matchValues: [{ field: 'shot.frame', operator: 'equals', value: 'mid_length' }],
      matchKey: 'shot.frame:equals:mid_length',
      sourceLabel: 'Mid length *',
    }),
    finding({
      id: 'shots:full-length',
      slotKey: 'storm-management-uk:online#shots:full-length',
      field: 'shot.frame',
      matchValue: 'full_length',
      matchValues: [{ field: 'shot.frame', operator: 'equals', value: 'full_length' }],
      matchKey: 'shot.frame:equals:full_length',
      sourceLabel: 'Full length *',
      assignments: [{ instance: 1, imageId: 'active-image' }],
    }),
  ],
  summary: { needsAttention: 1, informational: 0, confirm: 0, included: 2 },
  shotCoverage: { selected: 5, published: 3, matched: 2 },
};

/** Wilhelmina publishes a form and nothing else. Never a fake "0 of 0". */
const wilhelminaEvaluation = {
  seriesId: 'wilhelmina:selected-market-online',
  available: true,
  findings: [
    finding({
      id: 'applicationFields:email',
      slotKey: 'wilhelmina:selected-market-online#applicationFields:email',
      categoryKey: 'applicationFields',
      category: 'Application fields',
      field: 'contact.email',
      sourceLabel: 'Email',
      outcome: 'unknown',
    }),
  ],
  summary: { needsAttention: 0, informational: 0, confirm: 1, included: 0 },
  shotCoverage: { selected: 5, published: 0, matched: 0 },
};

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

describe('RequirementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      profile: { images: [{ id: 'profile-image' }] },
      images: [
        { id: 'active-image', status: 'active', asset_kind: 'image', path: 'digitals/one.jpg' },
        { id: 'deleted-image', deleted_at: '2026-01-01' },
        { id: 'video-image', asset_kind: 'video' },
      ],
    });
    talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes, labels });
    talentApi.preflightSpecRegistry.mockResolvedValue({
      labels,
      results: [wilhelminaEvaluation, eliteEvaluation, stormEvaluation],
    });
    talentApi.listCallWindows.mockResolvedValue(callWindows);
    talentApi.logTrackedSubmission.mockResolvedValue({ id: 'tracked-1' });
  });

  test('checks the talent’s current agency-visible digitals, once, for every route', async () => {
    renderPage();

    await screen.findByRole('tab', { name: /Elite Models/ });
    await waitFor(() => {
      expect(talentApi.preflightSpecRegistry).toHaveBeenCalledWith({
        seriesIds: [
          'wilhelmina:selected-market-online',
          'elite-models-na:online-general',
          'storm-management-uk:online',
        ],
        imageIds: ['active-image'],
      });
    });
  });

  test('never draws a table — the horizontal-scroll matrix is gone', async () => {
    await renderWithMarket();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  describe('the masthead', () => {
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
        await screen.findByText('Registry verified continuously · 3 agencies'),
      ).toBeInTheDocument();
    });

    test('reads the market from real counts, over agencies that published a shot list', async () => {
      await renderWithMarket();

      // 4 of Elite's 6 plus 2 of Storm's 3. Wilhelmina publishes none, so it is
      // neither a numerator nor a denominator.
      expect(
        await screen.findByText(
          'Your set covers 6 of 9 published shots across 2 agencies.',
        ),
      ).toBeInTheDocument();
    });

    test('separates the agencies one shot would finish from the ones that also ask', async () => {
      await renderWithMarket();

      // Storm is missing exactly one shot, so a headshot genuinely completes
      // them. Elite is missing two, so nothing here claims a shot would.
      await waitFor(() =>
        expect(
          line(screen, /^One Headshot would complete your set for Storm Management\.$/),
        ).not.toHaveLength(0),
      );
      expect(screen.queryByText(/would satisfy \d+ more agencies/)).not.toBeInTheDocument();
    });
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

      expect(within(strip).getByText('Que Management')).toBeInTheDocument();
      expect(within(strip).getByText('MSA Models')).toBeInTheDocument();
    });

    test('orders by what happens next, and says the day when the time is unpublished', async () => {
      const strip = await findStrip();
      const names = within(strip)
        .getAllByRole('listitem')
        .map((item) => item.textContent);

      expect(names.findIndex((text) => /Que Management/.test(text))).toBeLessThan(
        names.findIndex((text) => /Muse Management/.test(text)),
      );
      expect(within(strip).getByText('Tue')).toBeInTheDocument();
    });

    test('never invents a schedule when there is none to publish', async () => {
      talentApi.listCallWindows.mockResolvedValue([]);
      await renderWithMarket();

      expect(
        screen.queryByRole('heading', { name: 'Open calls this week' }),
      ).not.toBeInTheDocument();
    });

    test('a failed calendar never takes the requirements page down with it', async () => {
      talentApi.listCallWindows.mockRejectedValue(new Error('offline'));
      await renderWithMarket();

      expect(
        screen.queryByRole('heading', { name: 'Open calls this week' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('the shot coverage strip', () => {
    async function findStrip() {
      const heading = await screen.findByRole('heading', {
        name: 'Every shot this market asks for',
        level: 2,
      });
      return heading.closest('section');
    }

    test('merges the same canonical shot across agencies into one row', async () => {
      await renderWithMarket();
      const strip = await findStrip();

      // Elite and Storm both publish a full length; that is one row, and it is
      // named once, canonically — never "Full length *".
      const rows = within(strip)
        .getAllByRole('listitem')
        .map((item) => item.textContent);
      expect(rows.filter((text) => /^Full length(?!\s+profile)/.test(text))).toHaveLength(1);
      expect(within(strip).getByText('Full length')).toBeInTheDocument();
      expect(within(strip).queryByText(/Full length \*/)).not.toBeInTheDocument();
      expect(within(strip).queryByText(/Mid length \*/)).not.toBeInTheDocument();
      expect(within(strip).getByText('Mid-length')).toBeInTheDocument();
    });

    test('carries every compound slot, which the matchValue-keyed grid dropped', async () => {
      await renderWithMarket();
      const strip = await findStrip();

      expect(within(strip).getByText('Full length profile')).toBeInTheDocument();
      expect(within(strip).getByText('Close-up, hair pulled back')).toBeInTheDocument();
      expect(
        within(strip).getByText('Close-up profile, hair pulled back'),
      ).toBeInTheDocument();
      expect(within(strip).getByText('Personality shot')).toBeInTheDocument();
    });

    test('shows the talent’s own frame for a covered shot, and an empty one otherwise', async () => {
      await renderWithMarket();
      const strip = await findStrip();

      const covered = within(strip)
        .getAllByRole('listitem')
        .find((item) => /^Full length(?!\s+profile)/.test(item.textContent));
      expect(within(covered).getByRole('presentation', { hidden: true })).toHaveAttribute(
        'src',
        '/uploads/digitals/one.jpg',
      );

      const needed = within(strip)
        .getAllByRole('listitem')
        .find((item) => /^Headshot/.test(item.textContent));
      expect(within(needed).queryByRole('presentation', { hidden: true })).toBeNull();
    });

    test('states the demand and the state in words, never hover-only', async () => {
      await renderWithMarket();
      const strip = await findStrip();

      const row = within(strip)
        .getAllByRole('listitem')
        .find((item) => /^Full length(?!\s+profile)/.test(item.textContent));
      expect(within(row).getByText('asked for by 2 agencies')).toBeInTheDocument();
      expect(within(row).getByText('In your set')).toBeInTheDocument();

      const needed = within(strip)
        .getAllByRole('listitem')
        .find((item) => /^Headshot/.test(item.textContent));
      expect(within(needed).getByText('asked for by 1 agency')).toBeInTheDocument();
      expect(within(needed).getByText('Still needed')).toBeInTheDocument();
    });
  });

  describe('the market rail', () => {
    test('names each agency in full, with its market, channel and coverage figure', async () => {
      await renderWithMarket();

      const row = screen.getByRole('tab', { name: /Elite Models/ });
      expect(within(row).getByText('New York')).toBeInTheDocument();
      expect(within(row).getByText('Applies on their site')).toBeInTheDocument();
      expect(within(row).getByText('4 of 6')).toBeInTheDocument();

      const storm = screen.getByRole('tab', { name: /Storm Management/ });
      expect(within(storm).getByText('Accepts Pholio submissions')).toBeInTheDocument();
      expect(within(storm).getByText('2 of 3')).toBeInTheDocument();
    });

    test('says so plainly when an agency publishes no shot list — never a fake 0 of 0', async () => {
      await renderWithMarket();

      const row = screen.getByRole('tab', { name: /Wilhelmina/ });
      expect(
        within(row).getByText('No shot list published — form details only'),
      ).toBeInTheDocument();
      expect(within(row).queryByText('0 of 0')).not.toBeInTheDocument();
    });

    test('an agency with only a form still gets its form read out', async () => {
      const user = userEvent.setup();
      await renderWithMarket();

      await user.click(screen.getByRole('tab', { name: /Wilhelmina/ }));
      const panel = (
        await screen.findByRole('heading', { name: 'Wilhelmina', level: 2 })
      ).closest('section');

      expect(
        within(panel).getByText('Wilhelmina publishes no shot list — form details only.'),
      ).toBeInTheDocument();
      expect(within(panel).getByText('email.')).toBeInTheDocument();
      // No lockup, because there is no figure to state.
      expect(line(within(panel), /^\d+ of \d+$/)).toHaveLength(0);
    });

    test('opens on an agency that actually published a shot list', async () => {
      await renderWithMarket();

      // Wilhelmina is the first row and demonstrates nothing, so the pane opens
      // on the first agency whose check has something to show.
      expect(
        await screen.findByRole('heading', { name: 'Storm Management', level: 2 }),
      ).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Storm Management/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    test('is the navigation — selecting a row opens that agency', async () => {
      const user = userEvent.setup();
      await renderWithMarket();

      await openElite(user);
      expect(screen.getByRole('tab', { name: /Elite Models/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(
        screen.queryByRole('heading', { name: 'Storm Management', level: 2 }),
      ).not.toBeInTheDocument();
    });

    test('is one tab stop with arrow keys inside it, not one stop per agency', async () => {
      const user = userEvent.setup();
      await renderWithMarket();

      const rows = screen.getAllByRole('tab');
      const selected = rows.filter((row) => row.getAttribute('tabindex') === '0');
      expect(selected).toHaveLength(1);
      expect(selected[0]).toHaveAccessibleName(/Storm Management/);

      selected[0].focus();
      await user.keyboard('{ArrowDown}');
      expect(
        await screen.findByRole('heading', { name: 'Elite Models', level: 2 }),
      ).toBeInTheDocument();

      await user.keyboard('{Home}');
      expect(
        await screen.findByRole('heading', { name: 'Wilhelmina', level: 2 }),
      ).toBeInTheDocument();
    });
  });

  describe('the opened agency', () => {
    test('leads with the coverage figure and the shots that are missing', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      const panel = elitePanel();
      expect(line(within(panel), /^4 of 6$/)).toHaveLength(1);
      expect(
        line(within(panel), /^of the shots Elite Models publishes are in your current set\.$/),
      ).toHaveLength(1);
      expect(
        within(panel).getByText(
          'Missing: Close-up profile, hair pulled back · Personality shot',
        ),
      ).toBeInTheDocument();
    });

    test('sorts by category, never by how sure Pholio was', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      const sections = within(elitePanel())
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent);
      expect(sections).toEqual([
        'Shots',
        'Set rules',
        'Files',
        'Eligibility',
        'Their form asks for',
        'Not published',
      ]);
      ['Attention', 'Confirm', 'Guidance', 'Included'].forEach((word) => {
        expect(within(elitePanel()).queryByText(new RegExp(`^${word}`))).toBeNull();
      });
    });

    test('names every published shot canonically, with the state in words', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      const panel = elitePanel();
      // All six reach the client; four of them are conjunctions.
      ['Full length', 'Full length profile', 'Portrait length', 'Close-up, hair pulled back', 'Close-up profile, hair pulled back', 'Personality shot'].forEach(
        (name) => {
          expect(within(panel).getByText(name)).toBeInTheDocument();
        },
      );
      expect(within(panel).queryByText('Personality pic')).not.toBeInTheDocument();
      expect(within(panel).getAllByText('In your set')).toHaveLength(4);
      expect(within(panel).getAllByText('Still needed')).toHaveLength(2);
      expect(
        within(panel).getByText('They ask for exactly 6 images — you have 5 images in your current set.'),
      ).toBeInTheDocument();
    });

    test('elevates the shoot instructions, with the modality spoken honestly', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      const panel = elitePanel();
      expect(within(panel).getByText('Do not wear any makeup')).toBeInTheDocument();
      expect(within(panel).getByText('No smiles')).toBeInTheDocument();
      expect(within(panel).getAllByText('Not allowed')).toHaveLength(2);
    });

    test('says what the file limits mean for the export, in one sentence', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      expect(
        within(elitePanel()).getByText(
          /Their form publishes limits on file size — your export is converted and resized to fit\./,
        ),
      ).toBeInTheDocument();
      // The agency's own wording is quoted, never spoken in Pholio's voice.
      expect(within(elitePanel()).getByText(/As published: “Max\. 5mb each”/)).toBeInTheDocument();
    });

    test('never turns a fact Pholio does not hold into a verdict on the talent', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      expect(
        within(elitePanel()).getByText('Age — Pholio can’t check this from your profile.'),
      ).toBeInTheDocument();
      expect(within(elitePanel()).queryByText(/not eligible|too young|fail/i)).toBeNull();
    });

    test('renders the form as one list and one group sentence, not 22 rows', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      const panel = elitePanel();
      expect(within(panel).getByText('email, height and Instagram.')).toBeInTheDocument();
      expect(
        within(panel).getByText('Pholio can’t check these from your profile — have them ready.'),
      ).toBeInTheDocument();
      // One sentence, not one row per field repeating the same guidance.
      expect(
        within(panel).queryAllByText(/Pholio cannot verify this/),
      ).toHaveLength(0);
    });

    test('groups everything the source never published into one sentence', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      expect(
        within(elitePanel()).getByText(
          'Elite Models doesn’t publish file limits or shoot guidance.',
        ),
      ).toBeInTheDocument();
    });

    test('renders the destination each finding points at', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      const panel = elitePanel();
      expect(within(panel).getByRole('link', { name: 'Open the book' })).toHaveAttribute(
        'href',
        '/dashboard/talent/media',
      );
      expect(within(panel).getAllByRole('link', { name: 'Open profile' })[0]).toHaveAttribute(
        'href',
        '/dashboard/talent/profile',
      );
    });

    test('states the registration as a sentence, and only when Pholio holds one', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      expect(
        screen.getByText('NYSDOL-registered · Cert 26-69YIX-LSFW · expires July 2028'),
      ).toBeInTheDocument();
      expect(screen.getByText('Registry-verified official channel.')).toBeInTheDocument();
      expect(screen.getByText('Verified on August 9, 2026')).toBeInTheDocument();

      // Storm has no registry match. Absence says nothing (ruling R3).
      await user.click(screen.getByRole('tab', { name: /Storm Management/ }));
      await screen.findByRole('heading', { name: 'Storm Management', level: 2 });
      expect(screen.queryByText(/NYSDOL/)).not.toBeInTheDocument();
      expect(screen.queryByText(/unverified/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Registry-verified official channel.')).not.toBeInTheDocument();
    });

    test('reads out a published open call in the agency’s own hours', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      expect(
        screen.getByText('Walk-in open call: Thursdays 3–4 PM ET · 245 Fifth Avenue'),
      ).toBeInTheDocument();
    });

    test('names the errand an emailed application actually is', async () => {
      talentApi.getSpecRegistryRoutes.mockResolvedValue({
        labels,
        routes: [
          routes[0],
          { ...routes[1], channel: { type: 'official_email', url: 'mailto:new@example.com' } },
          routes[2],
        ],
      });
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      expect(
        screen.getByText('Applies by email — we prepare the message and attachments.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Applies via their own site — we prepare a conforming set.'),
      ).not.toBeInTheDocument();
    });

    test('says plainly when an agency cannot be applied to through Pholio', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

      expect(
        screen.getByText('Applies via their own site — we prepare a conforming set.'),
      ).toBeInTheDocument();
    });

    test('carries provenance and non-affiliation, without needing to be opened', async () => {
      const user = userEvent.setup();
      await renderWithMarket();
      await openElite(user);

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
      await renderWithMarket();
      await openElite(user);

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
        const { queryClient } = await renderWithMarket();
        await openElite(user);
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
        await renderWithMarket();
        await openElite(user);
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
        await renderWithMarket();
        await openElite(user);
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
      await renderWithMarket();
      await openElite(user);

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
      await renderWithMarket();
      await openElite(user);

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
      await renderWithMarket();
      await openElite(user);

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

    test('shows the empty state without checking or drawing a market', async () => {
      talentApi.getSpecRegistryRoutes.mockResolvedValue({ routes: [] });
      renderPage();

      expect(
        await screen.findByText('No agency requirements are catalogued yet.'),
      ).toBeInTheDocument();
      expect(talentApi.preflightSpecRegistry).not.toHaveBeenCalled();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    test('is honest when catalogued agencies publish no shot list at all', async () => {
      talentApi.preflightSpecRegistry.mockResolvedValue({
        labels,
        results: [
          { ...wilhelminaEvaluation, findings: [], shotCoverage: null },
          { ...eliteEvaluation, findings: [], shotCoverage: null },
          { ...stormEvaluation, findings: [], shotCoverage: null },
        ],
      });
      await renderWithMarket();

      await waitFor(() => expect(talentApi.preflightSpecRegistry).toHaveBeenCalled());
      // No coverage strip invented out of nothing, and no fake figures.
      expect(
        screen.queryByRole('heading', { name: 'Every shot this market asks for' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByText('No shot list published — form details only').length,
      ).toBeGreaterThan(0);
      // The rail still works, so every agency's detail is still reachable.
      expect(screen.getByRole('tab', { name: /Elite Models/ })).toBeInTheDocument();
    });
  });
});
