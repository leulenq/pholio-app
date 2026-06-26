# Stripe Checkout Branding

Pholio controls billing UX in-app; Stripe hosts checkout and the customer portal. Use **per-session `branding_settings`** plus account-level branding so hosted Checkout matches Pholio.

## Automated setup (recommended)

```bash
npm run setup:stripe-billing -- --brand --write
```

This uploads brand assets to Stripe, updates account branding, and saves file IDs to `.env`:

| Env var | Purpose |
|---------|---------|
| `STRIPE_BRAND_ICON_FILE_ID` | Square mark for Checkout header |
| `STRIPE_BRAND_LOGO_FILE_ID` | Wordmark lockup on ink |

Assets are read from `public/brand/` (served at `/brand/*` on the app origin).

## Per-session branding (code)

`createCheckoutSession` in `src/shared/lib/stripe.js` passes `branding_settings` from `stripe-checkout-branding.js`:

| Setting | Pholio value |
|---------|----------------|
| `display_name` | `Pholio` (not "Pholio Studio sandbox") |
| `background_color` | `#FAF8F5` (warm canvas) |
| `button_color` | `#C9A55A` (gold — replaces default Stripe blue) |
| `border_style` | `rounded` |
| `font_family` | `noto_serif` (closest to Noto Serif Display) |
| `icon` | Brand mark file or `/brand/pholio-brand-mark.png` |
| `logo` | Wordmark file or `/brand/pholio-wordmark-lockup-on-ink.png` |

`custom_text` also sets trial messaging above/below the pay button.

## Dashboard fallback

Stripe Dashboard → **Settings → Branding**:

| Field | Value |
|-------|--------|
| **Logo** | `public/brand/pholio-wordmark-lockup-on-ink.png` |
| **Icon** | `public/brand/pholio-brand-mark.png` |
| **Brand color** | `#C9A55A` |
| **Accent color** | `#050505` |

Customer Portal uses the same account branding (logo + colors).

## What Stripe still controls

- Checkout page layout and payment form fields
- Portal navigation structure
- Card/bank input UI (Elements inside Checkout)
- Receipt email templates (partially customizable in Dashboard → Emails)

## Brand-controlled surfaces (Pholio app)

| Surface | Component |
|---------|-----------|
| Pre-checkout modal | `SubscriptionCheckoutModal` |
| Redirect interstitial | `CheckoutHandoff` |
| Return from Stripe | `SubscriptionReturnBanner` |
| Settings subscription tab | `SubscriptionSection` |
| Onboarding studio CTA | `CastingCallPage` |

## Enterprise

Do **not** add Enterprise/agency products in Stripe for self-serve billing. Enterprise remains `mailto:hello@pholio.studio` on the marketing site.
