/**
 * Session device identification.
 *
 * The talent settings "signed-in browsers" list used to render a hardcoded
 * `device: "Browser session"` / `location: "Current workspace"` for every row,
 * with a fixed desktop icon in the UI — so an iPhone was reported as a desktop
 * and two devices were indistinguishable. Nothing about the client was ever
 * recorded, so there was nothing truthful to render.
 *
 * This module derives a device description from the User-Agent at sign-in and a
 * stable fingerprint for it. The fingerprint is what lets a device own exactly
 * one session row instead of accumulating one per re-auth: the browser sends the
 * same UA every time, so the same device collapses onto the same record.
 *
 * Deliberately dependency-free. We only need the device *class* (phone / tablet /
 * desktop), the browser family, and the OS family — coarse, stable signals — not
 * the full UA taxonomy a parsing library would pull in.
 */

const crypto = require("crypto");

const UNKNOWN_DEVICE = Object.freeze({
  type: "unknown",
  label: "Unrecognised device",
  browser: null,
  os: null,
});

/** @returns {"phone"|"tablet"|"desktop"|"unknown"} */
function detectType(ua) {
  if (!ua) return "unknown";

  // iPadOS 13+ reports a desktop Macintosh UA, so a Mac that reports touch
  // points is an iPad. That signal isn't in the UA, which is precisely why iPads
  // are the one class we can under-report; a tablet-shaped iPad still lands in
  // "desktop" rather than being guessed at wrongly.
  if (/\biPad\b/i.test(ua)) return "tablet";
  if (/\bTablet\b|\bKindle\b|\bSilk\b|\bPlayBook\b/i.test(ua)) return "tablet";
  if (/\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua)) return "tablet";

  if (/\biPhone\b|\biPod\b/i.test(ua)) return "phone";
  if (/\bAndroid\b.*\bMobile\b|\bWindows Phone\b|\bIEMobile\b/i.test(ua)) {
    return "phone";
  }
  if (/\bMobile\b/i.test(ua)) return "phone";

  if (/\bMacintosh\b|\bMac OS X\b|\bWindows NT\b|\bLinux\b|\bCrOS\b/i.test(ua)) {
    return "desktop";
  }
  return "unknown";
}

/** Order matters: every Chromium browser also claims "Safari", Edge claims "Chrome". */
function detectBrowser(ua) {
  if (!ua) return null;
  if (/\bEdgA?\/|\bEdge\//i.test(ua)) return "Edge";
  if (/\bOPR\/|\bOpera\//i.test(ua)) return "Opera";
  if (/\bFirefox\/|\bFxiOS\//i.test(ua)) return "Firefox";
  if (/\bCriOS\//i.test(ua)) return "Chrome";
  if (/\bSamsungBrowser\//i.test(ua)) return "Samsung Internet";
  if (/\bChrome\//i.test(ua)) return "Chrome";
  if (/\bSafari\//i.test(ua)) return "Safari";
  return null;
}

function detectOs(ua) {
  if (!ua) return null;
  if (/\biPhone\b|\biPad\b|\biPod\b/i.test(ua)) return "iOS";
  if (/\bAndroid\b/i.test(ua)) return "Android";
  if (/\bWindows NT\b/i.test(ua)) return "Windows";
  if (/\bCrOS\b/i.test(ua)) return "ChromeOS";
  if (/\bMac OS X\b|\bMacintosh\b/i.test(ua)) return "macOS";
  if (/\bLinux\b/i.test(ua)) return "Linux";
  return null;
}

/**
 * A human label a talent can actually match against a device they own —
 * "Safari on iOS", "Chrome on Windows" — never a generic "Browser session".
 */
function buildLabel({ browser, os, type }) {
  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  if (type === "phone") return "Mobile browser";
  if (type === "tablet") return "Tablet browser";
  if (type === "desktop") return "Desktop browser";
  return UNKNOWN_DEVICE.label;
}

/**
 * @param {string|undefined|null} userAgent
 * @returns {{type: string, label: string, browser: string|null, os: string|null}}
 */
function describeDevice(userAgent) {
  const ua = typeof userAgent === "string" ? userAgent.trim() : "";
  if (!ua) return { ...UNKNOWN_DEVICE };

  const type = detectType(ua);
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  return { type, label: buildLabel({ browser, os, type }), browser, os };
}

/**
 * Stable per-device key. Derived from the coarse description rather than the raw
 * UA on purpose: Chrome ships a new patch version every couple of weeks, and
 * hashing the raw string would make the same laptop look like a new device after
 * every browser update — reintroducing exactly the row-per-visit problem.
 *
 * @param {string|undefined|null} userAgent
 * @returns {string}
 */
function deviceFingerprint(userAgent) {
  const { type, browser, os } = describeDevice(userAgent);
  return crypto
    .createHash("sha256")
    .update(`${type}|${browser || "?"}|${os || "?"}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Record the device on the session itself. `connect-session-knex` persists the
 * whole `sess` blob, so this needs no schema change and travels with the row it
 * describes.
 *
 * @param {import('express').Request} req
 */
function stampSessionDevice(req) {
  if (!req?.session) return null;

  const userAgent = req.headers?.["user-agent"] || null;
  const described = describeDevice(userAgent);
  const stamp = {
    ...described,
    fingerprint: deviceFingerprint(userAgent),
    // Kept for abuse investigation only. Never rendered back to the user: an
    // IP-derived city is wrong often enough on mobile carriers that showing it
    // on a security screen would recreate the trust problem this replaces.
    ip: typeof req.ip === "string" ? req.ip : null,
    signedInAt: new Date().toISOString(),
  };

  req.session.device = stamp;
  return stamp;
}

module.exports = {
  UNKNOWN_DEVICE,
  describeDevice,
  deviceFingerprint,
  stampSessionDevice,
};
