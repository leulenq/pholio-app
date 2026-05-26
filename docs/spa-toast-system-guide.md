# SPA Toast System Guide

The SPA toast language is designed to feel editorial, calm, and brand-consistent across talent and agency dashboards. It uses Sonner as the runtime engine with custom Pholio styling through `PholioToaster`.

## Canonical Variants

- `success` — completed actions with clear positive outcomes.
- `warning` — recoverable concerns or required attention.
- `error` — failures or blocked actions.
- `info` / default — neutral updates and non-critical notices.

Use `pholioToast` from `client/src/shared/lib/pholio-toast.js` for new work.

## Usage

```js
import { pholioToast } from '@/shared/lib/pholio-toast';

pholioToast.success('Profile saved');

pholioToast.warning({
  title: 'Missing measurement',
  description: 'Add waist and inseam before submitting this comp card.',
});

pholioToast.error({
  title: 'Upload failed',
  description: 'We could not process this image. Try a JPG or PNG under 10MB.',
});
```

## Copy Tone

- Use plain, specific language.
- Keep title concise; use description only when it adds actionable context.
- Avoid hype, emojis, exclamation-heavy tone, and vague filler.
- Prefer one next step when user action is needed.

## Do / Don't

- **Do:** `Profile saved`
- **Do:** `Billing updated. Changes apply next cycle.`
- **Do:** `Session expired` + `Please log in again to continue.`
- **Don't:** `Awesome! You're all set!!!`
- **Don't:** `Error occurred` (without guidance)
- **Don't:** stack multiple toasts for one event when one message is enough.

## Visual QA Checklist

- Verify each variant (`success`, `warning`, `error`, `info`) has distinct accent/icon treatment.
- Check type hierarchy: label < title < description clarity at a glance.
- Confirm spacing rhythm and close button alignment at desktop and mobile widths.
- Ensure reduced motion preference removes non-essential animation.
- Validate contrast for title/body/icons and focus ring visibility on the close button.
