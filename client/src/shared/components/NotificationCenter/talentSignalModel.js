/**
 * The triage model behind the talent bell.
 *
 * The bell is not an activity log. A model opening it needs three answers in
 * this order — is anyone waiting on me, what changed, is anyone looking — and a
 * reverse-chronological list answers none of them, because an offer that
 * expires and a profile view from four minutes ago carry the same weight in it.
 *
 * So every notification is sorted into one of three bands. The band a row lands
 * in is derived from what the talent's next move actually is, which is why the
 * `application_status` type splits: `accepted` / `requested_more` /
 * `meeting_requested` / `development` are all somebody waiting on an answer,
 * while `shortlisted` / `passed` / `closed_no_response` are news about something
 * already decided.
 *
 * Read state deliberately does not move a row between bands. Opening the panel
 * proves the talent saw the offer, not that they answered it, and a band that
 * emptied itself on a glance would stop being worth trusting.
 */

export const BAND = {
  ACTION: 'action',
  NEWS: 'news',
  INTEREST: 'interest',
};

export const BAND_ORDER = [BAND.ACTION, BAND.NEWS, BAND.INTEREST];

export const BAND_LABELS = {
  [BAND.ACTION]: 'Waiting on you',
  [BAND.NEWS]: 'What changed',
  [BAND.INTEREST]: "Who's looking",
};

/** How many rows a band shows before it asks to be expanded. */
export const BAND_PREVIEW_LIMIT = {
  [BAND.ACTION]: Infinity, // never hide something that needs an answer
  [BAND.NEWS]: 5,
  [BAND.INTEREST]: 4,
};

/**
 * Application statuses where the next move belongs to the talent. Mirrors the
 * server's own reading in `shared/constants/application-status.js`, where
 * `requested_more` and `meeting_requested` are documented as "waiting on the
 * talent" and `accepted` is an offer, not an outcome.
 */
const AWAITING_TALENT_STATUSES = new Set([
  'accepted',
  'requested_more',
  'meeting_requested',
  'development',
]);

/**
 * The band is the whole classification. An earlier pass also synthesised a verb
 * per row ("Answer the offer", "Send the materials") and printed it under the
 * body — which restated, in a third line, what the band header above it and the
 * server's own copy had already said twice.
 *
 * @param {object} item formatted notification row from the API
 * @returns {string} one of BAND
 */
export function classifySignal(item) {
  const type = item?.type;

  if (type === 'message_received' || type === 'profile_not_submission_ready') {
    return BAND.ACTION;
  }

  // An agency asking for an application is the talent's move to make, so it
  // belongs with the things waiting on them rather than under "who's looking".
  // Attention is interest; a request is a question.
  if (type === 'agency_invitation') {
    return BAND.ACTION;
  }

  if (type === 'application_status' && AWAITING_TALENT_STATUSES.has(item?.metadata?.status)) {
    return BAND.ACTION;
  }

  if (type === 'agency_profile_view') {
    return BAND.INTEREST;
  }

  return BAND.NEWS;
}

/**
 * The interest band is a single line per row, so its server body ("An agency
 * opened your portfolio in Scout.") restates the title and is dropped. The
 * grouped-view copy is not a restatement, so it survives.
 */
function bodyForBand(item, band) {
  if (band !== BAND.INTEREST) return item.body || '';
  return Number(item.occurrenceCount) > 1 ? item.body || '' : '';
}

/**
 * A compact ledger timestamp — "4m", "2h", "3d", "Mar 4". Narrower than the
 * server's `timeAgo`, which stays the fallback when the raw date is unusable.
 */
export function compactTime(item) {
  const raw = item?.lastOccurredAt || item?.createdAt;
  const then = raw ? new Date(raw) : null;
  if (!then || Number.isNaN(then.getTime())) return item?.timeAgo || '';

  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Splits the title so an agency's name can carry the emphasis. */
export function splitTitle(item) {
  const title = item?.title || '';
  const name = item?.metadata?.agencyName;
  if (!name || !title.includes(name)) {
    return { before: '', name: title, after: '' };
  }
  const at = title.indexOf(name);
  return {
    before: title.slice(0, at),
    name,
    after: title.slice(at + name.length),
  };
}

/**
 * Groups the feed into bands, unread first inside each band, then newest first.
 *
 * @param {Array} notifications
 * @returns {{ bands: Array, actionCount: number, unreadActionCount: number, total: number }}
 */
export function buildSignalDigest(notifications = []) {
  const buckets = {
    [BAND.ACTION]: [],
    [BAND.NEWS]: [],
    [BAND.INTEREST]: [],
  };

  notifications.forEach((item) => {
    const band = classifySignal(item);
    buckets[band].push({
      ...item,
      band,
      detail: bodyForBand(item, band),
      time: compactTime(item),
      title: splitTitle(item),
    });
  });

  const byUrgency = (a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return (
      new Date(b.lastOccurredAt || b.createdAt || 0) -
      new Date(a.lastOccurredAt || a.createdAt || 0)
    );
  };

  const bands = BAND_ORDER.map((id) => ({
    id,
    label: BAND_LABELS[id],
    items: buckets[id].sort(byUrgency),
    previewLimit: BAND_PREVIEW_LIMIT[id],
  })).filter((band) => band.items.length > 0);

  const action = buckets[BAND.ACTION];

  return {
    bands,
    actionCount: action.length,
    unreadActionCount: action.filter((item) => !item.isRead).length,
    total: notifications.length,
  };
}
