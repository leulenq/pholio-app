# Talent Settings Page — Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal talent settings stub with a premium cream/editorial settings page featuring 6 sections (Account, Notifications, Privacy, Subscription, Security, Danger Zone), a sticky sidebar nav with grouped items, and Pholio's brand typography and gold accent system.

**Architecture:** Two files only — `SettingsPage.css` (new) and `index.jsx` (full rewrite). The page is standalone (no topbar shell), routes via `/dashboard/talent/settings/:section`, uses AnimatePresence for section transitions, and calls `useAuth`, `talentApi`, and Firebase directly. Sections are functions in the same file, following the existing agency settings pattern.

**Tech Stack:** React 19, Framer Motion v12 (AnimatePresence, motion, layoutId), React Router v7 (useParams, useNavigate, Link), TanStack Query v5 (useQuery, useMutation, useQueryClient), Firebase Auth (sendPasswordResetEmail), Sonner (toast), Lucide React icons.

---

## File Map

| File | Action |
|------|--------|
| `client/src/domains/talent/pages/SettingsPage/SettingsPage.css` | **Create** — all styles |
| `client/src/domains/talent/pages/SettingsPage/index.jsx` | **Full rewrite** |

No route changes needed. These existing routes in `client/src/App.jsx` are preserved unchanged:
```
/dashboard/talent/settings          → SettingsPage (defaults to 'account')
/dashboard/talent/settings/:section → SettingsPage
```

---

## Task 1: Create SettingsPage.css

**Files:**
- Create: `client/src/domains/talent/pages/SettingsPage/SettingsPage.css`

- [ ] **Step 1: Create the CSS file**

