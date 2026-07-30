# Production Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve detailed local React diagnostics, render only a safe production fallback, and deliver complete production React failures to Sentry.

**Architecture:** A focused `error-monitoring` adapter owns Sentry initialization, privacy filtering, React root handlers, and boundary reporting. The existing custom class boundary remains responsible for fallback UI and recovery. React 19 root callbacks cover failures outside that boundary without double-reporting caught errors.

**Tech Stack:** React 19, Vite 7, Vitest 4, Testing Library, `@sentry/react`, `@sentry/vite-plugin`

## Global Constraints

- Never render raw exception messages, JavaScript stacks, React component stacks, component names, or file paths in production.
- Keep development-only diagnostics visible.
- Production fallback copy is: “Something went wrong” and “We couldn't display this page. Try again, or reload the page.”
- Production actions remain “Try again” and “Reload page.”
- Sentry default PII collection remains disabled; do not enable replay or tracing.
- Strip query strings and URL fragments and redact `/reply/:token` before sending monitoring URLs.
- Do not overwrite the user's existing uncommitted changes in `client/src/main.jsx` or other files.
- Do not create a git commit unless the user explicitly requests one.

---

### Task 1: Add the Sentry monitoring adapter with privacy tests

**Files:**
- Create: `client/src/shared/lib/error-monitoring.js`
- Create: `client/src/shared/lib/__tests__/error-monitoring.test.js`
- Modify: `client/package.json`
- Modify: `client/package-lock.json`

**Interfaces:**
- Produces: `sanitizeMonitoringUrl(value: unknown): unknown`
- Produces: `initErrorMonitoring(): boolean`
- Produces: `reportReactError(error: unknown, errorInfo: { componentStack?: string }, context?: { boundary?: string }): string | undefined`
- Produces: `getReactRootErrorHandlers(): { onUncaughtError?: Function, onRecoverableError?: Function }`

- [ ] **Step 1: Install current Sentry packages**

Run from `client/`:

```bash
npm install @sentry/react
npm install --save-dev @sentry/vite-plugin
```

Expected: both package manifests update to versions resolved by npm; no hand-authored version numbers.

- [ ] **Step 2: Write failing adapter tests**

Mock `@sentry/react` before importing the adapter. Tests must assert:

```js
expect(sanitizeMonitoringUrl(
  'https://app.pholio.studio/reply/secret-token?next=/dashboard#message',
)).toBe('https://app.pholio.studio/reply/[redacted]');

expect(initErrorMonitoring()).toBe(false); // DEV or missing DSN
expect(Sentry.init).not.toHaveBeenCalled();

expect(initErrorMonitoring()).toBe(true); // PROD + DSN
expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({
  dsn: 'https://public@example.ingest.sentry.io/1',
  sendDefaultPii: false,
}));

expect(Sentry.captureReactException).toHaveBeenCalledWith(error, errorInfo);
expect(scope.setTag).toHaveBeenCalledWith('error.boundary', 'app-root');
expect(scope.setContext).toHaveBeenCalledWith('route', {
  path: '/reply/[redacted]',
});
```

Capture the `beforeSend` and `beforeBreadcrumb` callbacks passed to `Sentry.init`
and invoke them directly to prove request/breadcrumb URLs are sanitized.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
npm test -- --run src/shared/lib/__tests__/error-monitoring.test.js
```

Expected: FAIL because `../error-monitoring` does not exist.

- [ ] **Step 4: Implement the adapter**

Implement module-level initialization state. `initErrorMonitoring` must return
`false` unless `import.meta.env.PROD` and `VITE_SENTRY_DSN` are both truthy. Its
`Sentry.init` options must include:

```js
{
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'production',
  release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
  sendDefaultPii: false,
  beforeSend: sanitizeEvent,
  beforeBreadcrumb: sanitizeBreadcrumb,
}
```

`reportReactError` must use `console.error` only when `import.meta.env.DEV`.
In initialized production it must use `Sentry.withScope`, set the sanitized
pathname and boundary tag, and call `Sentry.captureReactException(error,
errorInfo)`. `getReactRootErrorHandlers` returns an empty object before
initialization; afterward it returns only `onUncaughtError` and
`onRecoverableError` from `Sentry.reactErrorHandler()`.

- [ ] **Step 5: Run the adapter tests and verify GREEN**

Run:

```bash
npm test -- --run src/shared/lib/__tests__/error-monitoring.test.js
```

Expected: PASS with no unhandled console output.

### Task 2: Lock down the shared ErrorBoundary with production regression tests

**Files:**
- Create: `client/src/shared/components/__tests__/ErrorBoundary.test.jsx`
- Modify: `client/src/shared/components/ErrorBoundary.jsx`

**Interfaces:**
- Consumes: `reportReactError(error, errorInfo, { boundary })`
- Preserves: `<ErrorBoundary boundary="app-root">children</ErrorBoundary>`

- [ ] **Step 1: Write failing production-safety tests**

Mock `../../lib/error-monitoring`. Use a child that throws:

```jsx
const technicalError = new Error(
  'DATABASE_SETUP_REQUIRED at InternalWidget (/Users/private/src/InternalWidget.jsx:42)',
);

