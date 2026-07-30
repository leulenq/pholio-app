# Attached Message Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the application message dock remain fixed during page scroll and attach flush to the viewport’s bottom-right corner.

**Architecture:** Render `MessageDock` through a React portal into `document.body` so the transformed applications container cannot capture its fixed positioning. Give the portaled dock its own application tokens and use an attached-edge desktop treatment; retain the existing full-width mobile bottom sheet.

**Tech Stack:** React 19, React DOM portal, CSS, Puppeteer browser verification.

## Global Constraints

- Do not use `PholioButton` inside the message dock.
- Desktop placement is flush to `right: 0` and `bottom: 0`.
- The dock must not move when the document scrolls.
- Motion communicates the dock opening from the lower-right and must have a reduced-motion fallback.

---

### Task 1: Escape the transformed page container

**Files:**
- Modify: `client/src/domains/talent/components/ApplicationsView.jsx`
- Test: `scripts/tmp-test-message-dock-position.mjs` (temporary verification script)

**Interfaces:**
- Consumes: `MessageDock({ app, onClose })`
- Produces: The same dialog and scrim rendered as direct children of `document.body`

- [x] **Step 1: Write the failing browser test**

Assert that `.app-msgdock` is parented by `document.body`, has zero right and bottom viewport gaps, and keeps the same viewport rectangle after document scroll.

- [x] **Step 2: Run the browser test to verify it fails**

Run: `node scripts/tmp-test-message-dock-position.mjs`

Expected: FAIL because the dock is nested under the transformed applications surface and is inset from the viewport edges.

- [x] **Step 3: Portal the dock**

Import `createPortal` from `react-dom` and return:

```jsx
return createPortal(
  <>
    <div className="app-msgdock__scrim" aria-hidden="true" onClick={onClose} />
    <aside className="app-msgdock" role="dialog">…</aside>
  </>,
  document.body,
);
```

### Task 2: Attach and verify the dock

**Files:**
- Modify: `client/src/domains/talent/components/ApplicationsView.css`
- Test: `scripts/tmp-test-message-dock-position.mjs` (temporary verification script)

**Interfaces:**
- Consumes: `.app-msgdock`, existing `--app-*` variables
- Produces: A self-tokened fixed panel attached to the bottom-right viewport edges

- [x] **Step 1: Add local dock tokens and attached positioning**

Set `right: 0`, `bottom: 0`, remove right/bottom borders, use only a top-left radius, replace the floating shadow, and animate from a small lower-right translation.

- [x] **Step 2: Add reduced-motion behavior**

Disable the dock entrance animation under `prefers-reduced-motion: reduce`.

- [x] **Step 3: Run verification**

Run the browser position test, focused ESLint, and the client build. Expected: all pass.

- [x] **Step 4: Remove the temporary browser test**

Delete `scripts/tmp-test-message-dock-position.mjs` after verification.
