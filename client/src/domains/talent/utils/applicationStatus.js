import { AlertCircle, Bookmark, Check, Clock, X } from 'lucide-react';

// Single source of truth for how an application status is presented to talent.
// Internal tone buckets feed CSS class names and count/filter logic:
//   pending = active (in process) · accepted = won (positive outcome) · closed = ended
// The *labels* are what the talent reads and must always match the real status.
export function statusConfig(status) {
  const normalized = String(status || 'pending').toLowerCase();
  const configs = {
    pending: {
      label: 'Under Review',
      short: 'Review',
      tone: 'pending',
      icon: Clock,
      next: "The agency is reviewing — we'll notify you the moment this changes.",
      detail: 'The agency has your current profile and book.',
    },
    submitted: {
      label: 'Under Review',
      short: 'Review',
      tone: 'pending',
      icon: Clock,
      next: "The agency is reviewing — we'll notify you the moment this changes.",
      detail: 'Your application has been submitted to the agency.',
    },
    reviewing: {
      label: 'In Review',
      short: 'Review',
      tone: 'pending',
      icon: Clock,
      next: "The agency is reviewing — we'll notify you the moment this changes.",
      detail: 'Your application is moving through the agency queue.',
    },
    shortlisted: {
      label: 'Shortlisted',
      short: 'Shortlist',
      tone: 'pending',
      icon: Check,
      next: "You've advanced. We'll notify you if the agency takes the next step.",
      detail: 'The agency flagged your application for closer review.',
    },
    accepted: {
      label: 'Accepted',
      short: 'Accepted',
      tone: 'accepted',
      icon: Check,
      next: 'The agency accepted your application — expect direct follow-up.',
      detail: 'The agency has accepted your application.',
    },
    booked: {
      label: 'Booked',
      short: 'Booked',
      tone: 'accepted',
      icon: Check,
      next: "You're booked — confirm the details directly with the agency.",
      detail: 'The agency marked your application as booked.',
    },
    declined: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      icon: AlertCircle,
      next: 'This application is closed. Keep your book current for future submissions.',
      detail: 'The agency did not move forward with this application.',
    },
    passed: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      icon: AlertCircle,
      next: 'This application is closed. Keep your book current for future submissions.',
      detail: 'The agency passed on this application.',
    },
    rejected: {
      label: 'Not Selected',
      short: 'Closed',
      tone: 'closed',
      icon: AlertCircle,
      next: 'This application is closed. Keep your book current for future submissions.',
      detail: 'The agency did not move forward with this application.',
    },
    archived: {
      label: 'Closed',
      short: 'Closed',
      tone: 'closed',
      icon: AlertCircle,
      next: 'The agency closed this application.',
      detail: 'The agency archived this application.',
    },
    withdrawn: {
      label: 'Withdrawn',
      short: 'Withdrawn',
      tone: 'closed',
      icon: X,
      next: 'You withdrew this application. You can apply again anytime.',
      detail: 'You withdrew this application.',
    },
    kept_on_file: {
      label: 'Kept on File',
      short: 'On File',
      tone: 'closed',
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
      icon: Clock,
      next: "We're syncing this application's status.",
      detail: "This application's status is being updated.",
    }
  );
}

// Count applications by tone bucket: { active, won, closed }.
export function bucketCounts(applications = []) {
  const counts = { active: 0, won: 0, closed: 0 };
  for (const app of applications) {
    const tone = statusConfig(app.status).tone;
    if (tone === 'pending') counts.active += 1;
    else if (tone === 'accepted') counts.won += 1;
    else if (tone === 'closed') counts.closed += 1;
  }
  return counts;
}
