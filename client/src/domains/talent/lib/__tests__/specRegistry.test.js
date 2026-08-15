import { describe, expect, test } from 'vitest';
import {
  CHANNEL_TYPE,
  REGISTRY_LABEL,
  formatRegistryMonth,
  readCallWindows,
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
 * Mirrors `routeDto` / `verificationDto` / `callWindowDto` in
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

describe('the shared vocabularies', () => {
  test('every channel the plate branches on is a channel the tracker accepts', () => {
    // The plate hands `channelType` straight to `logTrackedSubmission`; a name
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
