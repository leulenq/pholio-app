import { describe, expect, test } from 'vitest';
import {
  CHANNEL_TYPE,
  REGISTRY_LABEL,
  SLOT_STATE,
  buildAgencyView,
  canonicalShotLabel,
  formatRegistryMonth,
  labelFor,
  marginaliaFor,
  publishedWording,
  readCallWindows,
  readFinding,
  readLabels,
  readRoute,
  readVerification,
  readVerificationNotice,
} from '../specRegistry';
import {
  TRACKER_CHANNELS,
  VERIFICATION_REGISTRIES,
} from '../../../../shared/constants/submissionTracker';

/**
 * The wire contract, tested where it is read rather than where it is drawn.
 *
 * Mirrors `routeDto` / `findingDto` / `verificationDto` / `callWindowDto` /
 * `registryTaxonomyLabels` in
 * `src/domains/spec-registry/preflight-service.js` and the payload of
 * `GET /api/talent/call-windows`.
 */

const verification = {
  registry: 'ny_dol',
  certificateNumber: '26-69YIX-LSFW',
  expiresOn: '2028-07-31',
  registryStatus: 'active',
  verifiedOn: '2026-08-15',
};

/** A slice of the real taxonomy pack, exactly as the DTO ships it. */
const labels = {
  'shot.frame': {
    label: 'Shot frame',
    values: {
      full_length: { label: 'Full length' },
      close_up: { label: 'Close-up' },
      mid_length: { label: 'Mid-length' },
      headshot: { label: 'Headshot' },
    },
  },
  'shot.view': { label: 'Shot view', values: { profile: { label: 'Profile' } } },
  'shot.purpose': {
    label: 'Shot purpose',
    values: { personality: { label: 'Personality' } },
  },
  'appearance.hair_state': {
    label: 'Hair state',
    values: { pulled_back: { label: 'Pulled back' }, up: { label: 'Hair up' } },
  },
  'appearance.makeup_level': { label: 'Makeup level', values: {} },
  'file.size_bytes': { label: 'File size', values: {} },
  'file.mime_type': { label: 'File MIME type', values: {} },
  'applicant.age_years': { label: 'Age', values: {} },
  'contact.email': { label: 'Email', values: {} },
  'social.instagram': { label: 'Instagram', values: {} },
  'measurements.height': { label: 'Height field', values: {} },
  'files.per_file_size': { label: 'Per-file size limit', values: {} },
  'presentation.lighting': { label: 'Lighting guidance', values: {} },
};

