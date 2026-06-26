'use strict';

/**
 * Canonical set of allowed report reason values.
 * Must stay in sync with client/src/shared/components/ReportDialog.jsx REASONS.
 */
const VALID_REPORT_REASONS = Object.freeze([
  'harassment',
  'explicit_content',
  'fake_agency_scam',
  'copyright',
  'other',
]);

/**
 * Resolves the set of moderator user IDs from the environment.
 * MODERATOR_USER_IDS is a comma-separated list of UUIDs.
 */
function getModeratorIds() {
  const raw = process.env.MODERATOR_USER_IDS || '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Returns true if the given user object qualifies as a platform moderator.
 *
 * Moderator resolution order:
 * 1. user.id is in the MODERATOR_USER_IDS env var (comma-separated UUIDs).
 * 2. user.email ends with @pholio.studio.
 *
 * @param {{ id?: string, email?: string }|null|undefined} user
 * @returns {boolean}
 */
function isModerator(user) {
  if (!user) return false;

  const ids = getModeratorIds();
  if (user.id && ids.has(user.id)) return true;

  if (
    user.email &&
    typeof user.email === 'string' &&
    user.email.toLowerCase().endsWith('@pholio.studio')
  ) {
    return true;
  }

  return false;
}

module.exports = { isModerator, VALID_REPORT_REASONS };
