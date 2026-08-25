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
 * Moderator status comes from ONE place: an explicit allowlist of user ids in
 * MODERATOR_USER_IDS.
 *
 * It used to also grant moderator to any address ending in @pholio.studio, with
 * no verification requirement. Anyone who could register that address in
 * Firebase — and sign-in does not require a verified email — obtained the
 * moderation queue, which holds CSAM-flagged imagery and every abuse report on
 * the platform. A claim about an email domain is not an authorisation, and the
 * gap between "typed this address" and "works here" is the entire attack.
 *
 * The allowlist is deliberately not backed by a role column: adding a moderator
 * should require a deploy, because the thing being granted is access to the
 * worst material the platform ever holds.
 *
 * @param {{ id?: string, email?: string }|null|undefined} user
 * @returns {boolean}
 */
function isModerator(user) {
  if (!user) return false;
  if (!user.id) return false;
  return getModeratorIds().has(user.id);
}

function isSelfTargetReport({ reporterUserId, targetType, targetId }) {
  return (
    targetType === 'user' &&
    String(targetId || '').trim() === String(reporterUserId || '').trim()
  );
}

module.exports = { isModerator, isSelfTargetReport, VALID_REPORT_REASONS };
