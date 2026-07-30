# Production Error Handling Design

## Objective

React failures must produce a useful development diagnostic and a safe production
experience. Production users receive only stable recovery copy and actions. Full
technical details are sent to Sentry and are never rendered into the production UI.

## Current State

The SPA has one shared class-based `ErrorBoundary`, mounted at the app root and
around three agency page regions. Its production fallback is already sanitized:
the raw exception string and React component stack are gated by
`import.meta.env.DEV`. The fallback offers Try again and Reload page.

The production observability path is incomplete. `componentDidCatch` writes the
exception and `errorInfo` only to the browser console. No client monitoring SDK or
reporting endpoint receives the JavaScript stack, React component stack, route, or
runtime context. Errors above the app-level boundary can also escape its fallback.

## Design

### Monitoring initialization

Add the current `@sentry/react` SDK and initialize it before the React root renders.
Initialization is enabled only for production when `VITE_SENTRY_DSN` is configured.
The Sentry environment and release are read from explicit Vite environment values
when available, with safe production defaults.

Default PII collection remains disabled. Error monitoring is the scope; tracing,
session replay, and user-content capture are not enabled.

React 19 root callbacks report uncaught and recoverable root errors. Caught boundary
errors are not also reported by the root callback, preventing duplicate events.

### Error boundary reporting

Keep the existing custom boundary and shared fallback. In `componentDidCatch`:

- Development logs the original error and React error info to the console.
- Production calls Sentry's `captureReactException(error, errorInfo)` so the
  JavaScript stack and linked React component stack are preserved.
- The event receives a sanitized route and a boundary context label.
- A missing or invalid DSN must not create a second user-facing failure.

The boundary will no longer write full exception details to the production browser
console.

### User-facing fallback

Production renders only:

- Title: “Something went wrong”
- Body: “We couldn't display this page. Try again, or reload the page.”
- Primary action: “Try again,” which resets the boundary
- Secondary action: “Reload page,” which reloads the document

The existing development-only exception string and details panel remain available
for local diagnosis. The unused `eyebrow` prop is removed. No exception message,
stack, component stack, component name, source path, Sentry event identifier, or
other technical metadata is rendered in production.

The previous “Your data is safe” claim is removed because an unknown render failure
cannot prove that unsaved client state was persisted.

### Privacy and URL sanitization

Monitoring records the browser/runtime metadata Sentry normally needs to diagnose
an exception, but does not opt into default PII.

Before an event or breadcrumb is sent:

- Query strings and URL fragments are removed.
- Magic-link values in `/reply/:token` paths are replaced with a redacted segment.
- Raw application state, form values, authentication tokens, cookies, and request
  bodies are not attached.

### Source maps

Add the Sentry Vite plugin after the React plugin. It uploads production source maps
only when the required Sentry organization, project, and auth-token environment
values are present. Source maps are deleted from emitted client assets after a
successful configured upload so they are not publicly served.

Local builds and builds without Sentry upload credentials remain deterministic and
do not attempt a network upload.

## Verification

Add focused Vitest coverage that:

1. Forces `DEV=false`, throws a distinctive exception containing a component name
   and file path, and proves none of those details render.
2. Proves the production fallback copy and both recovery actions render and work.
3. Proves the full original exception and React component stack are handed to the
   monitoring adapter.
4. Forces `DEV=true` and proves local diagnostic details remain visible.
5. Proves URL sanitization removes query/hash values and redacts reply tokens.
6. Proves monitoring initialization/reporting degrades safely when no DSN exists.

Run the focused Vitest suite, lint only the changed client files, and run the
production client build. Inspect the generated bundle to confirm development-only
fallback text and the synthetic test exception are absent.

## Scope

This change covers React render failures and root-level React 19 error reporting.
It does not redesign ordinary API validation/error messages, add session replay or
performance tracing, or change Express error responses.
