# Login entry transition — stability fix

## Evidence (screen recording, 2026-07-29 13:41, 60fps, sampled every 0.2s)

| t | what is on screen |
|---|---|
| 0.0–4.6s | `/login`, Google popup opens, account chooser |
| 4.6–6.0s | popup closed; `/login` still shown with a bare spinner inside the Google button (**1.4s of dead time**) |
| 6.0s | URL becomes `/dashboard/talent` via a **full document load** |
| 6.4–6.8s | ink splash play #1 — "Welcome back." with **`TA`** initials (profile not loaded) |
| 7.0s | **cream full-screen `PageLoadingScreen`** — splash gone |
| 7.2–7.6s | ink splash play #2, entrance animation replays from zero |
| 7.8–8.0s | dashboard behind + "Welcome back, **Leul**." fading out |
| 8.4s+ | settled |

Perceived as ~3 refreshes. The URL never left `/dashboard/talent` after 6.0s, so
the cream frame was **not** a bounce to `/login`.

## Root causes

1. **Hard navigation after auth.** `LoginPage.authenticateWithBackend` ends with
   `window.location.href = data.redirect`. The whole SPA is torn down and
   re-booted — blank page, chunk re-download, Firebase re-init, cache re-fetch.
2. **The Suspense boundary sits above the splash.** `App.jsx` wraps all `<Routes>`
   in one `<Suspense fallback={<PageLoadingScreen/>}>`. `DashboardLayoutShell`
   rendered its own splash *inside* that boundary. The first render of `<Outlet/>`
   (lazy `OverviewPage`) suspends → React swaps the entire shell, splash included,
   for the cream fallback, then reveals it → the splash entrance replays. That is
   the white flash and the second "Welcome back".
3. **Splash identity arrives mid-flight.** Play #1 rendered `Welcome back.`
   (2 words, `TA` fallback initials); once the profile landed the headline became
   `Welcome back, Leul.` (3 words) — a new word animates in and the avatar swaps.
4. **Competing session writes.** Closing the Google popup fires `focus` *and*
   `onAuthStateChanged`; `PholioAuthBridge` could `POST /api/login` (which
   regenerates the session id) concurrently with `LoginPage`'s own
   `POST /api/login`, while `useAuthenticatedEntryRedirect` could `navigate()` to
   the dashboard at the same moment the login handler hard-navigated.

## Plan

- [x] Hoist the splash out of the router into an `AuthEntryTransitionProvider`
      mounted above `<Suspense>` in `App.jsx` — one instance, mounted once,
      immune to route suspension and shell remounts.
- [x] Provider owns the timing state machine (min hold → data ready → crossfade
      out) and can be started imperatively, so the splash begins the moment Google
      auth resolves instead of after the round-trip.
- [x] Freeze splash identity: prime name/avatar from the Firebase user at start;
      lock it shortly after so a late profile fetch can never rewrite the headline.
- [x] Replace the post-login hard navigation with client-side `navigate()` for
      SPA destinations (`window.location` retained for non-SPA targets).
- [x] Add an explicit-auth latch so `PholioAuthBridge` and
      `useAuthenticatedEntryRedirect` stand down while a login is in flight.
- [x] ~~Prefetch the talent dashboard chunk from the login page~~ — **reverted**,
      see "Rejected" below.
- [x] Delete the now-unused `useAuthEntryTransition` hook.

## Rejected: prefetching the dashboard chunk from the login page

Warming `import('.../OverviewPage')` from a `useEffect` on the login page pulls
the dashboard's module graph into the login page at runtime. In dev, Vite then
discovers a new dependency (`react-dropzone`), re-optimizes, and force-reloads
the page:

```
[vite] ✨ new dependencies optimized: react-dropzone
[vite] ✨ optimized dependencies changed. reloading
```

That is an abrupt refresh on the login screen — the exact class of bug being
fixed — and mid-swap the module graph is torn, which surfaces as
`TypeError: can't access property "useContext", dispatcher is null`.

It also wasn't needed. With the splash above the Suspense boundary the route
fallback resolves *underneath* an opaque overlay, so the chunk fetch is already
invisible. Removed, and the reasoning left as a comment at the call site so it
does not get re-added.

## Review

### Measured, post-fix (headless Chrome against a seeded local DB)

```
  198ms  /login             | splash:talent | routeFallback:no
  255ms  -> /dashboard/talent (history API, same document)
  274ms  /dashboard/talent  | splash:talent | routeFallback:YES   <- hidden under splash
  512ms  /dashboard/talent  | splash:talent | routeFallback:no
 2842ms  /dashboard/talent  | splash:none                          <- crossfade complete

js context survived : YES - no document load
navigation entries  : 1  ['/login']
```

- **One** navigation entry for the whole sign-in; the JS context tag set before
  submit is still present on the dashboard, so the SPA was never torn down.
- **One** splash play, continuously mounted, never replaced by the fallback.
- Splash raised at 198ms — before the backend answered — so the round-trip is
  no longer visible as a spinner in the button.
- ~2.8s door-to-door, against ~8.4s in the reported recording.

### Adjacent paths checked

| scenario | result |
|---|---|
| agency sign-in | cream agency splash, once; canvas corrects from the server's redirect |
| direct dashboard load with an existing session | no splash (it is a sign-in transition, not a page loader) |
| failed sign-in | no stranded splash, form usable, error surfaced |
| sitting on /login for 12s | no forced reload, no page errors |

`npm run build`, eslint on all touched files, and the AgencySessionGate /
LegalAcceptanceGate suites all pass.

### Known limitation

The splash freezes identity ~260ms after it starts, so a name that only arrives
with the profile fetch is not shown. On the Google/Instagram paths the name and
photo are primed from the provider identity, so the headline reads
"Welcome back, <name>." from the first frame. On a bare email sign-in with no
Firebase `displayName` it stays "Welcome back." for the whole beat. That is the
intended trade: a stable headline beats a late-inserted word.
