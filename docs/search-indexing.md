# App search indexing

The public marketing site is `www.pholio.studio`. The app SPA is a product/utility surface and must not appear in search results. Its shared `client/index.html` contains `robots: noindex, nofollow`, including unknown routes handled by the static SPA fallback.

Netlify supplies `X-Robots-Tag: noindex, nofollow` for explicit SPA routes and `/dashboard-app/*` direct access. Express supplies the same header before auth, routes and static files for app, API, PDF, comp-card and token/guardian utility routes, including errors and redirects. These directives affect search indexing only; they do not provide authentication or hide public URLs.

Public EJS portfolios under `/portfolio/:slug` and `/p/:slug` retain their existing indexing eligibility. No blanket `/*` noindex header or crawl-blocking robots rule is introduced, so crawlers can observe noindex on private/utility pages. Portfolio eligibility does not guarantee indexing and remains subject to each route's existing visibility/age/access rules.

## Verification and rollout

Focused tests check private routes, public portfolio exclusions, adjacent prefix names, errors, SPA meta and coverage of every explicit Netlify SPA rewrite. The production SPA build preserves the robots meta. These changes are local until deployed; verify production response headers on `/login`, `/reset-password`, `/onboarding`, `/dashboard/talent`, and `/dashboard-app/index.html`, and confirm public portfolio responses have no new noindex header after deployment. Search Console setup and marketing sitemap/canonical checks are handled in pholio-site.