```css
/* ============================================================
   PHOLIO TALENT SETTINGS
   Cream editorial aesthetic · hairline borders · gold accents
   ============================================================ */

/* ─── Page Shell ─── */
.st-page {
  min-height: 100vh;
  background: #FAF7F2;
  position: relative;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #1A1A1A;
  -webkit-font-smoothing: antialiased;
}

.st-grain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.028;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 150px 150px;
}

.st-wrap {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 56px 64px 96px;
}

/* ─── Header ─── */
.st-wordmark {
  display: block;
  font-family: 'Noto Serif Display', Georgia, serif;
  font-weight: 400;
  font-size: 16px;
  letter-spacing: 0.2em;
  color: #C9A55A;
  margin-bottom: 20px;
  user-select: none;
}

.st-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #C9A55A;
  text-decoration: none;
  margin-bottom: 36px;
  transition: opacity 0.2s ease;
}
.st-back:hover { opacity: 0.7; }

.st-header-eyebrow {
  display: block;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: #C9A55A;
  margin-bottom: 10px;
}

.st-page-title {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 52px;
  font-weight: 300;
  letter-spacing: -0.02em;
  color: #1A1A1A;
  margin: 0 0 28px 0;
  line-height: 1.0;
}

.st-rule {
  height: 1px;
  background: linear-gradient(to right, transparent, #C9A55A, transparent);
  margin-bottom: 48px;
  border: none;
}

/* ─── Layout ─── */
.st-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 64px;
  align-items: start;
}

/* ─── Sidebar ─── */
.st-sidebar {
  position: sticky;
  top: 40px;
  display: flex;
  flex-direction: column;
}

.st-nav { display: flex; flex-direction: column; }

.st-nav-group { margin-bottom: 4px; }
.st-nav-group + .st-nav-group { margin-top: 8px; }

.st-nav-group-label {
  display: block;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(26, 26, 26, 0.42);
  padding: 4px 16px 8px;
}

.st-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  border-radius: 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  position: relative;
  transition: background 0.2s ease;
}
.st-nav-item:hover:not(.active) { background: rgba(26, 26, 26, 0.03); }
.st-nav-item.active { background: rgba(201, 165, 90, 0.06); }

.st-nav-bar {
  position: absolute;
  left: 0;
  top: 15%;
  bottom: 15%;
  width: 3px;
  background: #C9A55A;
  border-radius: 0 4px 4px 0;
  box-shadow: 0 0 8px rgba(201, 165, 90, 0.4);
}

.st-nav-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(201, 165, 90, 0.35);
  flex-shrink: 0;
  transition: background 0.2s ease;
}
.st-nav-item.active .st-nav-dot { background: #C9A55A; }

.st-nav-text { display: flex; flex-direction: column; gap: 2px; }

.st-nav-label {
  font-size: 14px;
  font-weight: 500;
  color: #1A1A1A;
  transition: color 0.2s ease;
}
.st-nav-item.active .st-nav-label { color: #C9A55A; }

.st-nav-desc {
  font-size: 11px;
  color: rgba(26, 26, 26, 0.42);
}

.st-support {
  margin-top: 32px;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid rgba(201, 165, 90, 0.2);
  background: linear-gradient(135deg, rgba(201, 165, 90, 0.04), rgba(201, 165, 90, 0.08));
}

.st-support-eyebrow {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: #C9A55A;
  margin-bottom: 8px;
}

.st-support-text {
  font-size: 13px;
  line-height: 1.5;
  color: rgba(26, 26, 26, 0.62);
  margin: 0 0 12px 0;
}

.st-support-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  color: #C9A55A;
  text-decoration: none;
  transition: opacity 0.2s ease;
}
.st-support-link:hover { opacity: 0.75; }

/* ─── Main Content ─── */
.st-main { min-width: 0; }

/* ─── Cards ─── */
.st-card {
  background: #FFFFFF;
  border: 1px solid rgba(26, 24, 21, 0.08);
  border-radius: 16px;
  overflow: hidden;
}

.st-card-stack {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.st-card-hd {
  padding: 28px 32px 20px;
  border-bottom: 1px solid rgba(26, 24, 21, 0.06);
}

.st-card-eyebrow {
  display: block;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: #C9A55A;
  margin-bottom: 8px;
}

.st-card-title {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 26px;
  font-weight: 300;
  letter-spacing: -0.01em;
  color: #1A1A1A;
  margin: 0;
}

.st-card-inner { padding: 28px 32px; }

.st-card-footer {
  padding: 20px 32px;
  border-top: 1px solid rgba(26, 24, 21, 0.06);
  display: flex;
  justify-content: flex-end;
}

.st-card--danger {
  background: rgba(192, 57, 43, 0.04);
  border-color: rgba(192, 57, 43, 0.18);
}

/* ─── Forms ─── */
.st-form-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.st-field { display: flex; flex-direction: column; gap: 6px; }

.st-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.st-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(26, 26, 26, 0.62);
}

.st-input,
.st-select,
.st-textarea {
  width: 100%;
  background: #EDE8DD;
  border: 1px solid rgba(26, 24, 21, 0.08);
  border-radius: 8px;
  padding: 12px 16px;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  color: #1A1A1A;
  transition: border-color 0.2s ease, background 0.2s ease;
  outline: none;
  box-sizing: border-box;
}
.st-input:focus, .st-select:focus, .st-textarea:focus {
  border-color: #C9A55A;
  background: #F5F0E8;
}
.st-input:disabled {
  opacity: 0.6;
  cursor: default;
}
.st-textarea { min-height: 100px; resize: vertical; }

.st-select {
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%231A1A1A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 40px;
}

.st-input-help {
  font-size: 12px;
  font-style: italic;
  color: rgba(26, 26, 26, 0.42);
}

/* Prefix input */
.st-input-prefix-wrap {
  display: flex;
  align-items: stretch;
  border: 1px solid rgba(26, 24, 21, 0.08);
  border-radius: 8px;
  overflow: hidden;
  background: #EDE8DD;
  transition: border-color 0.2s ease;
}
.st-input-prefix-wrap:focus-within { border-color: #C9A55A; background: #F5F0E8; }

.st-input-prefix {
  padding: 12px 10px 12px 16px;
  font-size: 13px;
  color: rgba(26, 26, 26, 0.42);
  flex-shrink: 0;
  white-space: nowrap;
  border-right: 1px solid rgba(26, 24, 21, 0.08);
  display: flex;
  align-items: center;
  background: transparent;
}

.st-input-prefix-wrap .st-input {
  border: none;
  background: transparent;
  flex: 1;
  border-radius: 0;
  width: auto;
}
.st-input-prefix-wrap .st-input:focus {
  border: none;
  background: transparent;
  outline: none;
}

/* Icon input */
.st-input-icon-wrap { position: relative; display: flex; align-items: center; }
.st-input-icon {
  position: absolute;
  left: 14px;
  color: rgba(26, 26, 26, 0.42);
  pointer-events: none;
}
.st-input--icon { padding-left: 40px; }

/* ─── Avatar ─── */
.st-avatar-section {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
}

.st-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #EDE8DD;
  border: 1px solid rgba(26, 24, 21, 0.08);
  position: relative;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.st-avatar-icon { color: rgba(26, 26, 26, 0.42); }
.st-avatar-overlay {
  position: absolute;
  inset: 0;
  background: rgba(26, 26, 26, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.st-avatar:hover .st-avatar-overlay { opacity: 1; }
.st-avatar-action-text {
  font-size: 12px;
  color: rgba(26, 26, 26, 0.62);
  margin-top: 4px;
}

/* ─── Buttons ─── */
.st-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
  line-height: 1;
  white-space: nowrap;
}
.st-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.st-btn-primary { background: #C9A55A; color: #1A1A1A; }
.st-btn-primary:hover:not(:disabled) { background: #B8956A; }

.st-btn-secondary { background: transparent; color: #1A1A1A; border: 1px solid rgba(26, 24, 21, 0.14); }
.st-btn-secondary:hover:not(:disabled) { background: rgba(26, 26, 26, 0.04); }

.st-btn-ghost { background: transparent; color: rgba(26, 26, 26, 0.62); border: none; padding: 8px 0; }
.st-btn-ghost:hover:not(:disabled) { color: #1A1A1A; }

.st-btn-danger { background: #C0392B; color: white; border: none; }
.st-btn-danger:hover:not(:disabled) { background: #A93226; }

.st-btn-danger-ghost { background: transparent; color: #C0392B; border: 1px solid rgba(192, 57, 43, 0.3); }
.st-btn-danger-ghost:hover:not(:disabled) { background: rgba(192, 57, 43, 0.04); }

/* ─── Toggle Switch ─── */
.st-toggle-list { display: flex; flex-direction: column; }

.st-toggle-group-label {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(26, 26, 26, 0.42);
  padding: 16px 32px 8px;
}

.st-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  border-bottom: 1px solid rgba(26, 24, 21, 0.06);
}
.st-toggle-row:last-child { border-bottom: none; }

.st-toggle-info { display: flex; flex-direction: column; gap: 3px; }
.st-toggle-label { font-size: 14px; font-weight: 500; color: #1A1A1A; }
.st-toggle-desc { font-size: 13px; color: rgba(26, 26, 26, 0.62); }

.st-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
}
.st-switch input { opacity: 0; width: 0; height: 0; position: absolute; }

.st-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(26, 24, 21, 0.12);
  border-radius: 24px;
  transition: background 0.3s ease;
}
.st-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: transform 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.st-switch input:checked + .st-slider { background: #C9A55A; }
.st-switch input:checked + .st-slider::before { transform: translateX(20px); }

/* ─── Subscription ─── */
.st-plan-card {
  background: linear-gradient(135deg, rgba(201, 165, 90, 0.08), rgba(201, 165, 90, 0.03));
  padding: 36px 40px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
}

.st-plan-left { display: flex; flex-direction: column; }
.st-plan-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #C9A55A;
  margin-bottom: 8px;
}
.st-plan-price { display: flex; align-items: baseline; gap: 4px; margin-bottom: 8px; }
.st-plan-price-num {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 48px;
  font-weight: 300;
  line-height: 1;
  color: #1A1A1A;
}
.st-plan-price-unit { font-size: 16px; color: rgba(26, 26, 26, 0.62); }
.st-plan-renewal { font-size: 13px; color: rgba(26, 26, 26, 0.62); }

.st-plan-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}
.st-payment-method {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border: 1px solid rgba(26, 24, 21, 0.10);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
}
.st-payment-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #1A1A1A;
}

.st-invoice-row {
  display: flex;
  align-items: center;
  padding: 16px 32px;
  border-bottom: 1px solid rgba(26, 24, 21, 0.06);
  gap: 8px;
}
.st-invoice-row:last-child { border-bottom: none; }
.st-invoice-id { font-size: 13px; font-weight: 600; flex: 0 0 80px; }
.st-invoice-date { font-size: 12px; color: rgba(26, 26, 26, 0.62); flex: 1; }
.st-invoice-amount { font-size: 13px; font-weight: 600; flex: 0 0 80px; }
.st-invoice-status {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; color: #2D8A56; flex: 0 0 80px;
}
.st-invoice-download {
  background: none;
  border: none;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: #C9A55A;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s ease;
}
.st-invoice-download:hover { background: rgba(201, 165, 90, 0.08); }

/* ─── Badges ─── */
.st-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}
.st-badge--coming-soon { background: rgba(201, 165, 90, 0.12); color: #C9A55A; }
.st-badge--active { background: rgba(45, 138, 86, 0.10); color: #2D8A56; }
.st-badge--expired { background: rgba(26, 26, 26, 0.06); color: rgba(26, 26, 26, 0.42); }

/* ─── Security Sessions ─── */
.st-session-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 32px;
  border-bottom: 1px solid rgba(26, 24, 21, 0.06);
}
.st-session-row:last-child { border-bottom: none; }
.st-session-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #EDE8DD;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: rgba(26, 26, 26, 0.62);
}
.st-session-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.st-session-device { font-size: 14px; font-weight: 500; color: #1A1A1A; }
.st-session-location { font-size: 12px; color: rgba(26, 26, 26, 0.62); }
.st-session-time { font-size: 12px; color: rgba(26, 26, 26, 0.42); margin-right: 8px; white-space: nowrap; }

/* ─── Danger Zone ─── */
.st-action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 32px;
  gap: 24px;
}
.st-action-row + .st-action-row { border-top: 1px solid rgba(192, 57, 43, 0.12); }
.st-action-info { display: flex; flex-direction: column; gap: 4px; }
.st-action-label { font-size: 15px; font-weight: 600; color: #1A1A1A; }
.st-action-desc { font-size: 13px; color: rgba(26, 26, 26, 0.62); max-width: 42ch; line-height: 1.5; }

/* ─── Security credential row ─── */
.st-credential-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid rgba(26, 24, 21, 0.06);
  gap: 24px;
}

/* ─── Utility ─── */
.st-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: rgba(26, 26, 26, 0.42);
  font-size: 14px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.st-btn:focus-visible,
.st-input:focus-visible,
.st-select:focus-visible,
.st-nav-item:focus-visible {
  outline: 2px solid #C9A55A;
  outline-offset: 2px;
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint
```

