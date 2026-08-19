/**
 * Instagram OAuth Provider (Instagram API with Instagram Login)
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */

const crypto = require("crypto");
const config = require("../../../../config");

const INSTAGRAM_AUTH_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_GRAPH_URL = "https://graph.instagram.com";

function isInstagramConfigured() {
  return Boolean(
    config.instagram?.appId &&
      config.instagram?.appSecret &&
      config.instagram?.redirectUri,
  );
}

function buildInstagramAuthorizeUrl(state) {
  if (!isInstagramConfigured()) {
    throw new Error("Instagram OAuth is not configured");
  }

  const params = new URLSearchParams({
    client_id: config.instagram.appId,
    redirect_uri: config.instagram.redirectUri,
    scope: config.instagram.scope,
    response_type: "code",
    state,
    force_reauth: "true",
  });

  return `${INSTAGRAM_AUTH_URL}?${params.toString()}`;
}

/**
 * Verify and decode the signed_request Meta sends to Instagram lifecycle
 * callbacks. The HMAC covers the still-encoded payload segment, not the decoded
 * JSON. Never trust user_id until this comparison succeeds.
 *
 * @param {string} signedRequest
 * @returns {Object}
 */
function verifyInstagramSignedRequest(signedRequest) {
  if (typeof signedRequest !== "string" || !signedRequest.trim()) {
    throw new Error("Missing Instagram signed request");
  }
  if (!config.instagram?.appSecret) {
    throw new Error("Instagram OAuth is not configured");
  }

  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid Instagram signed request");
  }

  const [encodedSignature, encodedPayload] = parts;
  const actualSignature = Buffer.from(encodedSignature, "base64url");
  const expectedSignature = crypto
    .createHmac("sha256", config.instagram.appSecret)
    .update(encodedPayload)
    .digest();

  if (
    actualSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error("Invalid Instagram signed request signature");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid Instagram signed request payload");
  }

  if (payload.algorithm && payload.algorithm !== "HMAC-SHA256") {
    throw new Error("Unsupported Instagram signed request algorithm");
  }
  if (!payload.user_id) {
    throw new Error("Instagram signed request is missing user_id");
  }

  return payload;
}

/**
 * Exchange authorization code for access token and fetch profile.
 * @param {string} code - Instagram OAuth authorization code
 * @returns {Promise<Object>} {instagram_id, handle, picture, email}
 */
async function verifyInstagramCode(code) {
  if (!code || typeof code !== "string") {
    throw new Error("Invalid code: code is required");
  }

  if (!isInstagramConfigured()) {
    throw new Error("Instagram OAuth is not configured");
  }

  const tokenResponse = await fetch(INSTAGRAM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.instagram.appId,
      client_secret: config.instagram.appSecret,
      grant_type: "authorization_code",
      redirect_uri: config.instagram.redirectUri,
      code,
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    const message =
      tokenPayload.error_message ||
      tokenPayload.error?.message ||
      tokenPayload.error ||
      "Instagram token exchange failed";
    throw new Error(message);
  }

  const shortLivedToken = tokenPayload.access_token;
  const instagramUserId = String(
    tokenPayload.user_id || tokenPayload.id || "",
  ).trim();

  if (!shortLivedToken || !instagramUserId) {
    throw new Error("Instagram token response missing access token or user id");
  }

  let accessToken = shortLivedToken;
  try {
    const longLivedUrl = new URL(`${INSTAGRAM_GRAPH_URL}/access_token`);
    longLivedUrl.searchParams.set("grant_type", "ig_exchange_token");
    longLivedUrl.searchParams.set(
      "client_secret",
      config.instagram.appSecret,
    );
    longLivedUrl.searchParams.set("access_token", shortLivedToken);

    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedPayload = await longLivedResponse.json().catch(() => ({}));
    if (longLivedResponse.ok && longLivedPayload.access_token) {
      accessToken = longLivedPayload.access_token;
    }
  } catch (error) {
    console.warn(
      "[Instagram OAuth] Long-lived token exchange failed, using short-lived token:",
      error.message,
    );
  }

  const profileUrl = new URL(`${INSTAGRAM_GRAPH_URL}/v25.0/me`);
  profileUrl.searchParams.set(
    "fields",
    "user_id,username,account_type,profile_picture_url",
  );
  profileUrl.searchParams.set("access_token", accessToken);

  const profileResponse = await fetch(profileUrl);
  const profilePayload = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok) {
    const message =
      profilePayload.error?.message ||
      profilePayload.error_message ||
      "Failed to fetch Instagram profile";
    throw new Error(message);
  }

  return normalizeInstagramUser({
    id: profilePayload.user_id || instagramUserId,
    username: profilePayload.username,
    profile_picture_url: profilePayload.profile_picture_url,
    account_type: profilePayload.account_type,
  });
}

/**
 * @param {Object} instagramData - Instagram API response data
 * @returns {Object} Normalized user data
 */
function normalizeInstagramUser(instagramData) {
  const handle = instagramData?.username || instagramData?.handle || null;
  const normalizedHandle = handle
    ? handle.startsWith("@")
      ? handle
      : `@${handle}`
    : null;

  return {
    instagram_id: String(
      instagramData?.id || instagramData?.instagram_id || instagramData?.user_id || "",
    ),
    handle: normalizedHandle,
    picture: instagramData?.profile_picture_url || instagramData?.picture || null,
    email: null,
    account_type: instagramData?.account_type || null,
  };
}

module.exports = {
  isInstagramConfigured,
  buildInstagramAuthorizeUrl,
  verifyInstagramCode,
  verifyInstagramSignedRequest,
  normalizeInstagramUser,
};
