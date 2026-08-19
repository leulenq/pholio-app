/*
 * Brief and call-definition shape helpers, kept out of the component files so
 * fast refresh keeps working (a module exporting both a component and
 * constants loses it).
 */

import {
  CALL_KINDS,
  COMPENSATION_TYPES,
  DEFAULT_CALL_KIND,
  isEventCastingCallKind,
} from '../../../../shared/constants/eventCasting';

/** Mirrors the server rule: "paid" without a rate is not a statement. */
export const COMPENSATION_DETAILS_REQUIRED = Object.freeze([
  COMPENSATION_TYPES.PAID,
  COMPENSATION_TYPES.STIPEND,
]);
export const COMPENSATION_DETAILS_MIN_LENGTH = 3;

export const EMPTY_BRIEF = Object.freeze({
  who: '',
  what: '',
  eligibility: '',
  nextSteps: '',
  deadline: '',
  ongoing: false,
});

/** The editable brief for an existing link, or an empty one if it has none. */
export function briefFromLink(link) {
  if (!link?.brief) return { ...EMPTY_BRIEF };
  return {
    who: link.brief.who || '',
    what: link.brief.what || '',
    eligibility: link.brief.eligibility || '',
    nextSteps: link.brief.nextSteps || '',
    deadline: link.brief.deadline || '',
    ongoing: Boolean(link.brief.ongoing),
  };
}

/*
 * The call definition: what kind of call this is, and — for an event cast —
 * the event, the compensation the organizer is willing to state, and what the
 * intake asks for beyond the standard package.
 *
 * Compensation has no default. There is no "unspecified" option because the
 * consent an applicant signs restates this sentence verbatim, so an organizer
 * has to choose one before the call can exist.
 */
export const EMPTY_EVENT_CALL = Object.freeze({
  callKind: DEFAULT_CALL_KIND,
  event: Object.freeze({ name: '', startsOn: '', endsOn: '', location: '' }),
  compensation: Object.freeze({ type: '', details: '' }),
  intake: Object.freeze({ walkVideo: false, availability: false, measurements: false }),
  reviewWindowDays: '',
  offerResponseWindowHours: '',
});

/** The editable call definition for an existing link. */
export function eventCallFromLink(link) {
  if (!isEventCastingCallKind(link?.callKind)) return cloneEventCall(EMPTY_EVENT_CALL);
  return {
    callKind: CALL_KINDS.EVENT_CASTING,
    event: {
      name: link.event?.name || '',
      startsOn: link.event?.startsOn || '',
      endsOn: link.event?.endsOn || '',
      location: link.event?.location || '',
    },
    compensation: {
      type: link.compensation?.type || '',
      details: link.compensation?.details || '',
    },
    intake: {
      walkVideo: Boolean(link.intake?.walkVideo),
      availability: Boolean(link.intake?.availability),
      measurements: Boolean(link.intake?.measurements),
    },
    reviewWindowDays: link.reviewWindowDays ?? '',
    offerResponseWindowHours: link.offerResponseWindowHours ?? '',
  };
}

export function cloneEventCall(call) {
  return {
    callKind: call.callKind,
    event: { ...call.event },
    compensation: { ...call.compensation },
    intake: { ...call.intake },
    reviewWindowDays: call.reviewWindowDays,
    offerResponseWindowHours: call.offerResponseWindowHours,
  };
}

/**
 * The call definition as the API takes it. A representation call sends only
 * its kind, so nothing about events reaches a link that has none.
 */
export function callPayload(call) {
  if (!isEventCastingCallKind(call?.callKind)) {
    return { callKind: DEFAULT_CALL_KIND };
  }
  return {
    callKind: CALL_KINDS.EVENT_CASTING,
    event: { ...call.event },
    compensation: { ...call.compensation },
    intake: { ...call.intake },
    reviewWindowDays: call.reviewWindowDays === '' ? null : Number(call.reviewWindowDays),
    offerResponseWindowHours:
      call.offerResponseWindowHours === '' ? null : Number(call.offerResponseWindowHours),
  };
}

/** Whether the organizer has answered enough for the API to accept the call. */
export function isEventCallComplete(call) {
  if (!isEventCastingCallKind(call?.callKind)) return true;
  if (!call.event.name.trim() || !call.event.startsOn) return false;
  if (!call.compensation.type) return false;
  if (!COMPENSATION_DETAILS_REQUIRED.includes(call.compensation.type)) return true;
  return call.compensation.details.trim().length >= COMPENSATION_DETAILS_MIN_LENGTH;
}
