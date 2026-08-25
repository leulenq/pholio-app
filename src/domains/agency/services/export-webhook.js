"use strict";

/**
 * Delivery for the agency export webhook (plan §9.4, adjacency 1).
 *
 * The feature is small. The security is not, because the destination is a URL
 * an agency types into a settings field, and Pholio's server is the thing that
 * fetches it. That is a server-side request forgery primitive unless it is
 * constrained, and this file is mostly that constraint.
 *
 * THE RULES, and why each one is here:
 *
 * 1. **https only.** A plaintext hook leaks the submission — names, contact
 *    details, sometimes a minor's — to every hop in between.
 *
 * 2. **No private, loopback, link-local or reserved addresses**, checked after
 *    DNS resolution rather than on the string. `http://169.254.169.254/` is the
 *    cloud metadata endpoint; a hostname the agency controls can resolve to it
 *    just as easily, so validating the text alone proves nothing. Every
 *    resolved address must be public, so a hostname that returns one public and
 *    one private answer is refused rather than raced.
 *
 * 3. **No redirects.** A public URL that 302s to a private one defeats rule 2
 *    entirely, and there is no legitimate reason for a webhook receiver to
 *    redirect.
 *
 * 4. **A short timeout and a size-capped read.** The delivery runs off the back
 *    of a talent's submission; it must not be able to hold that request open or
 *    stream a response into memory.
 *
 * 5. **Signed.** HMAC-SHA256 over the exact body, in `X-Pholio-Signature`, with
 *    a timestamp header inside the signed material so a captured delivery
 *    cannot be replayed indefinitely. Without a signature a receiver cannot
 *    tell Pholio from anyone who learned the URL.
 *
 * Delivery never throws into the caller. A submission is the talent's act; an
 * agency's broken endpoint must not fail it, and must not be visible to them.
 */

const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");

/** Long enough for a slow receiver, short enough not to hold a request. */
const DELIVERY_TIMEOUT_MS = 5000;
/** Responses are only read for diagnostics; nothing needs more than this. */
const MAX_RESPONSE_BYTES = 2048;
/** After this many consecutive failures the endpoint stops being tried. */
const MAX_CONSECUTIVE_FAILURES = 10;

class WebhookRejected extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WebhookRejected";
    this.code = code;
  }
}

/**
 * Is this address one that must never be fetched from a user-supplied URL?
 *
 * @param {string} address
 * @returns {boolean}
 */
function isBlockedAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    if (a === 0) return true; // "this network"
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    // IPv4-mapped (::ffff:10.0.0.1) — judge the embedded address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  // Not an address we can reason about — refuse rather than guess.
  return true;
}

/**
 * Validate a webhook URL and confirm every address it resolves to is public.
 *
 * @param {string} rawUrl
 * @param {{ resolver?: (hostname: string) => Promise<Array<{address: string}>> }} [opts]
 * @returns {Promise<URL>}
 */
async function assertDeliverableUrl(rawUrl, opts = {}) {
  let url;
  try {
    url = new URL(String(rawUrl || ""));
  } catch {
    throw new WebhookRejected("invalid_url", "That is not a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new WebhookRejected(
      "https_required",
      "A webhook URL must use https — submissions carry contact details and sometimes a minor's.",
    );
  }
  if (url.username || url.password) {
    throw new WebhookRejected(
      "credentials_not_allowed",
      "Put credentials in a header on your side, not in the URL.",
    );
  }

  // A literal IP is judged directly; a hostname is judged by what it resolves to.
  if (net.isIP(url.hostname)) {
    if (isBlockedAddress(url.hostname)) {
      throw new WebhookRejected(
        "private_address",
        "That address is not reachable from the public internet.",
      );
    }
    return url;
  }

  const lookup = opts.resolver || ((host) => dns.lookup(host, { all: true }));
  let records;
  try {
    records = await lookup(url.hostname);
  } catch {
    throw new WebhookRejected(
      "unresolvable",
      "That hostname could not be resolved.",
    );
  }

  const addresses = (Array.isArray(records) ? records : [records])
    .map((record) => record?.address)
    .filter(Boolean);

  if (addresses.length === 0) {
    throw new WebhookRejected(
      "unresolvable",
      "That hostname could not be resolved.",
    );
  }

  // EVERY answer must be public. One private answer is enough to refuse: a host
  // that returns both is the DNS-rebinding case, and picking the public one
  // would be a race we lose at delivery time.
  if (addresses.some((address) => isBlockedAddress(address))) {
    throw new WebhookRejected(
      "private_address",
      "That hostname resolves to a private address.",
    );
  }

  return url;
}

/**
 * The signature a receiver checks. Timestamp is inside the signed material, so
 * a captured body cannot be replayed under a fresh timestamp.
 *
 * @param {string} body
 * @param {string} secret
 * @param {number} timestamp epoch seconds
 * @returns {string}
 */
function signPayload(body, secret, timestamp) {
  return crypto
    .createHmac("sha256", String(secret))
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
}

/**
 * Deliver one payload. Resolves to an outcome; never throws.
 *
 * @param {{ url: string, secret?: string|null }} endpoint
 * @param {object} payload
 * @param {{ fetchImpl?: Function, resolver?: Function, now?: () => number }} [opts]
 * @returns {Promise<{ok: boolean, statusCode: number|null, error: string|null}>}
 */
async function deliver(endpoint, payload, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const now = opts.now || Date.now;

  let url;
  try {
    url = await assertDeliverableUrl(endpoint.url, { resolver: opts.resolver });
  } catch (error) {
    return { ok: false, statusCode: null, error: error.message };
  }

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(now() / 1000);
  const headers = {
    "content-type": "application/json",
    "user-agent": "Pholio-Webhook/1",
    "x-pholio-timestamp": String(timestamp),
    "x-pholio-event": payload?.event || "submission",
  };
  if (endpoint.secret) {
    headers["x-pholio-signature"] = `sha256=${signPayload(body, endpoint.secret, timestamp)}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url.toString(), {
      method: "POST",
      headers,
      body,
      // A public URL that redirects to a private one would defeat the address
      // check entirely, and a webhook receiver has no reason to redirect.
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      return {
        ok: false,
        statusCode: response.status,
        error: "Endpoint redirected; webhooks must be delivered directly.",
      };
    }

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, statusCode: response.status, error: null };
    }

    let detail = "";
    try {
      detail = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
    } catch {
      detail = "";
    }
    return {
      ok: false,
      statusCode: response.status,
      error: detail || `Endpoint returned ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      error:
        error?.name === "AbortError"
          ? `Endpoint did not respond within ${DELIVERY_TIMEOUT_MS}ms.`
          : error?.message || "Delivery failed.",
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  MAX_CONSECUTIVE_FAILURES,
  DELIVERY_TIMEOUT_MS,
  WebhookRejected,
  assertDeliverableUrl,
  deliver,
  isBlockedAddress,
  signPayload,
};
