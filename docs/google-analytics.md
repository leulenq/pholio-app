# Google Analytics 4

Pholio uses one GA4 web stream for `www.pholio.studio` and `app.pholio.studio`. Set the same measurement ID on both deployments. No Google script loads until the shared `pholio_consent` cookie explicitly grants analytics. Ads consent remains denied. The app does not send user IDs, emails, names, raw queries, tokens, profile slugs, or document titles.

## Activation status

The existing Pholio stream is `G-2BBQXGH7EP` (property `513364065`, stream `13002328781`). Local ignored environment files record this ID with enablement set to false. Production activation is pending review of analytics disclosures: the site candidate legal version is `2026-09-15`, while the app accepts `2026-07-18`. This integration does not modify the legal corpus or acceptance version.

## Deployment

For the Netlify SPA build, set `VITE_GA_MEASUREMENT_ID=G-…` and `VITE_GA_ENABLED=true`. For server-rendered public portfolio pages, set runtime `GA_MEASUREMENT_ID` to the same ID and `GA_ENABLED=true` with `NODE_ENV=production`. Rebuild after changing Vite variables. Keep `VITE_GA_DEBUG=false` in production. Local testing uses a separate test stream with both `VITE_GA_ENABLED=true` and `VITE_GA_DEBUG=true`; preview domains remain disabled.

In GA4 Admin, turn off Enhanced Measurement (especially history pageviews, form interactions, and outbound links). Pholio sends manual sanitized pageviews, so automatic collection can duplicate views or capture personal URLs. Keep Google Signals and user-provided data off. The owner approved advertising personalization for US states plus DC only (51 of 307 regions); all others are disabled. Web advertising consent remains denied and tag personalization stays disabled regardless of that property setting. Review existing retention (event data 2 months, user data 14 months, activity reset on) before activation. Subdomains share the GA cookie domain and measurement ID; verify continuity after release.

## Admin privacy settings reviewed

Enhanced Measurement is off. Google tag automatic event detection (history, forms, outbound links, media) was separately disabled and saved. User-provided data capability, including automatic email/name/phone collection, was disabled and saved. These settings are separate controls and must remain off for Pholio’s manual, sanitized telemetry. The Pholio surface event-scoped custom dimension is registered. generate_lead is registered as a key event counted once per session without a monetary value.

## Events and verification

`page_view` is emitted once per app pathname navigation after consent, with a normalized route in the payload. The raw pathname is used only in browser memory for deduplication, so navigating between two talent profiles counts two views without transmitting either identifier. `login` is emitted only after a successful explicit backend login and has a bounded `method` (`email` or `google`). No `sign_up` event is emitted yet: casting entry is retryable and does not expose an unambiguous newly-created-account result. No payment event is inferred from a checkout redirect.

Verify no Google requests/cookies before choice or after Necessary only. Accept analytics and confirm one initial pageview, one view per route, sanitized parameters, and login only on success. Withdraw via Cookie preferences and confirm GA cookies disappear and events stop. Changes from another tab are checked on focus, visibility and polling. Use local DebugView testing with a test stream, then verify production Realtime after deployment.

Shared runtime: `public/scripts/google-analytics.mjs`, mirrored byte-for-byte from pholio-site. SPA adapter: `client/src/shared/lib/google-analytics.js`; public portfolio adapter: `public/scripts/google-analytics-ejs.mjs`.
