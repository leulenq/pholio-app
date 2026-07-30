# Frame Audience Segmented Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish Frame Editor Publishing audience controls as Profile-style Hidden/Shown segmented toggles.

**Architecture:** Local FrameEditor JSX + CSS only. Reuse `PholioToggleGroup` / `PholioToggleButton` with `fe-unit-toggle` overrides (same pattern as Profile `unitToggle` / `toggleBtn`). No API changes.

**Tech Stack:** React, existing Pholio button toggle primitives, FrameEditor.css

---

### Task 1: Labels + cleanup

**Files:**
- Modify: `client/src/domains/talent/components/FrameEditor.jsx`
- Modify: `client/src/domains/talent/components/FrameEditor.css`

**Steps:**
1. Change segment labels from Off/On to Hidden/Shown (Hidden left = exclude true, Shown right = exclude false).
2. Add `tone="dark"` on both audience toggle groups.
3. Remove unused `PholioToggle` import.
4. Restyle `.fe-unit-toggle` / `.fe-unit-toggle__btn` to mirror Profile’s rendered editorial tabs on the dark surface (tracked uppercase labels, transparent container, gold active underline).
5. Remove dead `.fe-switch` / reduced-motion `.fe-audience__toggle` rules if unused.
6. Visual check: Publishing section shows two Metric/Imperial-style tracks with Hidden | Shown.
7. Commit only if user requests.
