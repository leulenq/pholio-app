/**
 * Off-Pholio preparation — the pure part.
 *
 * A researched agency and a Pholio agency are the same errand up to the last
 * inch: read what they publish, build a set that satisfies it, check the
 * numbers. The difference is who carries it. Pholio carries the first; the
 * talent carries the second, on the agency's own site or in their own email.
 *
 * So this is not a second workspace. It is the same one with the steps that
 * have nowhere to go removed, and a terminal step that hands over files instead
 * of sending them. Following the event-intake precedent in `../event`,
 * everything specific to that variant lives in this folder and
 * `ApplyExperience.jsx` gets one hook call and one branch.
 */

import { CHANNEL_TYPE } from '../../../lib/specRegistry';

export const PREPARE_PAGE_ID = 'prepare';

const PREPARE_PAGE = Object.freeze({
  id: PREPARE_PAGE_ID,
  title: 'Prepare & send',
  standfirst:
    'Your set, converted and ordered the way they ask for it — then it is yours to send.',
});

/**
 * Steps that survive off Pholio.
 *
 * Board, Book, Comp card and Message are dropped because nothing carries them:
 * the archive holds images, a README, a stats block and — for an agency that
 * takes email — a draft message. A step that cannot reach the agency is a step
 * that lies about what was sent.
 */
const SURVIVING_PAGE_IDS = Object.freeze(['digitals', 'stats']);

export function pagesForTarget(basePages, isOffPholio) {
  if (!isOffPholio) return basePages;
  return [...basePages.filter((page) => SURVIVING_PAGE_IDS.includes(page.id)), PREPARE_PAGE];
}

/** `?series=` — the researched route this workspace is preparing for. */
export function readSeriesId(searchParams) {
  const value = searchParams?.get?.('series');
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

/**
 * How this agency takes applications, said in the workspace that is building
 * the package. An emailed application is a message the talent sends, not a form
 * they fill in, and the two are different errands at the end.
 */
export function channelSentence(route) {
  if (!route) return null;
  if (route.channelType === CHANNEL_TYPE.OFFICIAL_EMAIL) {
    return 'They take applications by email — your archive includes a draft message and the attachments, sized to their limits.';
  }
  if (route.channelType === CHANNEL_TYPE.OFFICIAL_WALK_IN) {
    return 'They see people in person — bring printed or loaded digitals to their open call.';
  }
  if (route.channelType === CHANNEL_TYPE.AGENCY_BRANDED_THIRD_PARTY_FORM) {
    return 'They take applications on their own application form — upload the archive’s images in the order they are numbered.';
  }
  return 'They take applications on their own site — upload the archive’s images in the order they are numbered.';
}

/** The action the terminal step offers, named for the channel. */
export function outboundLabel(route) {
  if (route?.channelType === CHANNEL_TYPE.OFFICIAL_EMAIL) return 'Open their contact page';
  if (route?.channelType === CHANNEL_TYPE.OFFICIAL_WALK_IN) return 'Open their open-call page';
  return 'Open their application page';
}

/**
 * The talent's own calendar day, not UTC's. A set exported at 8pm in Los
 * Angeles was submitted that evening, and a tracker row dated tomorrow would be
 * wrong on the one field the talent can check.
 */
export function todayIso(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * What still stands between the talent and a package worth sending.
 *
 * Advisory, exactly like the registry findings themselves: nothing here blocks
 * the export. A talent who wants their files with two slots empty gets their
 * files — the agency's page is the source of truth, and Pholio refusing to hand
 * over a talent's own images would be the wrong kind of gate.
 */
export function prepareGaps({ filledSlots = 0, route = null } = {}) {
  const gaps = [];
  if (filledSlots === 0) {
    gaps.push({
      key: 'digitals',
      label: 'No digitals selected',
      hint: 'Pick at least one frame on the digitals step — an empty archive helps nobody.',
    });
  }
  if (route && !route.sourceUrl && route.channelType !== CHANNEL_TYPE.OFFICIAL_EMAIL) {
    gaps.push({
      key: 'destination',
      label: 'No published destination',
      hint: 'Pholio holds no submission link for this route. Check their site before sending.',
    });
  }
  return gaps;
}
