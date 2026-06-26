import { AlertCircle, Bookmark, Check, Clock, X } from 'lucide-react';

// Single source of truth for how an application status is presented to talent.
//
// `tone`  — drives CSS class names and filter/withdraw logic in ApplicationsView.
//           Values: 'pending' | 'accepted' | 'closed'
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
      detail: 'Your application has been submitted to the agency.',
    },
    reviewing: {
      label: 'In Review',
      short: 'Review',
      tone: 'pending',
      group: 'inReview',
      icon: Clock,
      next: "The agency is reviewing — we'll notify you the moment this changes.",
      detail: 'Your application is moving through the agency queue.',
    },
    shortlisted: {
      label: 'Shortlisted',
      short: 'Shortlist',
      tone: 'pending',
      group: 'advancing',
      icon: Check,
      next: "You've advanced. We'll notify you if the agency takes the next step.",
      detail: 'The agency flagged your application for closer review.',
    },
    accepted: {
      label: 'Accepted',
      short: 'Accepted',
      tone: 'accepted',
      group: 'signed',
      icon: Check,
      next: 'The agency accepted your application — expect direct follow-up.',
      detail: 'The agency has accepted your application.',
    },
    booked: {
      label: 'Booked',
      short: 'Booked',
      tone: 'accepted',
      group: 'signed',
      icon: Check,
      next: "You're booked — confirm the details directly with the agency.",
      detail: 'The agency marked your application as booked.',
    },
    declined: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: AlertCircle,
      next: 'This application is closed. Keep your book current for future submissions.',
      detail: 'The agency did not move forward with this application.',
    },
    passed: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: AlertCircle,
      next: 'This application is closed. Keep your book current for future submissions.',
      detail: 'The agency passed on this application.',
    },
    rejected: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: AlertCircle,
      next: 'This application is closed. Keep your book current for future submissions.',
      detail: 'The agency did not move forward with this application.',
    },
    archived: {
      label: 'Closed',
      short: 'Closed',
      tone: 'closed',
      group: 'closed',
      icon: AlertCircle,
      next: 'The agency closed this application.',
      detail: 'The agency archived this application.',
    },
    withdrawn: {
      label: 'Withdrawn',
      short: 'Withdrawn',
      tone: 'closed',
      group: 'closed',
      icon: X,
      next: 'You withdrew this application. You can apply again anytime.',
      detail: 'You withdrew this application.',
    },
    kept_on_file: {
      label: 'Kept on File',
      short: 'On File',
      // tone stays 'closed' so existing CSS classes and ApplicationsView filter logic
      // (tone === 'closed') continue to work without changes.
      tone: 'closed',
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
      next: "We're syncing this application's status.",
      detail: "This application's status is being updated.",
    }
  );
}

// Count applications by industry-true standing group.
// Returns { inReview, advancing, signed, closed } — never buries a soft-yes
// outcome (shortlisted, kept_on_file) alongside rejections.
//
// Groups:
//   inReview  — pending, submitted, reviewing (agency has not decided)
//   advancing — shortlisted, kept_on_file    (soft yes; NON-terminal)
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
