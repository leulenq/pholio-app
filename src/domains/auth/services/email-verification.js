/**
 * Email verification delivery — via our own SMTP provider.
 *
 * Firebase's built-in verification sender is intentionally NOT used in the
 * onboarding flow. Instead we generate the verification action link with the
 * Admin SDK and deliver it through the same SMTP transport as every other
 * transactional Pholio email (guardian consent, application status, …). This
 * gives us branded, deliverable email from our own domain while Firebase still
 * owns verification truth — the link points at Firebase's action handler, so
 * clicking it flips the user's `emailVerified` claim exactly as before, and the
 * inbox beat's poll (`user.reload()`) notices and advances.
 */
const {
  generateEmailVerificationLink,
  generatePasswordResetLink,
} = require("./firebase-admin");
const {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendSignInMethodNoticeEmail,
} = require("../../../shared/lib/email");
const { normalizeProviderId } = require("./auth-provider");
const config = require("../../../config");

/**
 * Generate a Firebase email-verification link for `email` and send it through
 * SMTP. Returns once the email has been handed to the transport.
 *
 * Throws on failure (link generation or send) so callers can decide how to
 * react — signup uses it best-effort (logs, never blocks), the resend endpoint
 * surfaces the error to the client. Never swallow silently.
 *
 * @param {Object}  args
 * @param {string}  args.email       Recipient address (must be the Firebase user's email).
 * @param {string} [args.firstName]  Used to personalize the greeting.
 * @returns {Promise<{ ok: true }>}
 */
async function sendVerificationEmailViaSmtp({ email, firstName }) {
  if (!email) {
    throw new Error("email is required to send a verification email");
  }

  // Firebase's hosted action handler processes the link, then redirects back
  // into the flow. The continue-URL domain must be an authorized domain in the
  // Firebase console (the same list that already authorizes app.pholio.studio
  // for Google sign-in), or generateEmailVerificationLink rejects.
  const verifyUrl = await generateEmailVerificationLink(email, {
    url: `${config.appUrl}/onboarding`,
    handleCodeInApp: false,
  });

  await sendEmailVerificationEmail({ to: email, firstName, verifyUrl });
  return { ok: true };
}

async function sendPasswordResetViaSmtp({ email, firstName }) {
  if (!email) {
    throw new Error("email is required to send a password reset email");
  }

  // handleCodeInApp: true points the link straight at ResetPasswordPage
  // (client/src/domains/auth/pages/ResetPasswordPage) instead of Firebase's
  // own generic hosted action page — the oobCode arrives as a query param on
  // our own branded screen, which calls confirmPasswordReset itself.
  const resetUrl = await generatePasswordResetLink(email, {
    url: `${config.appUrl}/reset-password`,
    handleCodeInApp: true,
  });

  await sendPasswordResetEmail({ to: email, firstName, resetUrl });
  return { ok: true };
}

/**
 * Sent in place of a reset link when the account has no `password` entry in
 * Firebase's `providerData` — it signed in through Google, Instagram, or
 * another provider only. `generatePasswordResetLink` has no such account to
 * reset and Firebase refuses the request, so the caller (the password-reset
 * route) must check `providerData` and branch here *before* ever asking
 * Firebase for a link, not react to the failure after the fact.
 *
 * @param {Object} args
 * @param {string} args.email
 * @param {string} [args.firstName]
 * @param {string[]} args.providerIds - Raw `providerData[].providerId` values
 *   for the account (e.g. `["google.com"]`). The first recognized one names
 *   the provider in the email; Pholio accounts only ever carry one non-
 *   password provider in practice.
 */
async function sendSignInMethodNoticeViaSmtp({ email, firstName, providerIds }) {
  if (!email) {
    throw new Error("email is required to send a sign-in method notice");
  }

  const normalized = (providerIds || [])
    .map(normalizeProviderId)
    .find(Boolean);
  const providerLabel = normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : null;

  await sendSignInMethodNoticeEmail({ to: email, firstName, providerLabel });
  return { ok: true };
}

module.exports = {
  sendVerificationEmailViaSmtp,
  sendPasswordResetViaSmtp,
  sendSignInMethodNoticeViaSmtp,
};
