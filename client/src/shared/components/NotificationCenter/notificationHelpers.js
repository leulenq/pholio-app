/**
 * Shared notification copy helpers.
 *
 * Used by `NotificationInbox`, the agency bell. The talent bell reads its rows
 * through `talentSignalModel` instead, which triages by what the talent's next
 * move is rather than by source.
 */

const TALENT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'applications', label: 'Applications' },
  { id: 'messages', label: 'Messages' },
  { id: 'profile', label: 'Profile' },
];

const AGENCY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'messages', label: 'Messages' },
];

export function getFilterTabs(variant = 'talent') {
  return variant === 'agency' ? AGENCY_FILTERS : TALENT_FILTERS;
}

export function getNotificationCategory(type) {
  const map = {
    agency_profile_view: 'Agency interest',
    agency_invitation: 'Invitation',
    application_submitted: 'Application',
    application_status: 'Application update',
    application_received: 'New submission',
    application_withdrawn: 'Application update',
    message_received: 'Message',
    profile_not_submission_ready: 'Profile alert',
    confirmation: 'Confirmation',
  };
  return map[type] || 'Update';
}

export function filterNotifications(items, filterId, variant = 'talent') {
  if (!filterId || filterId === 'all') return items;

  if (variant === 'agency') {
    if (filterId === 'submissions') {
      return items.filter((item) => item.type === 'application_received');
    }
    if (filterId === 'messages') {
      return items.filter((item) => item.type === 'message_received');
    }
    return items;
  }

  if (filterId === 'applications') {
    return items.filter((item) =>
      [
        'application_submitted',
        'application_status',
        'agency_profile_view',
        'agency_invitation',
      ].includes(item.type),
    );
  }
  if (filterId === 'messages') {
    return items.filter((item) => item.type === 'message_received');
  }
  if (filterId === 'profile') {
    return items.filter((item) =>
      ['profile_not_submission_ready', 'confirmation'].includes(item.type),
    );
  }
  return items;
}

export function getPrimaryLine(item) {
  return item.title || getNotificationCategory(item.type);
}

/** Split headline for editorial emphasis — name in strong, rest in plain */
export function getHeadlineParts(item) {
  const title = getPrimaryLine(item);
  const name = item.metadata?.agencyName || item.metadata?.talentName;

  if (name && title.includes(name)) {
    const idx = title.indexOf(name);
    return {
      before: title.slice(0, idx),
      emphasis: name,
      after: title.slice(idx + name.length),
    };
  }

  return { before: '', emphasis: title, after: '' };
}

export function getDetailCardText(item) {
  if (item.grouped && item.occurrenceCount > 1) {
    return item.body || `${item.occurrenceCount} related updates grouped here.`;
  }
  return item.body || '';
}
