import { AlertCircle, Bookmark, Calendar, Camera, Check, Clock, X } from 'lucide-react';

// Single source of truth for how an application status is presented to talent.
//
// `tone`  — drives CSS class names in ApplicationsView.
//           Values: 'pending' | 'accepted' | 'file' | 'closed'
//
// `group` — drives industry-true standing counts in bucketCounts().
//           Values: 'inReview' | 'advancing' | 'signed' | 'closed'
//           KEY RULE: shortlisted and kept_on_file are soft-yes outcomes and
//           MUST be in group:'advancing', never in group:'closed'.
export function statusConfig(status) {
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
      label: 'Representation',
      short: 'Moving forward',
      tone: 'accepted',
      group: 'signed',
      icon: Check,
      next: 'The agency wants to move forward with representation — expect direct follow-up.',
      detail: 'The agency will contact you about representation and next steps.',
    },
    booked: {
      label: 'Represented',
      short: 'Signed',
      tone: 'accepted',
      group: 'signed',
      icon: Check,
      next: "You're represented — expect onboarding details directly from the agency.",
      detail: 'The agency has taken you onto its roster.',
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
  };
  return (
    configs[normalized] || {
      label: 'Status updating',
      short: 'Updating',
      tone: 'pending',
      group: 'inReview',
      icon: Clock,
      next: "We're syncing this submission's status.",
      detail: "This submission's status is being updated.",
    }
  );
}

// Count applications by industry-true standing group.
// Returns { inReview, advancing, signed, closed } — never buries a soft-yes
// outcome (shortlisted, kept_on_file) alongside rejections.
//
// Groups:
//   inReview  — pending, submitted, reviewing (agency has not decided)
//   advancing — shortlisted, requested_more, meeting_requested, development,
//               kept_on_file (soft yes; NON-terminal)
//   signed    — accepted, booked             (positive outcome)
//   closed    — declined, passed, rejected, archived, withdrawn
export function bucketCounts(applications = []) {
  const counts = { inReview: 0, advancing: 0, signed: 0, closed: 0 };
  for (const app of applications) {
    const group = statusConfig(app.status).group;
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
