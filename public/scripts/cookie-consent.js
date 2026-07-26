/**
 * Cookie consent — server-rendered (EJS) pages.
 *
 * Mirrors src/shared/lib/consent.js (server),
 * client/src/shared/lib/cookie-consent.js (React SPA) and
 * pholio-landing/lib/cookie-consent.ts (marketing site).
 * Keep the cookie name, version and payload shape identical in all four.
 *
 * Why this exists: public portfolio pages (/portfolio/:slug) are EJS, not the
 * React SPA, so their visitors never saw a consent banner at all — yet those
 * are exactly the pages that set the persistent `pholio_visitor_id` identifier
 * and write visitor_sessions rows. Server-side tracking is now gated on the
 * shared consent cookie, so the surface being tracked has to be able to ask.
 *
 * No framework: this loads on plain server-rendered pages.
 */
(function () {
  "use strict";

  var CONSENT_COOKIE = "pholio_consent";
  var CONSENT_VERSION = 1;
  var LEGACY_CONSENT_KEY = "pholio_cookie_consent_v1";
  var MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
  var MARKETING = "https://www.pholio.studio";

  function cookieDomain() {
    var host = window.location.hostname;
    if (host === "pholio.studio" || /\.pholio\.studio$/.test(host)) {
      return ".pholio.studio";
    }
    return null;
  }

  function readRawCookie(name) {
    var parts = document.cookie.split("; ");
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf(name + "=") === 0) {
        return parts[i].slice(name.length + 1);
      }
    }
    return null;
  }

  function getConsent() {
    var raw = readRawCookie(CONSENT_COOKIE);
    if (raw) {
      try {
        var parsed = JSON.parse(decodeURIComponent(raw));
        if (
          parsed &&
          parsed.v === CONSENT_VERSION &&
          typeof parsed.necessary === "boolean" &&
          typeof parsed.analytics === "boolean"
        ) {
          return parsed;
        }
      } catch (err) {
        /* fall through */
      }
    }

    // Adopt a pre-cookie per-origin record so returning visitors aren't
    // re-prompted purely by the migration.
    try {
      var legacyRaw = window.localStorage.getItem(LEGACY_CONSENT_KEY);
      if (legacyRaw) {
        var legacy = JSON.parse(legacyRaw);
        if (typeof legacy.analytics === "boolean") {
          setConsent(legacy.analytics);
          return legacy;
        }
      }
    } catch (err) {
      /* localStorage unavailable */
    }

    return null;
  }

  function setConsent(analytics) {
    var payload = encodeURIComponent(
      JSON.stringify({
        v: CONSENT_VERSION,
        necessary: true,
        analytics: analytics === true,
        updatedAt: new Date().toISOString(),
      })
    );

    var domain = cookieDomain();
    var parts = [
      CONSENT_COOKIE + "=" + payload,
      "path=/",
      "max-age=" + MAX_AGE_SECONDS,
      "samesite=lax",
    ];
    if (domain) parts.push("domain=" + domain);
    if (window.location.protocol === "https:") parts.push("secure");

    document.cookie = parts.join("; ");
  }

  function render() {
    if (getConsent()) return;
    if (document.getElementById("pholio-cookie-banner")) return;

    var style = document.createElement("style");
    style.textContent = [
      "#pholio-cookie-banner{position:fixed;left:0;right:0;bottom:0;z-index:1200;",
      "border-top:1px solid #ede8dd;background:#fff;color:#6b6560;",
      "box-shadow:0 -12px 40px -20px rgba(15,23,42,.18);",
      "padding-bottom:max(1rem,env(safe-area-inset-bottom));",
      "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
      "transform:translateY(100%);transition:transform .35s cubic-bezier(.4,0,.2,1)}",
      "#pholio-cookie-banner[data-shown='1']{transform:translateY(0)}",
      "#pholio-cookie-banner .pcb-inner{max-width:72rem;margin:0 auto;display:flex;",
      "flex-direction:column;gap:16px;padding:20px 24px}",
      "@media(min-width:768px){#pholio-cookie-banner .pcb-inner{flex-direction:row;",
      "align-items:center;justify-content:space-between;gap:24px}}",
      "#pholio-cookie-banner .pcb-text{margin:0;max-width:48rem;font-size:.875rem;line-height:1.55}",
      "#pholio-cookie-banner .pcb-text a{color:#b8956a;text-decoration:underline;text-underline-offset:2px}",
      "#pholio-cookie-banner .pcb-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px}",
      "#pholio-cookie-banner button,#pholio-cookie-banner .pcb-link{font:inherit;font-size:10px;",
      "font-weight:700;letter-spacing:.15em;text-transform:uppercase;border-radius:999px;",
      "padding:12px 24px;cursor:pointer;transition:background-color .2s,color .2s}",
      "#pholio-cookie-banner .pcb-primary{background:#1a1815;color:#fff;border:1px solid #1a1815}",
      "#pholio-cookie-banner .pcb-primary:hover{background:#000}",
      "#pholio-cookie-banner .pcb-secondary{background:#fff;color:#1a1815;border:1px solid #1a1815}",
      "#pholio-cookie-banner .pcb-secondary:hover{background:#f5f0e8}",
      "#pholio-cookie-banner .pcb-link{border:none;background:none;color:#6b6560;",
      "font-weight:600;letter-spacing:.12em;text-decoration:none;padding:12px 8px}",
      "#pholio-cookie-banner .pcb-link:hover{color:#1a1815}",
    ].join("");
    document.head.appendChild(style);

    var banner = document.createElement("aside");
    banner.id = "pholio-cookie-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML =
      '<div class="pcb-inner">' +
      '<p class="pcb-text">We use cookies to keep Pholio secure and remember your ' +
      'preferences. Portfolio view analytics are only recorded if you allow them. ' +
      'Read our <a href="' +
      MARKETING +
      '/cookies" target="_blank" rel="noopener noreferrer">Cookie Policy</a> and ' +
      '<a href="' +
      MARKETING +
      '/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>' +
      '<div class="pcb-actions">' +
      '<button type="button" class="pcb-primary" data-consent="all">Accept all</button>' +
      '<button type="button" class="pcb-secondary" data-consent="necessary">Necessary only</button>' +
      '<a class="pcb-link" href="' +
      MARKETING +
      '/cookies" target="_blank" rel="noopener noreferrer">Manage</a>' +
      "</div></div>";

    function dismiss(analytics) {
      setConsent(analytics);
      banner.removeAttribute("data-shown");
      window.setTimeout(function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      }, 350);
    }

    banner.addEventListener("click", function (event) {
      var choice = event.target && event.target.getAttribute("data-consent");
      if (choice === "all") dismiss(true);
      if (choice === "necessary") dismiss(false);
    });

    document.body.appendChild(banner);
    window.requestAnimationFrame(function () {
      banner.setAttribute("data-shown", "1");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
