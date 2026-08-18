import {
  isConfirmedApplicationStatus,
  isOfferedApplicationStatus,
  isRepresentedApplicationStatus,
  isTalentDeclinedApplicationStatus,
} from '../../../shared/constants/applicationStatus';

/**
 * The submissions desk's decision ladder, extracted from ApplicantsPage so a
 * second configuration of the same page can exist without a second inbox.
 *
 * Ruling R10: an event organizer works the SAME desk. What changes between a
 * representation call and an event cast is only the ladder's vocabulary —
 * "Represented" becomes "Confirmed", and the confirmation is the applicant's
 * answer rather than the agency's. Everything else (triage verbs, keyboard
 * shortcuts, optimistic writes) is shared, which is the point of this file.
 */

export const isNewStatus = (s) => s === 'submitted' || s === 'pending' || s === 'new' || !s;

/** Left the review ladder in either direction. */
export const isDecidedStatus = (s) =>
  isOfferedApplicationStatus(s)
  || isRepresentedApplicationStatus(s)
  || isConfirmedApplicationStatus(s)
  || isTalentDeclinedApplicationStatus(s)
  || s === 'declined'
  || s === 'passed';

/** Advancing states between "New" and a decision. */
export const IN_FLIGHT_STATES = ['requested_more', 'meeting_requested', 'under_review'];
export const isInFlightState = (s) => IN_FLIGHT_STATES.includes(s);

/** Still on the desk awaiting a decision. */
export const isActiveStatus = (s) =>
  !isDecidedStatus(s) && s !== 'kept_on_file' && s !== 'development';

/**
 * The status each triage verb writes — used for optimistic cache updates and
 * to predict whether an actioned row stays in the current view. Mirrors the
 * backend.
 */
export const STATUS_FOR = {
  shortlist: 'shortlisted',
  accept: 'accepted',
  decline: 'declined',
  keepOnFile: 'kept_on_file',
  requestMore: 'requested_more',
};

/** Representation: the review decision ladder. */
export const LIFECYCLE_TABS = [
  { key: 'to_review', label: 'To Review', match: isNewStatus },
  { key: 'shortlisted', label: 'Shortlisted', match: (s) => s === 'shortlisted' },
  { key: 'offered', label: 'Offered', match: isOfferedApplicationStatus },
  { key: 'represented', label: 'Represented', match: isRepresentedApplicationStatus },
  { key: 'passed', label: 'Passed', match: (s) => s === 'declined' || s === 'passed' },
  { key: 'all', label: 'All', match: () => true },
];

/**
 * Event casting (design §e O3): To review → Pool → Offered → Confirmed →
 * Passed. Same statuses underneath — `shortlisted` IS the pool, `accepted` IS
 * an offered slot — relabelled for a casting director rather than a booker.
 *
 * "Passed" widens to include `declined_by_talent`: an applicant who turned a
 * slot down is off the lineup, and an organizer refilling it needs to see that
 * in the same place they see their own cuts.
 */
export const EVENT_LIFECYCLE_TABS = [
  { key: 'to_review', label: 'To review', match: isNewStatus },
  { key: 'pool', label: 'Pool', match: (s) => s === 'shortlisted' },
  { key: 'offered', label: 'Offered', match: isOfferedApplicationStatus },
  { key: 'confirmed', label: 'Confirmed', match: isConfirmedApplicationStatus },
  {
    key: 'passed',
    label: 'Passed',
    match: (s) =>
      s === 'declined' || s === 'passed' || isTalentDeclinedApplicationStatus(s),
  },
  { key: 'all', label: 'All', match: () => true },
];

/**
 * The same five verbs an event organizer uses. `accept` still writes
 * `accepted`: an event slot offer is not a new status, only a new label. The
 * confirmation that follows is written by the applicant, never from here.
 */
export const EVENT_STATUS_FOR = STATUS_FOR;

/**
 * Vocabulary for the three triage verbs. Four slots because the same action is
 * named four ways: a tooltip with its shortcut, a result toast, an accessible
 * name (`%s` is the talent), and the bulk-bar button.
 */
export const DEFAULT_ACTION_LABELS = {
  shortlist: {
    tip: 'Shortlist · S', toast: 'Shortlisted', aria: 'Shortlist %s', bulk: 'Shortlist',
  },
  accept: {
    tip: 'Offer · A',
    toast: 'Representation offered',
    aria: 'Offer representation to %s',
    bulk: 'Offer representation',
  },
  decline: { tip: 'Pass · X', toast: 'Passed', aria: 'Pass on %s', bulk: 'Pass' },
};

/**
 * The event cast says the same things in casting language. `shortlisted` is
 * "the pool" and `accepted` is "a slot" — the statuses do not change, only
 * what the organizer is told they just did.
 */
export const EVENT_ACTION_LABELS = {
  shortlist: {
    tip: 'Add to pool · S', toast: 'Added to pool', aria: 'Add %s to the pool', bulk: 'Add to pool',
  },
  accept: {
    tip: 'Offer slot · A', toast: 'Slot offered', aria: 'Offer a slot to %s', bulk: 'Offer slot',
  },
  decline: { tip: 'Pass · X', toast: 'Passed', aria: 'Pass on %s', bulk: 'Pass' },
};
