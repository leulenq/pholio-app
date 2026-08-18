# Studio+ gate audit — Phase 7 input (2026-08-15)

Audit of every remaining pro/paid gate against the governing rule (plan §9.5): **anything an
agency sees or receives is identical for every talent; payment only changes what the talent
keeps.** Audited at `4cb336c`. This document is the worklist for the Phase 7 restructure.

## A. Verified clean (no action)

- Application quota: flat 5/mo, tier-blind (`src/domains/talent/services/application-quota.js:10`).
- Directory: full for everyone (`src/domains/talent/routes/agencies.js:14-19`).
- Discoverability: `is_discoverable` only (`src/domains/onboarding/services/pool-status.js:26-43`).
- Comp-card watermark: removed (grep-verified absent from `pdf.js`).
- All four AI writers un-gated (`80a2bc5`); comp-card import un-gated; spec-registry export never gated.
- Agency domain: zero `is_pro` reads anywhere (agencies structurally cannot see tier).
- Print bleed (`?print=1`) currently ungated — a monetization gap, not a violation (plan §9.5 lists
  300dpi/print as legitimate paid; decide during restructure).

## B. Legitimate KEEP gates (craft/property)

- PDF theme tier + customizations: `src/domains/pdf/routes/pdf.js:1260,1267,1390,1407,1747,1753,2177,2256,3176-3178,3254,3262,3296`; `pdf-custom.js:62,85-88`. Themes: 4 free / 7 pro (`src/domains/pdf/themes.js:250-539`).
- Intel/analytics 7d vs 90d windows: `intel.js:51-52`, `analytics.js:747-748,820`.
- Analytics CSV export pro-only: `analytics.js:883-884`.
- Intel day-scrub detail pro-only: `intel.js:93-95`.
- Intel `book` (per-image opens) + `momentum` nulled for free: `intel.js:76-77` — own-data depth, KEEP.

## C. VIOLATIONS — the Phase 7 worklist (priority order)

1. **Public portfolio forks on payment (TOP PRIORITY — agency-visible).**
   `src/routes/portfolio.js:473` selects `portfolio-pro` vs `layout` shell by `is_pro`;
   `views/portfolio/show.ejs:1` forks the whole template. Pro-only content an agency sees:
   Languages (:69), Availability (:88), Experience (:102), Training (:120), hyperlinked
   socials (:140-161 — free gets plain text), Nationality/union/ethnicity (:169),
   tattoos/piercings (:186), and a literal `portfolio-pro-badge` "Studio+" span (:19) that
   advertises payment status to the recipient. `tasks/todo.md` A2-6/A2-7 claim this was
   fixed; the `bdb0f15` merge never touched `show.ejs`. FIX: one identical public page for
   everyone (full content, linked socials, no badge); tier may affect nothing here.
2. **Paid guidance: Intel decisions truncated for free.** `intel.js:78` slices the
   decision stack to 1 item while the comment (:67-69) claims free keeps it. Guidance must
   never be paywalled (NY FWA prong (c)). FIX: full stack free; comment stays true.
3. **Live Stripe product description says "unlimited agency applications"**
   (`scripts/setup-stripe-billing.js:108-109`; live product `prod_UlvSm7FpMYpAfE` per
   `docs/stripe-live-setup.md`). Procurement-adjacent language on a customer-facing Stripe
   surface. FIX: rewrite to craft-only copy + note that the LIVE Stripe object needs a
   re-provisioning pass (runbook item — code fix alone doesn't update Stripe).
4. **Settings upsell lede claims "submission volume"** (`client/.../SettingsPage/index.jsx:902`)
   — false (quota is flat by design) and the exact dangerous sentence from plan §5.2.3.
   FIX: converge on the RightSidebar pattern (`RightSidebar.jsx:92-95` is the correct,
   rule-enforcing copy: themes + analytics only).
5. **`?debug=pro` bypass** in `analytics.js:882` — unauthenticated gate bypass in prod
   route code. FIX: remove.
6. **QR + agency-logo render gates half-reconciled.** Render still pro-gated
   (`pdf.js:1307,1485,1512-1519`) but the three logo upload/set/delete routes were un-gated
   in `bdb0f15` → free talent can upload a logo that never renders. Plan §9.5's free list
   includes "watermark-free standard comp card, QR, logo, linked socials" → RULING NEEDED
   at implementation: free the render gates (plan-consistent) and keep theme/customization
   as the paid surface.
7. **Dead code to delete:** `public/scripts/pro-preview.js` (orphaned, claims watermark
   exists), `src/routes/pro.js:22-31` (`/pro/upgrade` renders a nonexistent view — would 500).
8. **JUDGMENT CALLS (lead ruling at implementation):**
   - `intel.js:71-74` markets/sources/rhythm nulled for free — own-traffic depth, leans KEEP.
   - Overview "Your Website" card hidden for free (`OverviewPage/index.jsx:239,619`) — the
     public portfolio exists for free users regardless; hiding the card hides their own
     asset. Leans: show the card free (URL + share), keep the traffic analytics inside it paid.

## D. Billing stack state (ROSCA)

- Checkout: server-enforced disclosure acceptance (`stripe.js:38-43`), 14-day trial,
  `missing_payment_method: cancel`, unchecked-by-default consent checkbox
  (`SubscriptionCheckoutDisclosure.jsx:40-68`). Good shape.
- Cancel: two clicks via Stripe hosted portal (Settings → Manage billing), portal config
  pinned (`docs/stripe-live-setup.md:85-94`). `cancelSubscription()` in `stripe.js:167-181`
  is dead code (never called).
- Gaps: (1) portal `return_url` carries `billing=portal-return` but SettingsPage never reads
  it — no post-cancel confirmation; (2) `trial_will_end` webhook is a no-op (:111-115) — no
  pre-charge notice; (3) **no jurisdiction gate exists** — checkout ignores location.

## E. Geofence primitives

No geofencing exists. `src/shared/lib/geolocation.js:11-63` (`getIPGeolocation` → ipapi.co,
returns `region` state code) is the only primitive; callers are signup intel
(`auth.js:560-580`) and market resolve (`market-resolve.js:127`). NY-first/CA-geofence =
new code in `POST /stripe/create-checkout-session`.

## F. Pricing

`src/shared/lib/billing-plan.js:1-20`: $9.99/mo, $95.88/yr, 14-day trial, disclosure
version 2026-06-25. Consistent everywhere except the two copy violations in §C.3-4.

## G. Not yet built (the §9.5 paid tier's substance)

Market packs (NY/Paris/Milan card variants), card version history, preset freeze, multiple
concurrent editions, custom domain, tiered storage (`SUBMISSION_PACKAGE_MAX_IMAGES = 50`
flat at `media.js:2542`), digitals archive/versioning. `market-resolve.js` CITY_MARKETS is
the closest scaffolding.
