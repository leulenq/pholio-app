import { AlertCircle, Bookmark, Calendar, Camera, Check, Clock, X } from 'lucide-react';
import { CALL_KINDS } from '../../../shared/constants/eventCasting';

// Single source of truth for how an application status is presented to talent.
//
// `tone`  — drives CSS class names in ApplicationsView.
//           Values: 'pending' | 'accepted' | 'file' | 'closed'
//
// `group` — drives industry-true standing counts in bucketCounts().
//           Values: 'inReview' | 'advancing' | 'represented' | 'closed'
//           KEY RULE: shortlisted and kept_on_file are soft-yes outcomes and
//           MUST be in group:'advancing', never in group:'closed'.
//
// An event application uses the same statuses with different words. Only the
// rows whose *meaning* changes are overridden below — an organizer's
// `accepted` is a slot in a show, not an offer of representation, and calling
// it "Offer / Moving Forward" would read as the latter.
const EVENT_STATUS_OVERRIDES = {
  pending: {
    label: 'Application Received',
    short: 'Received',
    next: "The organizer is reviewing applications — we'll tell you when this moves.",
    detail: 'The organizer has your package for this casting.',
  },
  submitted: {
    label: 'Application Received',
    short: 'Received',
    next: "The organizer is reviewing applications — we'll tell you when this moves.",
    detail: 'The organizer has your package for this casting.',
  },
  shortlisted: {
    label: 'In the Casting Pool',
    short: 'Pool',
    next: 'You survived the first cut. Designers may see your package through a read-only link.',
    detail: 'The organizer moved you into the pool for this event.',
  },
  accepted: {
    label: 'Offered a Slot',
    short: 'Slot',
    next: 'Confirm or decline the slot before the offer window closes.',
    detail: 'An offered slot is held for you until you answer or the window lapses.',
  },
  kept_on_file: {
    label: 'Kept on File',
    short: 'On File',
    next: 'The organizer is keeping you on file for a future edition.',
    detail: 'You were not cast this time; the organizer kept your package for next time.',
  },
  closed_no_response: {
    label: 'No Response',
    short: 'Closed',
    next: 'Treat this as a pass. Keep your digitals current and keep applying.',
    detail: 'The organizer did not respond before this casting closed.',
  },
};

