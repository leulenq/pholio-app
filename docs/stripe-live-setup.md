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
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_ID_MONTHLY=price_1TmNc95fG8vzA1hRHuZfyg8k
STRIPE_PRICE_ID_ANNUAL=price_1TmNc95fG8vzA1hRZjRtrBkp
STRIPE_WEBHOOK_SECRET=whsec_...        # From live webhook endpoint (below)
STRIPE_BRAND_ICON_FILE_ID=...          # After --live-brand run
STRIPE_BRAND_LOGO_FILE_ID=...          # After --live-brand run
```

Keep **test** keys in local `.env` only. Do not commit live secrets.

## Remaining manual steps

### 1. Live webhook endpoint

Stripe Dashboard (switch to **Live**) → **Developers → Webhooks → Add endpoint**

- **URL:** `https://app.pholio.studio/stripe/webhook`
- **Events:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`

Copy signing secret → `STRIPE_WEBHOOK_SECRET` in Netlify.

### 2. Live checkout branding (logo upload)

MCP cannot upload binary files. Run locally with your **live** secret key:

```bash
STRIPE_SECRET_KEY=sk_live_... node scripts/setup-stripe-billing.js --brand --write-live
```

This uploads Pholio assets and writes `STRIPE_BRAND_*_FILE_ID` to `.env.live` (does not overwrite test `.env`).

### 3. Dashboard branding (live)

**Settings → Branding** (in Live mode):

- Logo: `public/brand/pholio-wordmark-lockup-on-ink.png`
- Icon: `public/brand/pholio-brand-mark.png`
- Brand color: `#C9A55A`
- Accent: `#050505`

### 4. Customer Portal (live)

**Settings → Billing → Customer portal** — enable in Live mode.

## Verify

1. Deploy Netlify with live env vars
2. Log in as talent on production
3. Start Studio+ checkout — confirm gold button, Pholio wordmark, $9.99 / $95.88
4. Complete a real subscription (or cancel during trial)
5. Confirm webhook delivers `checkout.session.completed` in Dashboard → Webhooks
