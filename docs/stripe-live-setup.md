# Stripe Live Mode Setup (Pholio Studio)

**Account:** `acct_1TmMxa5fG8vzA1hR` (Pholio Studio)  
**Provisioned:** 2026-06-25 via Stripe MCP (mirrors sandbox Studio+ config)

## Live objects (created)

| Object | Live ID | Amount |
|--------|---------|--------|
| Product **Studio+** | `prod_UlvSm7FpMYpAfE` | — |
| Monthly price | `price_1TmNc95fG8vzA1hRHuZfyg8k` | $9.99/mo |
| Annual price | `price_1TmNc95fG8vzA1hRZjRtrBkp` | $95.88/yr |

**Dashboard:** [Studio+ product (live)](https://dashboard.stripe.com/products/prod_UlvSm7FpMYpAfE)

Sandbox equivalents (test mode — keep in local `.env`):

| Object | Sandbox ID |
|--------|------------|
| Product | `prod_Ulux53KHpmbtqh` |
| Monthly | `price_1TmN805JdSqTVxkGQnkwZWNw` |
| Annual | `price_1TmN805JdSqTVxkGEyeoZaKI` |

## Netlify / production environment

Set these in **Netlify → Environment variables** (live mode values):

```bash
STRIPE_SECRET_KEY=sk_live_...          # Dashboard → Developers → API keys
STRIPE_PRICE_ID_MONTHLY=price_1TmNc95fG8vzA1hRHuZfyg8k
STRIPE_PRICE_ID_ANNUAL=price_1TmNc95fG8vzA1hRZjRtrBkp
STRIPE_WEBHOOK_SECRET=whsec_...        # From live webhook endpoint (below)
```

Keep **test** keys in local `.env` only. Do not commit live secrets.

> ⚠️ **Do NOT set `STRIPE_BRAND_ICON_FILE_ID` / `STRIPE_BRAND_LOGO_FILE_ID` in Netlify.**
>
> The Lambda-compatibility function runtime caps *all* environment variables at
> **4KB combined**, and this project sits within ~100 bytes of that ceiling
> (`FIREBASE_PRIVATE_KEY` alone is ~1.75KB). Adding those two vars overflows the
> limit and every deploy fails at function upload with
> `Your environment variables exceed the 4KB limit imposed by AWS Lambda` —
> reported confusingly as `Build script returned non-zero exit code: 2` even
> though the build itself succeeded.
>
> They are unnecessary anyway: with the file IDs unset,
> `buildCheckoutBrandingSettings()` falls back to public URLs
> (`/brand/pholio-brand-mark.png`, `/brand/pholio-wordmark-lockup-on-ink.png`),
> which Stripe accepts and which render identical branding.
>
> `STRIPE_PUBLISHABLE_KEY` is also omitted: no code path reads it (checkout is a
> server-side redirect), so it only consumes budget.
>
> Before adding *any* new production env var, check the headroom:
> `netlify env:list --context production --json`. The durable fix is migrating
> the function off Lambda compatibility mode (<https://ntl.fyi/functions-migrate>),
> which removes the 4KB limit entirely.

## Completed (2026-07-28)

### 1. Live webhook endpoint — ✅ done

`we_1TyGUo5fG8vzA1hRwDyMaCbu` → `https://app.pholio.studio/stripe/webhook`

Pinned to **`api_version 2024-12-18.acacia`**, matching the `Stripe()` client in
`src/shared/lib/stripe.js`. Keep it pinned: the handler reads
`invoice.subscription`, which later API versions relocate — an unpinned endpoint
would silently stop activating subscriptions.

Registers all **seven** events the handler switches on (the original list here
omitted `trial_will_end`, which matters given the 14-day trial):

`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`

Signing secret is set in Netlify (`production` context, marked secret).

> The value next to the endpoint in the Dashboard is the endpoint **ID**
> (`we_…`), not the signing secret (`whsec_…`). Pasting the former is silent —
> `constructEvent` only throws once a real event arrives, so every webhook 400s
> and no subscription ever activates. `src/config.js` warns about this at startup.

### 2. Customer Portal — ✅ done

Configuration `bpc_1TyGZr5fG8vzA1hRhU5bYEWe`, set as the account default so
`billingPortal.sessions.create()` (which passes no `configuration`) resolves it.
Enables cancel-at-period-end with reasons, payment-method update, invoice
history, customer update, and monthly↔annual switching with prorations — the
portal is the only path between intervals, as the app has no in-app switcher.

Without a default configuration this call **throws**, so "Manage subscription"
500s for every subscriber.

### 3. Live checkout branding — handled via URL fallback

Do **not** run `--brand --write-live` against production: it writes
`STRIPE_BRAND_*_FILE_ID`, which overflows the 4KB env limit (see warning above).
The URL fallback is already active and verified.

## Remaining manual steps

### 4. Dashboard branding (live)

**Settings → Branding** (in Live mode):

- Logo: `public/brand/pholio-wordmark-lockup-on-ink.png`
- Icon: `public/brand/pholio-brand-mark.png`
- Brand color: `#C9A55A`
- Accent: `#050505`

## Verify

1. Deploy Netlify with live env vars
2. Log in as talent on production
3. Start Studio+ checkout — confirm gold button, Pholio wordmark, $9.99 / $95.88
4. Complete a real subscription (or cancel during trial)
5. Confirm webhook delivers `checkout.session.completed` in Dashboard → Webhooks
