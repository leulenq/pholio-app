"use strict";

/**
 * Every client route must be reachable in production.
 *
 * Netlify serves the SPA only for paths that match a redirect rule. `/login`
 * was matched EXACTLY, so `/login/forgot-password` returned a Netlify 404 and
 * PASSWORD RESET WAS UNREACHABLE in production. `/p/:slug` — the URL printed on
 * every comp card's QR and NFC tag — had no rule at all, so every printed card
 * scanned to a 404.
 *
 * Both are the same failure: a route added in the app, and nobody remembering a
 * config file in a different language. This test is the thing that remembers.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const toml = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
const appJsx = fs.readFileSync(
  path.join(ROOT, "client", "src", "App.jsx"),
  "utf8",
);

/** Every `from = "..."` in netlify.toml, in order. Order matters: first wins. */
const rules = [...toml.matchAll(/from\s*=\s*"([^"]+)"/g)].map((m) => m[1]);

/** Every `path="..."` the router declares. */
const clientRoutes = [
  ...new Set([...appJsx.matchAll(/path="([^"]+)"/g)].map((m) => m[1])),
]
  .filter((route) => route.startsWith("/"))
  // Dev-only surfaces are deliberately unreachable in production.
  .filter((route) => !route.startsWith("/dev/"))
  .filter((route) => !route.startsWith("/socials/oauth/mock"));

/** Does any rule match this concrete path? Mirrors Netlify's splat semantics. */
function matched(routePath) {
  return rules.some((rule) => {
    if (rule.endsWith("/*")) return routePath.startsWith(rule.slice(0, -1));
    if (rule === "/*") return true;
    return rule === routePath;
  });
}

/** Replace `:params` with something concrete so matching is realistic. */
const concrete = (route) => route.replace(/:[^/]+/g, "sample");

describe("every client route has a Netlify rule", () => {
  test.each(clientRoutes.map((route) => [route]))("%s is reachable", (route) => {
    expect(matched(concrete(route))).toBe(true);
  });

  test("the two that were actually broken are covered by name", () => {
    // Regression pins, since these are the ones that reached production.
    expect(matched("/login/forgot-password")).toBe(true);
    expect(matched("/reset-password")).toBe(true);
  });
});

describe("server routes still reach the function", () => {
  const serverPaths = [
    ["/api/anything", "the API"],
    ["/p/ada-editorial", "the comp card QR target"],
    ["/pdf/view/ada", "PDF rendering"],
    ["/stripe/webhook", "Stripe"],
    ["/logout", "sign-out"],
  ];

  test.each(serverPaths)("%s is not swallowed by the SPA catch-all", (routePath) => {
    // Find the FIRST matching rule, which is the one Netlify applies.
    const first = rules.find((rule) =>
      rule.endsWith("/*")
        ? routePath.startsWith(rule.slice(0, -1))
        : rule === routePath,
    );
    expect(first).toBeDefined();
    const index = rules.indexOf(first);
    const target = [...toml.matchAll(/from\s*=\s*"([^"]+)"\s*\n\s*to\s*=\s*"([^"]+)"/g)][index];
    expect(target?.[2]).toContain("functions/server");
  });
});

describe("the catch-all is last", () => {
  test("so it can never pre-empt a server route", () => {
    // The whole safety of a catch-all is that everything specific precedes it.
    expect(rules[rules.length - 1]).toBe("/*");
    expect(rules.filter((rule) => rule === "/*")).toHaveLength(1);
  });
});