/** `findingDto`, with the fields Q1 landed. */
function finding(overrides = {}) {
  return {
    id: 'shots:full-length',
    slotKey: 'elite:online#shots:full-length',
    assertionId: 'full-length',
    categoryKey: 'shots',
    category: 'Shots',
    outcome: 'satisfied',
    modality: 'requested',
    severity: null,
    requiresAttention: false,
    field: 'shot.frame',
    matchValue: 'full_length',
    matchValues: [{ field: 'shot.frame', operator: 'equals', value: 'full_length' }],
    matchKey: 'shot.frame:equals:full_length',
    sourceLabel: 'Full length',
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

describe('the shared vocabularies', () => {
  test('every channel the detail branches on is a channel the tracker accepts', () => {
    // The detail hands `channelType` straight to `logTrackedSubmission`; a name
    // here that the tracker's vocabulary does not carry would be a 400 at the
    // one moment the talent is trying to record a real submission.
    Object.values(CHANNEL_TYPE).forEach((value) => {
      expect(TRACKER_CHANNELS).toContain(value);
    });
  });

  test('every registry in the vocabulary has a talent-facing name', () => {
    // An unlabelled registry renders as no claim at all, which would quietly
    // delete a verification the pack went to the trouble of curating.
    VERIFICATION_REGISTRIES.forEach((registry) => {
      expect(REGISTRY_LABEL[registry]).toBeTruthy();
    });
  });
});

describe('readRoute', () => {
  test('carries the channel type, the registry match and the open calls', () => {
    const route = readRoute({
      seriesId: 'muse-ny:online',
      agencyName: 'Muse Management',
      channel: { type: CHANNEL_TYPE.OFFICIAL_EMAIL, url: 'https://example.com/muse' },
      acceptsPholioSubmissions: false,
      verification,
      callWindows: [
        {
          id: 'muse-thu',
          displayName: 'Muse Management',
          label: 'Walk-in open call',
          weekday: 4,
          startMinute: 900,
          endMinute: 960,
          timezone: 'America/New_York',
          location: null,
          instructions: null,
          sourceUrl: null,
        },
      ],
    });

    expect(route.channelType).toBe('official_email');
    expect(route.verification.certificateNumber).toBe('26-69YIX-LSFW');
    expect(route.callWindows).toHaveLength(1);
    expect(route.callWindows[0].weekday).toBe(4);
    // The route's copy of a window carries no verification date of its own.
    expect(route.callWindows[0].verifiedOn).toBeNull();
  });

  test('reads nothing rather than something empty when the overlay is absent', () => {
    const route = readRoute({ seriesId: 'models1-uk:online', agencyName: 'Models 1' });

    expect(route.channelType).toBeNull();
    expect(route.verification).toBeNull();
    expect(route.callWindows).toEqual([]);
  });
});

describe('readVerification', () => {
  test('a match without a certificate number is not a match', () => {
    expect(readVerification({ registry: 'ny_dol' })).toBeNull();
    expect(readVerification(null)).toBeNull();
  });
});

describe('readVerificationNotice', () => {
  test('states the registration as one line, at month precision', () => {
    expect(readVerificationNotice(verification)).toBe(
      'NYSDOL-registered · Cert 26-69YIX-LSFW · expires July 2028',
    );
  });

  test('an expiry Pholio does not hold simply goes unsaid', () => {
    expect(readVerificationNotice({ ...verification, expiresOn: null })).toBe(
      'NYSDOL-registered · Cert 26-69YIX-LSFW',
    );
  });

  test('absence renders nothing — never "unverified" (ruling R3)', () => {
    expect(readVerificationNotice(null)).toBeNull();
    expect(readVerificationNotice(undefined)).toBeNull();
  });

  test('a lapsed or revoked registration is not a positive claim either', () => {
    expect(readVerificationNotice({ ...verification, registryStatus: 'expired' })).toBeNull();
    expect(readVerificationNotice({ ...verification, registryStatus: 'revoked' })).toBeNull();
  });

  test('a registry with no talent-facing name states nothing at all', () => {
    expect(readVerificationNotice({ ...verification, registry: 'ca_dol' })).toBeNull();
  });
});

describe('formatRegistryMonth', () => {
  test('reads a calendar date as a month, without a timezone shift', () => {
    // "2028-01-01" parsed as UTC midnight renders as December west of
    // Greenwich — the whole reason the date helpers parse by parts.
    expect(formatRegistryMonth('2028-01-01')).toBe('January 2028');
    expect(formatRegistryMonth(null)).toBeNull();
  });
});

describe('readCallWindows', () => {
  const window = {
    id: 'msa-tue',
    organizationId: null,
    displayName: 'MSA Models',
    label: 'Open call',
    weekday: 2,
    startMinute: null,
    endMinute: null,
    timezone: 'America/New_York',
    verifiedOn: '2026-08-15',
  };

  test('reads the standalone payload whether or not the envelope was unwrapped', () => {
    expect(readCallWindows([window])).toHaveLength(1);
    expect(readCallWindows({ data: [window] })).toHaveLength(1);
    expect(readCallWindows(null)).toEqual([]);
  });

  test('keeps a window whose day is published but whose time is not', () => {
    const [read] = readCallWindows([window]);
    expect(read.startMinute).toBeNull();
    expect(read.organizationId).toBeNull();
    expect(read.verifiedOn).toBe('2026-08-15');
  });

  test('drops a window that cannot be placed in a week', () => {
    expect(readCallWindows([{ ...window, weekday: 0 }])).toEqual([]);
    expect(readCallWindows([{ ...window, id: null }])).toEqual([]);
  });
});

describe('readFinding', () => {
  test('keeps the row identity for compound slots, which have no matchValue', () => {
    const read = readFinding(
      finding({
        matchValue: null,
        matchValues: [
          { field: 'shot.frame', operator: 'equals', value: 'close_up' },
          { field: 'shot.view', operator: 'equals', value: 'profile' },
        ],
        matchKey: 'shot.frame:equals:close_up&shot.view:equals:profile',
        slotKey: 'elite:online#shots:close-up-profile',
      }),
    );

    // Keying on `matchValue` is what silently dropped four of Elite's six
    // published shots: every conjunction has a null value.
    expect(read.matchValue).toBeNull();
    expect(read.slotKey).toBe('elite:online#shots:close-up-profile');
    expect(read.matchKey).toBe('shot.frame:equals:close_up&shot.view:equals:profile');
    expect(read.matchValues).toHaveLength(2);
  });

  test('never leaves a finding without a row key, even on an older payload', () => {
    expect(readFinding({ id: 'files:size', outcome: 'unknown' }).slotKey).toBe('files:size');
  });
});

describe('readLabels', () => {
  test('reads the label map off whichever response carried it', () => {
    expect(readLabels(null, { labels })['shot.frame'].label).toBe('Shot frame');
    expect(readLabels({ data: { labels } })['shot.view'].label).toBe('Shot view');
    expect(readLabels(null, undefined)).toEqual({});
  });
});

describe('labelFor', () => {
  test('prefers the taxonomy label the server sent', () => {
    expect(labelFor(labels, 'shot.frame', 'mid_length')).toBe('Mid-length');
  });

  test('falls back to the studio-wide frame vocabulary, then to Title Case', () => {
    // No taxonomy entry, but the studio already names this shot everywhere else.
    expect(labelFor({}, 'shot.frame', 'full_length')).toBe('Full length');
    expect(labelFor({}, 'appearance.hair_state', 'pulled_back')).toBe('Pulled Back');
  });
});

describe('canonicalShotLabel', () => {
  const named = (matchValues) =>
    canonicalShotLabel(readFinding(finding({ matchValues, matchValue: null })), labels);

  test('names a compound slot as one shot, frame first', () => {
    expect(
      named([
        { field: 'shot.frame', value: 'close_up' },
        { field: 'shot.view', value: 'profile' },
        { field: 'appearance.hair_state', value: 'pulled_back' },
      ]),
    ).toBe('Close-up profile, hair pulled back');
  });

  test('a slot with no frame is named for what it is, not for its qualifier', () => {
    // "Profile" alone is not the name of a picture.
    expect(named([{ field: 'shot.view', value: 'profile' }])).toBe('Profile shot');
    expect(named([{ field: 'shot.purpose', value: 'personality' }])).toBe(
      'Personality shot',
    );
  });

  test('never reads back the agency’s own wording', () => {
    // Storm publishes "Mid length *"; IMG publishes "upload profile".
    expect(named([{ field: 'shot.frame', value: 'mid_length' }])).toBe('Mid-length');
    expect(named([{ field: 'shot.view', value: 'profile' }])).not.toMatch(/upload/i);
  });
});

describe('marginaliaFor', () => {
  test('says nothing when the agency’s wording is the canonical name in disguise', () => {
    expect(marginaliaFor('Mid length *', 'Mid-length')).toBeNull();
    expect(marginaliaFor('Close up profile (hair pulled back)', 'Close-up profile, hair pulled back')).toBeNull();
  });

  test('keeps the wording that genuinely differs', () => {
    expect(marginaliaFor('upload profile', 'Profile shot')).toBe('Upload profile');
  });
});

describe('publishedWording', () => {
  test('settles a shouted excerpt and typesets an elided one', () => {
    expect(publishedWording('DO NOT wear: HEELS')).toBe('Do not wear: heels');
    expect(publishedWording('avoid ... make-up')).toBe('Avoid … make-up');
  });

  test('leaves a single capitalised unit alone', () => {
    expect(publishedWording('Images cannot be over 30 MB')).toBe(
      'Images cannot be over 30 MB',
    );
  });
});

describe('buildAgencyView', () => {
  const route = { agencyName: 'Elite Models' };
  const evaluation = {
    findings: [
      finding(),
      finding({
        id: 'shots:close-up-profile',
        slotKey: 'elite#shots:close-up-profile',
        matchValue: null,
        matchKey: 'appearance.hair_state:equals:pulled_back&shot.frame:equals:close_up',
        matchValues: [
          { field: 'shot.frame', value: 'close_up' },
          { field: 'appearance.hair_state', value: 'pulled_back' },
        ],
        sourceLabel: 'Close up (hair pulled back)',
        outcome: 'missing',
        target: { href: '/dashboard/talent/media', label: 'Open the book' },
      }),
      finding({
        id: 'shotCount:count',
        slotKey: 'elite#shotCount:count',
        categoryKey: 'shotCount',
        outcome: 'missing',
        minimum: 6,
        maximum: 6,
        actual: 4,
        matchValues: [],
        matchKey: null,
      }),
      finding({
        id: 'setWide:no-makeup',
        slotKey: 'elite#setWide:no-makeup',
        categoryKey: 'setWide',
        field: 'appearance.makeup_level',
        modality: 'prohibited',
        sourceLabel: 'do not wear any makeup',
        outcome: 'missing',
        matchValues: [],
        matchKey: null,
        matchValue: null,
      }),
      finding({
        id: 'files:size',
        slotKey: 'elite#files:size',
        categoryKey: 'files',
        field: 'file.size_bytes',
        sourceLabel: 'Max. 5mb each',
        outcome: 'unknown',
        matchValues: [],
        matchKey: null,
        matchValue: null,
      }),
      finding({
        id: 'eligibility:age',
        slotKey: 'elite#eligibility:age',
        categoryKey: 'eligibility',
        field: 'applicant.age_years',
        sourceLabel: 'unable to accept applications ... under 14',
        outcome: 'missing',
        factStates: [{ field: 'applicant.age_years', state: 'missing', source: 'profile' }],
        matchValues: [],
        matchKey: null,
        matchValue: null,
      }),
      finding({
        id: 'applicationFields:email',
        slotKey: 'elite#applicationFields:email',
        categoryKey: 'applicationFields',
        field: 'contact.email',
        sourceLabel: 'E-mail',
        outcome: 'unknown',
        matchValues: [],
        matchKey: null,
        matchValue: null,
      }),
      finding({
        id: 'applicationFields:instagram',
        slotKey: 'elite#applicationFields:instagram',
        categoryKey: 'applicationFields',
        field: 'social.instagram',
        sourceLabel: 'Instagram URL',
        outcome: 'unknown',
        matchValues: [],
        matchKey: null,
        matchValue: null,
      }),
      finding({
        id: 'sourceUnknown:files.per_file_size:1',
        slotKey: 'elite#sourceUnknown:files.per_file_size:1',
        categoryKey: 'sourceUnknown',
        field: 'files.per_file_size',
        sourceLabel: 'Per File Size',
        outcome: 'unknown',
        matchValues: [],
        matchKey: null,
        matchValue: null,
      }),
      finding({
        id: 'sourceUnknown:presentation.lighting:1',
        slotKey: 'elite#sourceUnknown:presentation.lighting:1',
        categoryKey: 'sourceUnknown',
        field: 'presentation.lighting',
        outcome: 'unknown',
        matchValues: [],
        matchKey: null,
        matchValue: null,
      }),
    ],
    summary: { needsAttention: 2, informational: 0, confirm: 3, included: 1 },
    shotCoverage: { selected: 4, published: 6, matched: 1 },
  };

  const view = buildAgencyView({ route, evaluation, labels });

  test('counts only published shot slots, so the lede cannot contradict the list', () => {
    expect(view.published).toBe(2);
    expect(view.covered).toBe(1);
    expect(view.missingLabels).toEqual(['Close-up, hair pulled back']);
  });

  test('sorts by category, never by how sure Pholio was', () => {
    expect(view.shots.map((shot) => shot.state)).toEqual([
      SLOT_STATE.IN_SET,
      SLOT_STATE.NEEDED,
    ]);
    expect(view.setRules[0]).toMatchObject({
      subject: 'Makeup level',
      text: 'Do not wear any makeup',
      modality: 'Not allowed',
    });
    expect(view.shotCount).toEqual({ minimum: 6, maximum: 6, actual: 4 });
  });

  test('names the file limits for a person, not for a validator', () => {
    expect(view.files.subjects).toEqual(['file size']);
    expect(view.files.published).toEqual(['Max. 5mb each']);
  });

  test('never turns a fact Pholio does not hold into a verdict on the talent', () => {
    expect(view.eligibility[0].sentence).toBe(
      'Age — Pholio can’t check this from your profile.',
    );
  });

  test('renders the form as one list and one group sentence, not 22 rows', () => {
    expect(view.formFields.list).toEqual(['email', 'Instagram']);
    expect(view.formFields.unverifiable).toBe(true);
  });

  test('groups everything the source never published into one sentence', () => {
    expect(view.notPublished).toBe(
      'Elite Models doesn’t publish file limits or shoot guidance.',
    );
  });
});