function BrokenChild() {
  throw technicalError;
}
```

With `vi.stubEnv('DEV', false)`, assert the friendly title/body/actions exist,
and `screen.queryByText(/DATABASE_SETUP_REQUIRED|InternalWidget|Users\/private/)`
is null. Assert `reportReactError` receives the original `technicalError`, an
object containing `componentStack`, and `{ boundary: 'app-root' }`.

With `vi.stubEnv('DEV', true)`, assert the technical message and Error details
summary are visible. Reset stubs and console spies after each test.

- [ ] **Step 2: Run the boundary tests and verify RED**

Run:

```bash
npm test -- --run src/shared/components/__tests__/ErrorBoundary.test.jsx
```

Expected: FAIL because the boundary still calls `console.error`, does not call
the monitoring adapter, and renders the old body copy.

- [ ] **Step 3: Implement the minimal boundary change**

Import `reportReactError`, replace the direct `console.error` call with:

```js
reportReactError(error, errorInfo, {
  boundary: this.props.boundary || 'shared',
});
```

Remove the unused `eyebrow` prop and replace the body with the approved safe
copy. Keep the existing `import.meta.env.DEV` guards around `supportingMeta`
and the details panel unchanged.

- [ ] **Step 4: Run boundary and adapter tests**

Run:

```bash
npm test -- --run \
  src/shared/components/__tests__/ErrorBoundary.test.jsx \
  src/shared/lib/__tests__/error-monitoring.test.js
```

Expected: both files PASS.

### Task 3: Initialize Sentry and cover root-level React failures

**Files:**
- Modify: `client/src/main.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `initErrorMonitoring()` and `getReactRootErrorHandlers()`
- Preserves: the current provider and auth-transition nesting in `main.jsx`

- [ ] **Step 1: Initialize before root creation**

Add imports from `./shared/lib/error-monitoring`, call
`initErrorMonitoring()` before `createRoot`, and pass
`getReactRootErrorHandlers()` as the second `createRoot` argument. Do not move
or reorder any provider, `<App />`, or `<PholioToaster />`.

- [ ] **Step 2: Label the root boundary**

Change the root mount in `App.jsx` to:

```jsx
<ErrorBoundary boundary="app-root">
```

The three nested agency boundaries may use the default `shared` label; no
unrelated page edits are required.

- [ ] **Step 3: Run focused tests and lint**

Run:

```bash
npm test -- --run \
  src/shared/components/__tests__/ErrorBoundary.test.jsx \
  src/shared/lib/__tests__/error-monitoring.test.js
npx eslint \
  src/main.jsx \
  src/App.jsx \
  src/shared/components/ErrorBoundary.jsx \
  src/shared/components/__tests__/ErrorBoundary.test.jsx \
  src/shared/lib/error-monitoring.js \
  src/shared/lib/__tests__/error-monitoring.test.js
```

Expected: tests PASS and ESLint exits 0.

### Task 4: Configure private production source-map uploads

**Files:**
- Modify: `client/vite.config.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes build-only `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`
- Consumes runtime `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, and `VITE_SENTRY_RELEASE`

- [ ] **Step 1: Configure the optional Vite plugin**

Import `loadEnv` and `sentryVitePlugin`. In `defineConfig({ command, mode })`,
load process environment values and compute `hasSentryUpload` only when the
command is `build` and all three build credentials exist. Append the Sentry
plugin after `react()` only when configured.

Set `build.sourcemap` to `'hidden'` only when upload is configured. Configure:

```js
sourcemaps: {
  filesToDeleteAfterUpload: '../public/dashboard-app/**/*.map',
}
```

Do not expose `SENTRY_AUTH_TOKEN` through `define` or a `VITE_` prefix.

- [ ] **Step 2: Document exact environment variables**

Add a Sentry section to `.env.example` distinguishing browser-safe
`VITE_SENTRY_*` values from build-secret `SENTRY_AUTH_TOKEN`. State that the
three upload credentials are optional locally but required in production CI
for readable source-mapped stacks.

- [ ] **Step 3: Verify an unconfigured local production build**

Run from the repository root:

```bash
npm run client:build
```

Expected: Vite exits 0 without trying to upload source maps when Sentry build
credentials are absent.

### Task 5: Final security and regression verification

**Files:**
- Modify: `tasks/todo.md`

- [ ] **Step 1: Run focused tests and changed-file lint again**

Use the exact commands from Task 3. Expected: all focused tests PASS and lint
exits 0.

- [ ] **Step 2: Verify production bundle disclosure**

Build with no Sentry credentials, then search generated assets:

```bash
rg "Error details|DATABASE_SETUP_REQUIRED|InternalWidget|/Users/private" \
  ../public/dashboard-app/assets
```

Run from `client/`. Expected: no matches. The friendly fallback copy may remain.

- [ ] **Step 3: Review the final diff without touching unrelated changes**

Run:

```bash
git diff -- \
  .env.example \
  client/package.json \
  client/package-lock.json \
  client/vite.config.js \
  client/src/main.jsx \
  client/src/App.jsx \
  client/src/shared/components/ErrorBoundary.jsx \
  client/src/shared/components/__tests__/ErrorBoundary.test.jsx \
  client/src/shared/lib/error-monitoring.js \
  client/src/shared/lib/__tests__/error-monitoring.test.js \
  docs/superpowers/specs/2026-07-29-production-error-handling-design.md \
  docs/superpowers/plans/2026-07-29-production-error-handling.md \
  tasks/todo.md
```

Expected: only the approved error-handling work appears in these paths; the
existing provider structure and unrelated user changes remain intact.

- [ ] **Step 4: Record review evidence**

Append a review section to `tasks/todo.md` with the audit verdict, changed
files, exact passing test/lint/build commands, and the remaining deployment
requirement to configure the Sentry DSN, organization, project, auth token,
environment, and release values.
