import {
  AlertCircle,
  Bell,
  Calendar,
  CheckCircle2,
  Eye,
  FileCheck,
  Inbox,
  MessageSquare,
  Send,
} from 'lucide-react';

const TALENT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'agency', label: 'Agency' },
  { id: 'applications', label: 'Applications' },
  { id: 'alerts', label: 'Alerts' },
];

const AGENCY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'scheduling', label: 'Scheduling' },
];

const TYPE_AVATAR_TONE = {
  agency_profile_view: 'gold',
  application_submitted: 'ink',
  application_status: 'ink',
  application_received: 'gold',
  application_withdrawn: 'neutral',
  interview_scheduled: 'neutral',
  interview_response: 'gold',
  message_received: 'ink',
  profile_not_submission_ready: 'warn',
  confirmation: 'success',
};

const TYPE_VISUAL = {
  agency_profile_view: { accent: 'gold', icon: Eye },
  application_submitted: { accent: 'sky', icon: Send },
  application_status: { accent: 'sky', icon: FileCheck },
  application_received: { accent: 'gold', icon: Inbox },
  application_withdrawn: { accent: 'neutral', icon: AlertCircle },
  interview_scheduled: { accent: 'violet', icon: Calendar },
  interview_response: { accent: 'violet', icon: Calendar },
  message_received: { accent: 'sky', icon: MessageSquare },
  profile_not_submission_ready: { accent: 'amber', icon: AlertCircle },
  confirmation: { accent: 'mint', icon: CheckCircle2 },
};

export function getFilterTabs(variant = 'talent') {
  return variant === 'agency' ? AGENCY_FILTERS : TALENT_FILTERS;
}

export function getNotificationCategory(type) {
  const map = {
    agency_profile_view: 'Agency interest',
    application_submitted: 'Application',
    application_status: 'Application update',
    application_received: 'New submission',
    application_withdrawn: 'Application update',
    interview_scheduled: 'Interview',
    interview_response: 'Interview',
    message_received: 'Message',
    profile_not_submission_ready: 'Profile alert',
    confirmation: 'Confirmation',
  };
  return map[type] || 'Update';
}

export function getContextBadge(item) {
  if (item.metadata?.agencyName) return item.metadata.agencyName;
  if (item.metadata?.talentName) return item.metadata.talentName;
  if (item.metadata?.status) {
    return String(item.metadata.status).replace(/_/g, ' ');
  }
  return getNotificationCategory(item.type);
}

export function getAvatarLabel(item) {
  const name = item.metadata?.agencyName || item.metadata?.talentName;
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  const fallbacks = {
    agency_profile_view: 'AG',
    application_submitted: 'AP',
    application_status: 'AP',
    application_received: 'IN',
    application_withdrawn: 'AP',
    interview_scheduled: 'IV',
    interview_response: 'IV',
    message_received: 'MS',
    profile_not_submission_ready: 'PR',
    confirmation: 'OK',
  };
  return fallbacks[item.type] || 'PH';
}

export function getAvatarTone(type) {
  return TYPE_AVATAR_TONE[type] || 'neutral';
}

export function getNotificationVisual(type) {
  return TYPE_VISUAL[type] || { accent: 'neutral', icon: Bell };
}

export function filterNotifications(items, filterId, variant = 'talent') {
  if (!filterId || filterId === 'all') return items;

  if (variant === 'agency') {
    if (filterId === 'submissions') {
      return items.filter((item) => item.type === 'application_received');
    }
    if (filterId === 'scheduling') {
      return items.filter((item) => item.type === 'interview_scheduled');
    }
    return items;
  }

  if (filterId === 'agency') {
    return items.filter((item) => item.type === 'agency_profile_view');
  }
  if (filterId === 'applications') {
    return items.filter((item) =>
      ['application_submitted', 'application_status'].includes(item.type),
    );
  }
  if (filterId === 'alerts') {
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