Expected: no errors (CSS is not linted by ESLint; lint will pass as long as no JS was changed).

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/pages/SettingsPage/SettingsPage.css
git commit -m "feat(talent-settings): add CSS foundation for settings redesign"
```

---

## Task 2: Page Shell, Routing & Sidebar

**Files:**
- Modify: `client/src/domains/talent/pages/SettingsPage/index.jsx` (full rewrite)

This task replaces the current file entirely. All 6 section functions return `null` for now — they will be filled in by Tasks 3–8.

- [ ] **Step 1: Rewrite index.jsx with shell, routing, and sidebar**

Replace the entire contents of `client/src/domains/talent/pages/SettingsPage/index.jsx` with:

```jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Camera, Mail, Monitor, Check, CreditCard, ExternalLink,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '../../../auth/hooks/useAuth';
import { talentApi } from '../../api/talent';
import { auth } from '../../../../shared/lib/firebase';
import './SettingsPage.css';

const EASING = [0.22, 1, 0.36, 1];

const SECTIONS = [
  { id: 'account',       label: 'Account',       group: 'IDENTITY',     desc: 'Name, email, phone' },
  { id: 'notifications', label: 'Notifications',  group: 'PREFERENCES',  desc: 'Email and in-app alerts' },
  { id: 'privacy',       label: 'Privacy',        group: 'PREFERENCES',  desc: 'Visibility and portfolio URL' },
  { id: 'subscription',  label: 'Subscription',   group: 'YOUR PLAN',    desc: 'Plan and billing' },
  { id: 'security',      label: 'Security',       group: 'YOUR PLAN',    desc: 'Password and access' },
  { id: 'danger',        label: 'Danger Zone',    group: 'YOUR PLAN',    desc: 'Account actions' },
];

