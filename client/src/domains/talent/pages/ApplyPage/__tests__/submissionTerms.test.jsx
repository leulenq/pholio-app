import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import SubmissionTerms from '../SubmissionTerms';
import { buildConsentCopy } from '../../../../opencall/components/consentCopy';

/**
 * What the applicant reads must be what the consent receipt says they read.
 *
 * The server derives `call_purpose` from the call behind the claim and records
 * an event submission under the event disclosure version — a version whose
 * content names the designers who see the package through the unauthenticated
 * pick link, restates the compensation the organizer typed, and states the
 * retention clock. Those sentences were absent from the logged-in rail, so
 * Pholio recorded consent to text nobody was shown.
 *
 * Every expected string here is taken from `buildConsentCopy` — the same
 * builder the component renders and the same one the server parity test pins
 * to `EVENT_CASTING_DISCLOSURE_CONTENT`. Hardcoding the sentences here would
 * let the copy drift on both sides at once and still pass.
 */

const ORGANIZER = 'Fashion Week Brooklyn';

const EVENT_CALL = {
  callKind: 'event_casting',
  event: {
    name: 'FWBK Queens',
    startsOn: '2026-10-04',
    endsOn: '2026-10-10',
    location: 'Queens, NY',
  },
  compensation: { type: 'paid', details: '$250 per show.' },
  intake: { walkVideo: true, availability: true, measurements: true },
  reviewWindowDays: 14,
  offerResponseWindowHours: 48,
};

const REPRESENTATION_CALL = {
  callKind: 'representation',
  event: null,
  compensation: null,
  intake: { walkVideo: false, availability: false, measurements: false },
  reviewWindowDays: null,
  offerResponseWindowHours: 48,
};

const EXPECTED_EVENT_COPY = buildConsentCopy({
  organizerName: ORGANIZER,
  event: { name: EVENT_CALL.event.name, endsOn: EVENT_CALL.event.endsOn },
  compensation: EVENT_CALL.compensation,
});

/** The three sentences the representation rail has always shown. */
const REPRESENTATION_ATTESTATIONS = [
  'I confirm my statistics are accurate and current, and my agency digitals are unretouched.',
  'I confirm I am 18 or older and authorised to submit my own work.',
  `I have reviewed this package and consent to submitting it to ${ORGANIZER} through Pholio.`,
];

function renderTerms(overrides = {}) {
  return render(
    <SubmissionTerms
      agencyName={ORGANIZER}
      call={null}
      marketingSiteUrl="https://www.pholio.studio"
      minor={false}
      minorAgencyAuthorized
      accountGuardianConsent
      openCallClaim={null}
      checks={[{ label: 'Digitals complete', complete: true }]}
      packageAudit={null}
      consent={false}
      accuracyConfirmed={false}
      onAccuracyChange={vi.fn()}
      adultAuthorityConfirmed={false}
      onAdultAuthorityChange={vi.fn()}
      consentBindingPending={false}
      onConsentChange={vi.fn()}
      guardianAgencyConsent={null}
      requestingGuardianConsent={false}
      onRequestGuardianConsent={vi.fn()}
      onOpenIdentity={vi.fn()}
      {...overrides}
    />,
  );
}

/** Every rendered sentence on the rail, whitespace-normalized. */
function railText() {
  return screen
    .getByRole('complementary', { name: 'Submission terms' })
    .textContent.replace(/\s+/g, ' ')
    .trim();
}

describe('SubmissionTerms — event casting call', () => {
  test('renders the disclosure clauses the event consent version records', () => {
    renderTerms({ call: EVENT_CALL });
    const text = railText();

    // The clauses the event version adds and the old rail never showed.
    expect(text).toContain(EXPECTED_EVENT_COPY.thirdPartyAccess);
    expect(text).toContain(EXPECTED_EVENT_COPY.compensation);
    expect(text).toContain(EXPECTED_EVENT_COPY.retentionAndWithdrawal);

    // ...and the rest of the recorded snapshot, in the same words.
    expect(text).toContain(EXPECTED_EVENT_COPY.termsLabel);
    expect(text).toContain(EXPECTED_EVENT_COPY.handling);
    expect(text).toContain(EXPECTED_EVENT_COPY.dataCategories);
    expect(text).toContain(EXPECTED_EVENT_COPY.noGuaranteeStatement);
  });

  test('the third-party clause names the designers who see the package', () => {
    // Guards against the builder being wired in but the one clause that made
    // the pick link honest being dropped from the render.
    renderTerms({ call: EVENT_CALL });
    expect(EXPECTED_EVENT_COPY.thirdPartyAccess).toMatch(/read-only link/);
    expect(screen.getByText(EXPECTED_EVENT_COPY.thirdPartyAccess)).toBeInTheDocument();
  });

  test('the compensation restatement is the organizer’s own words', () => {
    renderTerms({ call: EVENT_CALL });
    expect(EXPECTED_EVENT_COPY.compensation).toMatch(/PAID/);
    expect(screen.getByText(EXPECTED_EVENT_COPY.compensation)).toBeInTheDocument();
  });

  test('an unstated fee is disclosed as unstated, not omitted', () => {
    const call = { ...EVENT_CALL, compensation: null };
    const expected = buildConsentCopy({
      organizerName: ORGANIZER,
      event: { name: call.event.name, endsOn: call.event.endsOn },
      compensation: {},
    });
    renderTerms({ call });
    expect(railText()).toContain(expected.compensation);
  });

  test('the three attestations are still required, in the recorded wording', () => {
    renderTerms({ call: EVENT_CALL });
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);

    const text = railText();
    expect(text).toContain(EXPECTED_EVENT_COPY.accuracyStatement);
    expect(text).toContain(EXPECTED_EVENT_COPY.adultStatement);
    expect(text).toContain(EXPECTED_EVENT_COPY.consentStatement);

    // The generic attestations are replaced, not shown alongside — the same
    // fact stated twice in two wordings is the defect, in miniature.
    for (const sentence of REPRESENTATION_ATTESTATIONS) {
      expect(text).not.toContain(sentence);
    }
  });

  test('no event sentence is paraphrased on the way to the screen', () => {
    renderTerms({ call: EVENT_CALL });
    const text = railText();
    for (const clause of Object.values(EXPECTED_EVENT_COPY)) {
      expect(text).toContain(clause);
    }
  });
});

describe('SubmissionTerms — representation call', () => {
  test.each([
    ['no call attached', null],
    ['an explicit representation call', REPRESENTATION_CALL],
  ])('%s shows exactly the three original attestations', (_label, call) => {
    renderTerms({ call });
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);

    const text = railText();
    for (const sentence of REPRESENTATION_ATTESTATIONS) {
      expect(text).toContain(sentence);
    }
    expect(text).toContain('Submission Terms');
    expect(text).toContain(
      'A submission is a request for review and does not guarantee representation.',
    );
    expect(text).toContain('Pholio retains the package for up to 24 months.');
  });

  test('carries none of the event disclosure copy', () => {
    renderTerms({ call: REPRESENTATION_CALL });
    const text = railText();
    for (const clause of Object.values(EXPECTED_EVENT_COPY)) {
      expect(text).not.toContain(clause);
    }
  });
});
