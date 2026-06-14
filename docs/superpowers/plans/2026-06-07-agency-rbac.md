# Agency RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace coarse OWNER/ADMIN/MEMBER checks with a least-privilege, auditable permission system across agency APIs and dashboard UI.

**Architecture:** Preset roles (OWNER, ADMIN, AGENT, SCOUT, VIEWER) with permission catalog in code; optional ALLOW/DENY grants in DB; central route→permission map enforced in `agency-api-guard`; session exposes effective permissions to React context.

**Tech Stack:** Knex migrations, Express middleware, React context hook

**Spec:** `docs/superpowers/specs/2026-06-07-agency-rbac-design.md`

---

## Status (2026-06-07)

- [x] Migration: `agency_membership_permissions`, `agency_audit_events`, MEMBER→SCOUT
- [x] Permission catalog + resolver + audit service
- [x] Route permission map + `enforceAgencyRoutePermissions`
- [x] Session bootstrap with `permissions`, `presetRole`, `membershipId`
- [x] Team API: five roles, assignment guards, audit events
- [x] Custom grant API + audit log endpoint
- [x] Frontend: `AgencyPermissionsProvider`, nav filtering, team/settings seats
- [x] Unit tests: `tests/unit/agency-rbac.test.js`
- [x] Custom access modal on Team page (grant UI)
- [x] Gate BulkActionToolbar + Roster bulk bar per permission
- [x] Integration tests against HTTP layer per role
- [x] Application activity attribution via `memberUserId`
- [x] Gate TalentActionBar per permission
- [x] Settings TeamPanel copy update
