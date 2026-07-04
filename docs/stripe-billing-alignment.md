# Stripe Billing Alignment

**Date:** 2026-06-25  
**Source of truth for amounts/intervals/trial:** `src/shared/lib/billing-plan.js`  
**Source of truth for charged amounts:** Stripe Price objects referenced by env vars

**Checkout branding (Dashboard + in-app surfaces):** [stripe-checkout-branding.md](./stripe-checkout-branding.md)

## Product truth (code + Stripe)

| Item | Value |
|------|-------|
| Plan name | **Studio+** |
| Plan ID (app metadata) | `studio_plus` |
| Monthly | **$9.99/month** |
| Annual | **$95.88/year** (displayed as $7.99/mo equivalent) |
| Free trial | **14 days** — set on Checkout `subscription_data.trial_period_days`, not on Stripe Price |
| Billing disclosure version | `2026-06-25` |
| Scope | **Talent only** (`requireRole("TALENT")` on all `/stripe/*` checkout routes) |
| Enterprise / agencies | **Contact sales only** — no self-serve Stripe billing in app |

## Stripe objects (test mode — Pholio Studio)

Provisioned by `npm run setup:stripe-billing`:

| Object | ID |
|--------|-----|
| Product | `prod_Ulux53KHpmbtqh` |
| Monthly price ($9.99/mo) | `price_1TmN805JdSqTVxkGQnkwZWNw` |
| Annual price ($95.88/yr) | `price_1TmN805JdSqTVxkGEyeoZaKI` |

Re-run `node scripts/setup-stripe-billing.js` to find or recreate matching prices in other Stripe accounts (e.g. live mode).

## Stripe objects (live mode — Pholio Studio)

Provisioned 2026-06-25 via Stripe MCP (mirrors sandbox). **Full Netlify checklist:** [stripe-live-setup.md](./stripe-live-setup.md)

| Object | ID |
|--------|-----|
| Product | `prod_UlvSm7FpMYpAfE` |
| Monthly price ($9.99/mo) | `price_1TmNc95fG8vzA1hRHuZfyg8k` |
| Annual price ($95.88/yr) | `price_1TmNc95fG8vzA1hRZjRtrBkp` |

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `STRIPE_SECRET_KEY` | Yes | Server SDK |
| `STRIPE_PUBLISHABLE_KEY` | Optional | EJS `res.locals` only; React checkout is redirect-based |
| `STRIPE_WEBHOOK_SECRET` | Yes (prod) | Webhook signature verification |
| `STRIPE_PRICE_ID_MONTHLY` | Yes | Monthly Studio+ checkout |
| `STRIPE_PRICE_ID_ANNUAL` | Yes | Annual Studio+ checkout |
| `STRIPE_PRICE_ID` | Legacy | Fallback monthly if `STRIPE_PRICE_ID_MONTHLY` unset |

Display labels in app come from `billing-plan.js`, not from Stripe API. **Stripe Price amounts must match** or Checkout will show different numbers than in-app copy.

## Checkout flow (implemented)

1. Talent accepts billing disclosure (`billing_disclosure_accepted: true`)
2. `POST /stripe/create-checkout-session` with `interval: monthly|annual`
3. Trial applied if user has no prior `trial_start` in DB
4. Redirect to Stripe Checkout (subscription mode)
5. Success → `GET /stripe/checkout/success` → `upsertSubscriptionFromStripe`
6. Webhooks keep subscription state in sync

## Landing ↔ app mapping

| Surface | Monthly | Annual | CTA |
|---------|---------|--------|-----|
| `billing-plan.js` | $9.99/mo | $95.88/yr | — |
| `.pholio-landing-ref/.../PricingSection.tsx` | $9.99/mo | $7.99/mo ($95.88/yr) | `{APP_URL}/signup?plan=studio` |
| App settings / disclosure | $9.99/mo | $95.88/yr | `/stripe/create-checkout-session` |
| Enterprise | — | — | `mailto:hello@pholio.studio` (contact sales) |

`?plan=studio` on signup → onboarding may open checkout modal (`CastingCallPage`); billing home is `/dashboard/talent/settings/subscription`.

## Manual dashboard steps still required

1. **Webhook** — `POST /stripe/webhook`  
   - Dev: `stripe listen --forward-to localhost:3000/stripe/webhook`  
   - Prod: `https://app.pholio.studio/stripe/webhook`  
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`

2. **Customer Portal** — Stripe Dashboard → Settings → Billing → Customer portal (enable for plan changes/cancellation)

3. **Live mode** — See [stripe-live-setup.md](./stripe-live-setup.md). Set live API keys + price IDs in Netlify; run `STRIPE_SECRET_KEY=sk_live_... node scripts/setup-stripe-billing.js --brand --write-live` for logo file IDs.

4. **Do not create** agency/enterprise Stripe products for in-app self-serve billing

## Stale references cleaned / flagged

| Item | Status |
|------|--------|
| README `STRIPE_PRO_PRICE_ID` | **Removed** — use `STRIPE_PRICE_ID_MONTHLY` / `_ANNUAL` |
| `tasks/legal-audit.md` ~$29/mo | **Stale** — code uses $9.99 |
| Settings redesign docs $29 mocks | **Stale** — design docs only |
| `marketing-pricing.ts` centralization | **Not implemented** — landing prices inline in components |
| Free tier application limit | **Mismatch** — landing says 3/mo, code enforces 5/mo (`applications.js`) |
| Landing “No card required” copy | **Mismatch** — Stripe Checkout collects payment method for trial |

## Commands

```bash
npm run setup:env              # scaffold .env + client/.env
npm run setup:stripe-billing   # create/find Stripe product + prices, write IDs to .env
```
