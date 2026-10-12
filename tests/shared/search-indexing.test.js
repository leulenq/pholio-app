const express = require("express");
const request = require("supertest");
const fs = require("fs");
const path = require("path");
const { searchIndexing, isPrivateSearchPath } = require("../../src/shared/middleware/search-indexing");

const app = express();
app.use(searchIndexing);
app.use((req, res) => res.status(req.path.includes("missing") ? 404 : 200).send("test"));

it.each([
  "/", "/login", "/login/forgot-password", "/login/missing", "/reset-password?oobCode=token",
  "/onboarding", "/onboarding/test", "/dashboard", "/dashboard/talent", "/dashboard/agency/settings",
  "/dashboard-app/index.html", "/reply/token", "/picks/token", "/opencall/token", "/opencall/materials/token",
  "/internal", "/internal/agency-requests", "/auth/instagram/callback", "/socials/oauth/mock/google",
  "/apply", "/agency", "/messages", "/activity", "/reveal", "/signup", "/logout", "/partners",
  "/api/talent/profile", "/api/public/opencall/call/token", "/pdf/person", "/compcard/person",
  "/guardian-consent?token=secret", "/stripe/checkout/success", "/upload", "/health",
])("sets noindex on private/utility route %s", async (pathname) => {
  const response = await request(app).get(pathname);
  expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
});

it.each(["/portfolio/person", "/p/person", "/portfolio/person/", "/uploads/photo.jpg", "/scripts/cookie-consent.js", "/login-public", "/dashboarder"])(
  "does not impose noindex on a public or neighboring path %s", async (pathname) => {
    expect((await request(app).get(pathname)).headers["x-robots-tag"]).toBeUndefined();
  },
);

it("handles trailing slashes without accidental prefix matches", () => {
  expect(isPrivateSearchPath("/login/" )).toBe(true);
  expect(isPrivateSearchPath("/portfolio/login")).toBe(false);
});

it("gives every explicit Netlify SPA rewrite a noindex response header", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../netlify.toml"), "utf8");
  const blocks = source.split("[[redirects]]").slice(1);
  const patterns = [...source.matchAll(/\[\[headers\]\]\s+for = "([^"]+)"\s+\[headers.values\]\s+X-Robots-Tag = "noindex, nofollow"/g)].map((entry) => entry[1]);
  const covered = (route) => patterns.includes(route) || patterns.some((pattern) => pattern.endsWith("/*") && route.startsWith(pattern.slice(0, -1)));
  for (const block of blocks) {
    if (!/to = "\/dashboard-app\/index.html"/.test(block)) continue;
    const route = /from = "([^"]+)"/.exec(block)[1];
    if (route === "/*") continue; // Catch-all uses the SPA's universal robots meta.
    expect({ route, covered: covered(route) }).toEqual({ route, covered: true });
  }
  expect(patterns).toContain("/dashboard-app/*");
  expect(patterns).not.toContain("/*");
  expect(patterns.some((pattern) => pattern.startsWith("/portfolio") || pattern.startsWith("/p/"))).toBe(false);
});

it("marks the SPA shell itself noindex without modifying public EJS shells", () => {
  const read = (name) => fs.readFileSync(path.join(__dirname, "../..", name), "utf8");
  expect(read("client/index.html")).toContain('<meta name="robots" content="noindex, nofollow" />');
  for (const file of ["views/layout.ejs", "views/portfolio-pro.ejs"]) {
    expect(read(file)).not.toMatch(/name="robots"[^>]*noindex/);
  }
});