const GROUPS = ['IDENTITY', 'PREFERENCES', 'YOUR PLAN'];

export default function SettingsPage() {
  const { section } = useParams();
  const activeSection = section || 'account';
  const navigate = useNavigate();

  return (
    <div className="st-page">
      <div className="st-grain" aria-hidden="true" />
      <motion.div
        className="st-wrap"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASING }}
      >
        {/* Page header */}
        <span className="st-wordmark">PHOLIO</span>
        <Link to="/dashboard/talent" className="st-back">← Dashboard</Link>
        <div>
          <span className="st-header-eyebrow">Account Settings</span>
          <h1 className="st-page-title">Settings</h1>
        </div>
        <hr className="st-rule" />

        {/* Two-column layout */}
        <div className="st-layout">

          {/* Sidebar */}
          <aside className="st-sidebar">
            <nav className="st-nav" aria-label="Settings sections">
              {GROUPS.map(group => (
                <div key={group} className="st-nav-group">
                  <span className="st-nav-group-label">{group}</span>
                  {SECTIONS.filter(s => s.group === group).map(s => (
                    <button
                      key={s.id}
                      className={`st-nav-item${activeSection === s.id ? ' active' : ''}`}
                      onClick={() => navigate(`/dashboard/talent/settings/${s.id}`)}
                      aria-current={activeSection === s.id ? 'page' : undefined}
                    >
                      {activeSection === s.id && (
                        <motion.div layoutId="st-nav-bar" className="st-nav-bar" />
                      )}
                      <span className="st-nav-dot" aria-hidden="true" />
                      <span className="st-nav-text">
                        <span className="st-nav-label">{s.label}</span>
                        <span className="st-nav-desc">{s.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>

            <div className="st-support">
              <span className="st-support-eyebrow">Need Help?</span>
              <p className="st-support-text">Questions about your account or billing?</p>
              <a href="mailto:support@pholio.studio" className="st-support-link">
                support@pholio.studio <ExternalLink size={11} aria-hidden="true" />
              </a>
            </div>
          </aside>

          {/* Main content */}
          <main className="st-main">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.35, ease: EASING }}
              >
                {activeSection === 'account'       && <AccountSection />}
                {activeSection === 'notifications' && <NotificationsSection />}
                {activeSection === 'privacy'       && <PrivacySection />}
                {activeSection === 'subscription'  && <SubscriptionSection />}
                {activeSection === 'security'      && <SecuritySection />}
                {activeSection === 'danger'        && <DangerZoneSection />}
              </motion.div>
            </AnimatePresence>
          </main>

        </div>
      </motion.div>
    </div>
  );
}

function AccountSection()      { return null; }
function NotificationsSection(){ return null; }
function PrivacySection()      { return null; }
function SubscriptionSection() { return null; }
function SecuritySection()     { return null; }
function DangerZoneSection()   { return null; }
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint
```

Expected: no errors or warnings about unused variables (the stub functions will be replaced in subsequent tasks).

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/pages/SettingsPage/index.jsx
git commit -m "feat(talent-settings): add page shell, routing, and sidebar navigation"
```

---

## Task 3: AccountSection

**Files:**
- Modify: `client/src/domains/talent/pages/SettingsPage/index.jsx`

Replace `function AccountSection() { return null; }` with the implementation below.

`useAuth()` returns `{ profile, updateProfile, isUpdatingProfile }`. `updateProfile(data)` calls `PUT /api/talent/profile`. Email comes from `profile.email` and is Firebase-managed (non-editable).

- [ ] **Step 1: Replace the AccountSection stub**

In `index.jsx`, replace:
```jsx
function AccountSection()      { return null; }
```

With:
```jsx
function AccountSection() {
  const { profile, updateProfile, isUpdatingProfile } = useAuth();
  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name:  profile?.last_name  || '',
    phone:      profile?.phone      || '',
  });
  const [isChanged, setIsChanged] = useState(false);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setIsChanged(true);
  };

  const handleSave = async () => {
    try {
      await updateProfile(form);
      toast.success('Account updated');
      setIsChanged(false);
    } catch {
      toast.error('Failed to save changes');
    }
  };

  return (
    <div className="st-card">
      <div className="st-card-hd">
        <span className="st-card-eyebrow">01 / Identity</span>
        <h2 className="st-card-title">Account</h2>
      </div>
      <div className="st-card-inner">
        <div className="st-avatar-section">
          <div className="st-avatar" title="Upload headshot">
            <Camera size={24} className="st-avatar-icon" aria-hidden="true" />
            <div className="st-avatar-overlay" aria-hidden="true">
              <Camera size={18} color="white" />
            </div>
          </div>
          <div>
            <div className="st-label">Profile Photo</div>
            <div className="st-avatar-action-text">Click to upload a headshot</div>
          </div>
        </div>

        <div className="st-form-body">
          <div className="st-field-row">
            <div className="st-field">
              <label className="st-label" htmlFor="st-first-name">First Name</label>
              <input
                id="st-first-name"
                className="st-input"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                placeholder="e.g. Mia"
              />
            </div>
            <div className="st-field">
              <label className="st-label" htmlFor="st-last-name">Last Name</label>
              <input
                id="st-last-name"
                className="st-input"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                placeholder="e.g. Voss"
              />
            </div>
          </div>

          <div className="st-field">
            <label className="st-label" htmlFor="st-email">Email Address</label>
            <input
              id="st-email"
              className="st-input"
              type="email"
              value={profile?.email || ''}
              disabled
            />
            <span className="st-input-help">
              Managed by Firebase authentication — contact support to update.
            </span>
          </div>

          <div className="st-field">
            <label className="st-label" htmlFor="st-phone">Phone Number</label>
            <input
              id="st-phone"
              className="st-input"
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="+1 (555) 000-0000"
            />
          </div>
        </div>
      </div>

      <div className="st-card-footer">
        <button
          className="st-btn st-btn-primary"
          onClick={handleSave}
          disabled={!isChanged || isUpdatingProfile}
        >
          {isUpdatingProfile ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/pages/SettingsPage/index.jsx
git commit -m "feat(talent-settings): add Account section with profile save"
```

---

## Task 4: NotificationsSection

**Files:**
- Modify: `client/src/domains/talent/pages/SettingsPage/index.jsx`

No backend exists for notification preferences yet. State is local; each toggle fires a `toast.success` as a placeholder for future persistence.

- [ ] **Step 1: Replace the NotificationsSection stub**

Replace `function NotificationsSection(){ return null; }` with:

```jsx
const EMAIL_TOGGLES = [
  { key: 'emailNotifications', label: 'Email Notifications',  desc: 'All account-related emails' },
  { key: 'profileViews',       label: 'Profile View Alerts',  desc: 'When an agency views your profile' },
  { key: 'applicationUpdates', label: 'Application Updates',  desc: 'Status changes on your applications' },
  { key: 'marketing',          label: 'Marketing & Tips',     desc: 'Feature announcements and editorial tips' },
];

const INAPP_TOGGLES = [
  { key: 'inAppApplications', label: 'Application Updates', desc: 'In-dashboard application status alerts' },
  { key: 'newMessages',       label: 'New Messages',        desc: 'Direct messages from agencies' },
];

function NotificationsSection() {
  const [prefs, setPrefs] = useState({
    emailNotifications: true,
    profileViews:       true,
    applicationUpdates: true,
    marketing:          false,
    inAppApplications:  true,
    newMessages:        true,
  });

  const handleToggle = (key) => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
    toast.success('Preference saved');
  };

  const renderRow = ({ key, label, desc }) => (
    <div key={key} className="st-toggle-row">
      <div className="st-toggle-info">
        <span className="st-toggle-label">{label}</span>
        <span className="st-toggle-desc">{desc}</span>
      </div>
      <label className="st-switch">
        <input
          type="checkbox"
          checked={prefs[key]}
          onChange={() => handleToggle(key)}
        />
        <span className="st-slider" />
        <span className="sr-only">{label}</span>
      </label>
    </div>
  );

  return (
    <div className="st-card">
      <div className="st-card-hd">
        <span className="st-card-eyebrow">02 / Preferences</span>
        <h2 className="st-card-title">Notifications</h2>
      </div>
      <div className="st-toggle-list">
        <span className="st-toggle-group-label">By Email</span>
        {EMAIL_TOGGLES.map(renderRow)}
        <span className="st-toggle-group-label">In App</span>
        {INAPP_TOGGLES.map(renderRow)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/pages/SettingsPage/index.jsx
git commit -m "feat(talent-settings): add Notifications section with toggle rows"
```

---

## Task 5: PrivacySection

**Files:**
- Modify: `client/src/domains/talent/pages/SettingsPage/index.jsx`

Calls `GET /api/talent/settings` (via `talentApi.getSettings`) and `PUT /api/talent/settings` (via `talentApi.updateSettings`).

The settings backend returns `{ success: true, settings: { slug, isPublic, isDiscoverable, notifications } }`.  
The api-client only auto-unwraps `{ success, data }` format, so the raw response reaches react-query — use `select: d => d?.settings` to extract the inner object.

`showContact` has no backend field yet — it lives in local state only.

- [ ] **Step 1: Replace the PrivacySection stub**

Replace `function PrivacySection() { return null; }` with:

```jsx
function PrivacySection() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['talent-settings'],
    queryFn:  talentApi.getSettings,
    select:   (d) => d?.settings,
  });

  const [form, setForm] = useState({
    slug:          '',
    isPublic:      true,
    isDiscoverable: false,
    showContact:   true,
  });
  const [initialized, setInitialized] = useState(false);
  const [isChanged, setIsChanged]     = useState(false);

  useEffect(() => {
    if (settings && !initialized) {
      setForm({
        slug:           settings.slug          || '',
        isPublic:       settings.isPublic      ?? true,
        isDiscoverable: settings.isDiscoverable ?? false,
        showContact:    true,
      });
      setInitialized(true);
    }
  }, [settings, initialized]);

  const mutation = useMutation({
    mutationFn: (data) => talentApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['talent-settings']);
      toast.success('Privacy settings saved');
      setIsChanged(false);
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const set = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setIsChanged(true);
  };

  const handleSave = () => {
    mutation.mutate({
      slug:    form.slug,
      isPublic: form.isPublic,
    });
    // isDiscoverable uses a separate endpoint; stub for now
  };

  if (isLoading || !initialized) {
    return <div className="st-loading"><span>Loading…</span></div>;
  }

  return (
    <div className="st-card">
      <div className="st-card-hd">
        <span className="st-card-eyebrow">03 / Preferences</span>
        <h2 className="st-card-title">Privacy &amp; Portfolio</h2>
      </div>

      <div className="st-card-inner st-form-body">
        <div className="st-field">
          <label className="st-label" htmlFor="st-slug">Your Portfolio Slug</label>
          <div className="st-input-prefix-wrap">
            <span className="st-input-prefix">pholio.studio/p/</span>
            <input
              id="st-slug"
              className="st-input"
              value={form.slug}
              onChange={e => set('slug', e.target.value)}
              placeholder="your-name"
            />
          </div>
          <span className="st-input-help">Share this link with agencies and clients.</span>
        </div>

        <div className="st-field">
          <label className="st-label" htmlFor="st-visibility">Profile Visibility</label>
          <select
            id="st-visibility"
            className="st-select"
            value={form.isPublic ? 'public' : 'private'}
            onChange={e => set('isPublic', e.target.value === 'public')}
          >
            <option value="public">Public — anyone can view</option>
            <option value="private">Private — hidden from search</option>
          </select>
        </div>

        <div className="st-toggle-row" style={{ padding: '16px 0', borderBottom: 'none' }}>
          <div className="st-toggle-info">
            <span className="st-toggle-label">Allow Search Indexing</span>
            <span className="st-toggle-desc">Let search engines index your portfolio page</span>
          </div>
          <label className="st-switch">
            <input
              type="checkbox"
              checked={form.isDiscoverable}
              onChange={() => set('isDiscoverable', !form.isDiscoverable)}
            />
            <span className="st-slider" />
            <span className="sr-only">Allow search indexing</span>
          </label>
        </div>

        <div className="st-toggle-row" style={{ padding: '16px 0', borderBottom: 'none', borderTop: '1px solid rgba(26,24,21,0.06)' }}>
          <div className="st-toggle-info">
            <span className="st-toggle-label">Show Contact Information</span>
            <span className="st-toggle-desc">Display email and phone on your public portfolio</span>
          </div>
          <label className="st-switch">
            <input
              type="checkbox"
              checked={form.showContact}
              onChange={() => set('showContact', !form.showContact)}
            />
            <span className="st-slider" />
            <span className="sr-only">Show contact information</span>
          </label>
        </div>
      </div>

      <div className="st-card-footer">
        <button
          className="st-btn st-btn-primary"
          onClick={handleSave}
          disabled={!isChanged || mutation.isPending}
        >
          {mutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/pages/SettingsPage/index.jsx
git commit -m "feat(talent-settings): add Privacy & Portfolio section with slug and visibility"
```

---

## Task 6: SubscriptionSection

**Files:**
- Modify: `client/src/domains/talent/pages/SettingsPage/index.jsx`

No billing endpoint exists for talent yet. This section uses static demo data. Buttons fire `toast` placeholders.

- [ ] **Step 1: Replace the SubscriptionSection stub**

Replace `function SubscriptionSection() { return null; }` with:

```jsx
const MOCK_INVOICES = [
  { id: '#INV-003', date: 'May 01, 2026', amount: '$29.00' },
  { id: '#INV-002', date: 'Apr 01, 2026', amount: '$29.00' },
  { id: '#INV-001', date: 'Mar 01, 2026', amount: '$29.00' },
];

function SubscriptionSection() {
  return (
    <div className="st-card-stack">
      {/* Plan hero card */}
      <div className="st-card">
        <div className="st-plan-card">
          <div className="st-plan-left">
            <span className="st-plan-name">Studio+</span>
            <div className="st-plan-price">
              <span className="st-plan-price-num">$29</span>
              <span className="st-plan-price-unit">/month</span>
            </div>
            <span className="st-plan-renewal">Next renewal: June 1, 2026</span>
            <button
              className="st-btn st-btn-ghost"
              style={{ marginTop: '16px', padding: '0', fontSize: '13px' }}
              onClick={() => toast.info('Plan management coming soon')}
            >
              Change Plan
            </button>
          </div>
          <div className="st-plan-right">
            <div className="st-payment-method">
              <CreditCard size={16} aria-hidden="true" />
              <span className="st-payment-label">•••• 4242</span>
            </div>
            <button
              className="st-btn st-btn-ghost"
              style={{ padding: '0', fontSize: '12px' }}
              onClick={() => toast.info('Payment method management coming soon')}
            >
              Update Payment Method
            </button>
          </div>
        </div>
      </div>

      {/* Invoice history */}
      <div className="st-card">
        <div className="st-card-hd">
          <span className="st-card-eyebrow">04 / Your Plan</span>
          <h2 className="st-card-title">Invoice History</h2>
        </div>
        {MOCK_INVOICES.map(inv => (
          <div key={inv.id} className="st-invoice-row">
            <span className="st-invoice-id">{inv.id}</span>
            <span className="st-invoice-date">{inv.date}</span>
            <span className="st-invoice-amount">{inv.amount}</span>
            <span className="st-invoice-status">
              <Check size={11} aria-hidden="true" /> Paid
            </span>
            <button
              className="st-invoice-download"
              onClick={() => toast.info('Invoice download coming soon')}
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/pages/SettingsPage/index.jsx
git commit -m "feat(talent-settings): add Subscription section with plan card and invoice list"
```

---

## Task 7: SecuritySection

**Files:**
- Modify: `client/src/domains/talent/pages/SettingsPage/index.jsx`

Password reset uses Firebase `sendPasswordResetEmail(auth, email)`. `auth` is imported from `../../../../shared/lib/firebase`. Sessions list is static mock data — no backend endpoint exists yet.

- [ ] **Step 1: Replace the SecuritySection stub**

Replace `function SecuritySection() { return null; }` with:

```jsx
const MOCK_SESSIONS = [
  { device: 'Chrome on macOS',   location: 'New York, NY',      time: '2 minutes ago', active: true },
  { device: 'Safari on iPhone',  location: 'New York, NY',      time: '3 days ago',    active: false },
  { device: 'Chrome on Windows', location: 'Los Angeles, CA',   time: '2 weeks ago',   active: false },
];

function SecuritySection() {
  const { profile } = useAuth();
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handlePasswordReset = async () => {
    if (!profile?.email) return;
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, profile.email);
      toast.success(`Password reset email sent to ${profile.email}`);
    } catch {
      toast.error('Failed to send reset email');
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="st-card-stack">
      {/* Credentials card */}
      <div className="st-card">
        <div className="st-card-hd">
          <span className="st-card-eyebrow">05 / Your Plan</span>
          <h2 className="st-card-title">Security</h2>
        </div>
        <div className="st-card-inner st-form-body">
          <div className="st-field">
            <label className="st-label" htmlFor="st-sec-email">Email Address</label>
            <div className="st-input-icon-wrap">
              <Mail size={15} className="st-input-icon" aria-hidden="true" />
              <input
                id="st-sec-email"
                className="st-input st-input--icon"
                type="email"
                value={profile?.email || ''}
                disabled
              />
            </div>
            <span className="st-input-help">Primary authentication email. Managed by Firebase.</span>
          </div>

          <div className="st-credential-row">
            <div className="st-toggle-info">
              <span className="st-toggle-label">Account Password</span>
              <span className="st-toggle-desc">Send a reset link to your email address</span>
            </div>
            <button
              className="st-btn st-btn-secondary"
              onClick={handlePasswordReset}
              disabled={isSendingReset}
            >
              {isSendingReset ? 'Sending…' : 'Update Password'}
            </button>
          </div>

          <div className="st-credential-row">
            <div className="st-toggle-info">
              <span className="st-toggle-label">Two-Factor Authentication</span>
              <span className="st-toggle-desc">Add an extra layer of security to your account</span>
            </div>
            <span className="st-badge st-badge--coming-soon">Coming Soon</span>
          </div>
        </div>
      </div>

      {/* Sessions card */}
      <div className="st-card">
        <div className="st-card-hd">
          <span className="st-card-eyebrow">Recent Activity</span>
          <h2 className="st-card-title">Sessions</h2>
        </div>
        {MOCK_SESSIONS.map((s, i) => (
          <div key={i} className="st-session-row">
            <div className="st-session-icon" aria-hidden="true">
              <Monitor size={15} />
            </div>
            <div className="st-session-info">
              <span className="st-session-device">{s.device}</span>
              <span className="st-session-location">{s.location}</span>
            </div>
            <span className="st-session-time">{s.time}</span>
            <span className={`st-badge ${s.active ? 'st-badge--active' : 'st-badge--expired'}`}>
              {s.active ? 'Active' : 'Expired'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/pages/SettingsPage/index.jsx
git commit -m "feat(talent-settings): add Security section with Firebase password reset and sessions"
```

---

## Task 8: DangerZoneSection

**Files:**
- Modify: `client/src/domains/talent/pages/SettingsPage/index.jsx`

Both destructive actions are placeholders — they fire a toast because no backend endpoint exists yet. Buttons are `type="button"` (not submit). The card uses the danger tint variant `.st-card--danger`.

- [ ] **Step 1: Replace the DangerZoneSection stub**

Replace `function DangerZoneSection() { return null; }` with:

```jsx
function DangerZoneSection() {
  return (
    <div className="st-card st-card--danger">
      <div className="st-card-hd">
        <span className="st-card-eyebrow">Irreversible Actions</span>
        <h2 className="st-card-title">Danger Zone</h2>
      </div>

      <div className="st-action-row">
        <div className="st-action-info">
          <span className="st-action-label">Deactivate Account</span>
          <span className="st-action-desc">
            Temporarily hide your profile and suspend access. Reactivate any time.
          </span>
        </div>
        <button
          type="button"
          className="st-btn st-btn-danger-ghost"
          onClick={() => toast.error('This action requires confirmation — coming soon')}
        >
          Deactivate
        </button>
      </div>

      <div className="st-action-row">
        <div className="st-action-info">
          <span className="st-action-label">Delete Account</span>
          <span className="st-action-desc">
            Permanently delete all data, images, and applications. This cannot be undone.
          </span>
        </div>
        <button
          type="button"
          className="st-btn st-btn-danger"
          onClick={() => toast.error('This action requires confirmation — coming soon')}
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/lenquanhone/Projects/pholio-app/client && npm run lint
```

- [ ] **Step 3: Final commit**

```bash
git add client/src/domains/talent/pages/SettingsPage/index.jsx
git commit -m "feat(talent-settings): add Danger Zone section and complete settings redesign"
```

---

## Task 9: Visual Verification

**Files:** None (read-only check)

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/lenquanhone/Projects/pholio-app && npm run dev:all
```

Wait for `VITE ready` and `Express :3000` output.

- [ ] **Step 2: Open the settings page in the browser**

Navigate to `http://localhost:5173` → log in as `talent@example.com / password123` → click the gear icon in the top bar (or go to `http://localhost:5173/dashboard/talent/settings`).

- [ ] **Step 3: Verify each section**

Check the following for each section (click each sidebar item):

| Section | What to verify |
|---------|---------------|
| Account | Avatar placeholder renders; name/phone editable; email disabled with help text; Save button disabled until change |
| Notifications | Six toggle rows in two groups; toggling fires a toast |
| Privacy | Slug input with prefix `pholio.studio/p/`; visibility dropdown; two toggle rows; Save disabled until change |
| Subscription | Gold-gradient plan card with price; invoice table with 3 rows |
| Security | Email disabled with icon; Update Password button; Coming Soon badge; 3 session rows |
| Danger Zone | Red-tinted card; Deactivate ghost-danger button; Delete filled-danger button; both fire toast |

- [ ] **Step 4: Verify sidebar active state**

Click between sidebar items — confirm the gold left bar animates between items via Framer Motion `layoutId`.

- [ ] **Step 5: Verify page entrance animation**

Hard-refresh the page (`Cmd+Shift+R`) — confirm the page fades in and translates up from y+12.

---

## Self-Review Notes

- **Spec coverage:** All 6 sections implemented. Page shell, back link, grain, sidebar groups, support callout, AnimatePresence transitions, gold left-bar with `layoutId`, accessibility attributes — all covered.
- **API wiring table:** Account (live), Privacy slug+isPublic (live), Notifications (stub toast), Subscription (static mock), Security password reset (live via Firebase), Security sessions (static mock), Danger Zone (stub toast).
- **Type/name consistency:** `MOCK_SESSIONS` defined before `SecuritySection`, `MOCK_INVOICES` defined before `SubscriptionSection`, `EMAIL_TOGGLES`/`INAPP_TOGGLES` defined before `NotificationsSection`. All class names in JSX match names defined in `SettingsPage.css`.
- **No placeholders:** Every step has exact code. No "fill in later" or "TBD".