export function statusConfig(status, options = {}) {
  const normalized = String(status || 'pending').toLowerCase();
  const configs = {
    pending: {
      label: 'Under Review',
      short: 'Review',
      tone: 'pending',
      group: 'inReview',
      icon: Clock,
      next: "The agency is reviewing — we'll notify you the moment this changes.",
      detail: 'The agency has your current profile and book.',
    },
    submitted: {
      label: 'Under Review',
      short: 'Review',
      tone: 'pending',
      group: 'inReview',
      icon: Clock,
      next: "The agency is reviewing — we'll notify you the moment this changes.",
      detail: 'Your submission has been sent to the agency.',
    },
    reviewing: {
      label: 'In Review',
      short: 'Review',
      tone: 'pending',
      group: 'inReview',
      icon: Clock,
      next: "The agency is reviewing — we'll notify you the moment this changes.",
      detail: 'Your submission is moving through the agency queue.',
    },
    shortlisted: {
      label: 'Shortlisted',
      short: 'Shortlist',
      tone: 'pending',
      group: 'advancing',
      icon: Check,
      next: "You've advanced. We'll notify you if the agency takes the next step.",
      detail: 'The agency flagged your submission for closer review.',
    },
    requested_more: {
      label: 'More Requested',
      short: 'More',
      tone: 'pending',
      group: 'advancing',
      icon: Camera,
      next: 'The agency asked for more — send the requested digitals or shots to keep this moving.',
      detail: 'The agency wants additional digitals or specific shots before deciding.',
    },
    meeting_requested: {
      label: 'Go-See Requested',
      short: 'Go-See',
      tone: 'pending',
      group: 'advancing',
      icon: Calendar,
      next: 'The agency wants to meet — watch for go-see details, or reply to lock in a time.',
      detail: 'The agency invited you to a meeting (a go-see).',
    },
    development: {
      label: 'Development Offer',
      short: 'New Face',
      tone: 'accepted',
      group: 'advancing',
      icon: Check,
      next: 'The agency is developing you as a new face — expect guidance on building your book and test shoots.',
      detail: 'The agency has taken you on for development before full representation.',
    },
    accepted: {
      label: 'Offer / Moving Forward',
      short: 'Offer',
      tone: 'accepted',
      group: 'advancing',
      icon: Check,
      next: 'The agency wants to move forward — review the offer and agreement directly with them.',
      detail: 'An offer is not yet a completed representation agreement.',
    },
    represented: {
      label: 'Represented',
      short: 'Represented',
      tone: 'accepted',
      group: 'represented',
      icon: Check,
      next: "You're represented — expect onboarding details directly from the agency.",
      detail: 'You and the agency have completed the representation agreement.',
    },
    declined: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: AlertCircle,
      next: 'This submission is closed. Keep your book current for future outreach.',
      detail: 'The agency did not move forward with this submission.',
    },
    passed: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: AlertCircle,
      next: 'This submission is closed. Keep your book current for future outreach.',
      detail: 'The agency passed on this submission.',
    },
    rejected: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: AlertCircle,
      next: 'This submission is closed. Keep your book current for future outreach.',
      detail: 'The agency did not move forward with this submission.',
    },
    // Distinct from `passed`: the agency made no decision, and saying it did
    // would put a verdict in its mouth. The label names the silence and the
    // guidance tells the talent what to do about it, which is the whole
    // point of closing these automatically.
    closed_no_response: {
      label: 'No Response',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: AlertCircle,
      next: 'Treat this as a pass. Keep your book current and keep submitting.',
      detail: 'The agency did not respond within its review window.',
    },
    archived: {
      label: 'Closed',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: AlertCircle,
      next: 'The agency closed this submission.',
      detail: 'The agency archived this submission.',
    },
    withdrawn: {
      label: 'Withdrawn',
      short: 'Withdrawn',
      tone: 'closed',
      group: 'closed',
      icon: X,
      next: 'You withdrew this submission. You can submit again anytime.',
      detail: 'You withdrew this submission.',
    },
    kept_on_file: {
      label: 'Kept on File',
      short: 'On File',
      tone: 'file',
      // group is 'advancing' — the non-negotiable: "kept on file" is a soft yes,
      // never a rejection, and must never appear in the closed standing count.
      group: 'advancing',
      icon: Bookmark,
      next: 'The agency is keeping you on file for future openings — keep your book current.',
      detail: 'The agency is keeping your profile on file for future consideration.',
    },
    // The applicant's own answer to a slot offer. `confirmed` is deliberately
    // not `represented` — a booked show is not a signed roster — and
    // `declined_by_talent` is deliberately not `withdrawn`, which would redact
    // the package and hide the row from an organizer who still has to refill
    // the slot.
    confirmed: {
      label: 'Slot Confirmed',
      short: 'Confirmed',
      tone: 'accepted',
      group: 'advancing',
      icon: Check,
      next: 'You are on the line-up. Watch for call time and fitting details from the organizer.',
      detail: 'You confirmed the slot you were offered.',
    },
    declined_by_talent: {
      label: 'You Declined',
      short: 'Declined',
      tone: 'closed',
      group: 'closed',
      icon: X,
      next: 'You released this slot. It does not affect future applications to this organizer.',
      detail: 'You declined the slot you were offered.',
    },
  };
  const base =
    configs[normalized] || {
      label: 'Status updating',
      short: 'Updating',
      tone: 'pending',
      group: 'inReview',
      icon: Clock,
      next: "We're syncing this submission's status.",
      detail: "This submission's status is being updated.",
    };
  if (options.purpose !== CALL_KINDS.EVENT_CASTING) return base;
  const override = EVENT_STATUS_OVERRIDES[normalized];
  return override ? { ...base, ...override } : base;
}

export function isEventApplication(application) {
  return application?.call_purpose === CALL_KINDS.EVENT_CASTING;
}

// Only a live offer on an event application can be answered, and only by the
// applicant. Mirrors the server's guard in routes/applications.js.
export function canAnswerSlotOffer(application) {
  return (
    isEventApplication(application) &&
    String(application?.status || '').toLowerCase() === 'accepted'
  );
}

// Count applications by industry-true standing group.
// Returns { inReview, advancing, represented, closed } — never buries a soft-yes
// outcome (shortlisted, kept_on_file) alongside rejections.
//
// Groups:
//   inReview  — pending, submitted, reviewing (agency has not decided)
//   advancing — shortlisted, requested_more, meeting_requested, development,
//               accepted, kept_on_file (soft yes / offer; NON-terminal)
//   represented — represented                (agreement complete)
//   closed    — declined, passed, rejected, archived, withdrawn,
//               closed_no_response (review window lapsed, no decision made)
export function bucketCounts(applications = []) {
  const counts = { inReview: 0, advancing: 0, represented: 0, closed: 0 };
  for (const app of applications) {
    const group = statusConfig(app.status, { purpose: app.call_purpose }).group;
    if (group in counts) counts[group] += 1;
  }
  return counts;
}

// Mirrors server WITHDRAWABLE_STATUSES — talent may step back before signing.
const WITHDRAWABLE_STATUSES = new Set([
  'pending',
  'submitted',
  'reviewing',
  'shortlisted',
  'requested_more',
  'meeting_requested',
  'kept_on_file',
  'development',
  'accepted',
]);

export function canWithdrawApplication(status) {
  return WITHDRAWABLE_STATUSES.has(String(status || '').toLowerCase());
}
