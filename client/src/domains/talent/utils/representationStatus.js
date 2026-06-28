import { statusConfig } from './applicationStatus.js';

/**
 * Derives the talent's current representation standing from their application
 * history. Returns a plain-data descriptor consumed by OverviewPage.
 *
 * Priority order (first match wins):
 *   signed          — any application with group:'signed' (accepted / booked)
 *   in_conversation — any application with group:'advancing' (shortlisted / kept_on_file)
 *   submitted       — any application with group:'inReview' (pending / submitted / reviewing)
 *   unrepresented   — no open applications in any tier above
 *
 * Group membership is resolved via statusConfig().group so this function stays
 * consistent with bucketCounts() and never hardcodes status strings.
 *
 * Agency name: read from app.agency_name (the SQL-joined field exposed by the
 * /api/talent/applications endpoint; see src/domains/talent/routes/applications.js).
 *
 * profiles.previous_representations is intentionally ignored here — it reflects
 * past history only and must never be treated as current standing.
 *
 * v1 limitation: a talent who signed with an agency offline (no `accepted` or
 * `booked` application row in Pholio) will read as unrepresented. The structured
 * `talent_representation` table (v2, deferred) will resolve this by storing
 * representation independently of application outcomes.
 *
 * @param {Array<{status: string, agency_name?: string}>} applications
 * @returns {{
 *   state: 'signed'|'in_conversation'|'submitted'|'unrepresented',
 *   label: string,
 *   agency: string|null,
 *   action: { label: string, to: string }
 * }}
 */
// Note: `profile` is intentionally omitted from the v1 signature — it is reserved
// for v2 derivation logic (e.g. profiles.previous_representations history checks)
// once the structured talent_representation table exists.
export function deriveRepresentationStatus(applications = []) {
  const VIEW_APPLICATIONS = '/dashboard/talent/applications';
  const APPLY = '/dashboard/talent/applications/apply?new=1';

  let signedApp = null;
  let advancingApp = null;
  let inReviewApp = null;

  for (const app of applications) {
    const { group } = statusConfig(app.status);
    if (group === 'signed' && !signedApp) signedApp = app;
    if (group === 'advancing' && !advancingApp) advancingApp = app;
    if (group === 'inReview' && !inReviewApp) inReviewApp = app;
  }

  if (signedApp) {
    return {
      state: 'signed',
      label: signedApp.agency_name ? 'Represented by' : 'Represented',
      agency: signedApp.agency_name || null,
      agencyWebsite: signedApp.agency_website || null,
      action: null,
    };
  }

  if (advancingApp) {
    return {
      state: 'in_conversation',
      label: 'In conversation',
      agency: advancingApp.agency_name || null,
      agencyWebsite: advancingApp.agency_website || null,
      action: { label: 'View applications', to: VIEW_APPLICATIONS },
    };
  }

  if (inReviewApp) {
    return {
      state: 'submitted',
      label: 'Submitted',
      agency: null,
      action: { label: 'View submissions', to: VIEW_APPLICATIONS },
    };
  }

  return {
    state: 'unrepresented',
    label: 'Not yet represented',
    agency: null,
    action: { label: 'Submit to agencies', to: APPLY },
  };
}
