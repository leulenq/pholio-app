# Branch audit — 2026-07-26

Source of truth: `origin/main` at `8392107` (Merge PR #67).

Method: `git merge-base --is-ancestor`, `git rev-list` ahead/behind, `git cherry -v`, `gh pr list --state all`, and content checks against `main` for squash-merged tips. No guesses.

## Summary

| Category | Count | Action |
|---|---|---|
| Fully merged (ancestor of main) | 44 | Deleted |
| Squash/equivalent merged (PR merged or cherry `-`) | 9 | Deleted |
| Closed-only / superseded duplicates | 3 | Deleted |
| Stale open PRs (work already on main / conflicting) | 4 | PRs closed, branches deleted |
| Abandoned / superseded no-PR | 3 | Deleted (tip SHAs recorded) |
| **Keep — active or unique unmerged** | **4** | Retained |
| **main** | 1 | Retained |

## KEEP (remain)

| Branch | Why |
|---|---|
| `main` | Default / production line |
| `claude/talent-dashboard-auth-bug-7499at` | Open PR **#68** (2026-07-26). Unique commit not on main: welcome-splash / loading UI. |
| `claude/agency-onboarding-redesign-ka60u6` | Latest agency setup redesign (2026-07-26). 2 unique commits; no PR yet. Supersedes `wudsb4`. |
| `claude/agency-submissions-audit-oc5pht` | Unique unmerged work (2026-07-24): submissions UX + `SUBMISSIONS_HARD_CAP` safety ceiling not on main. |
| `claude/logo-icon-12euah` | Unique unmerged brand mark (`PholioMark`, favicon) — never PR'd, not on main. Keep until shipped or explicitly dropped. |

## DELETE — fully merged (ancestor of main, ahead=0)

- `claude/agency-dashboard-audit-yhe0lg`
- `claude/agency-dashboard-redesign-2h54q7`
- `claude/agency-dashboard-screenshots-bnbnqi`
- `claude/agency-status-redesign-vhqdk7`
- `claude/auth-logout-session-bug-egu7ba`
- `claude/discover-talent-search-redesign-wbivg7`
- `claude/implementation-continuation-c4qtef`
- `claude/intel-page-spec-wxojjv`
- `claude/onboarding-e2e-audit-cmwctc`
- `claude/onboarding-e2e-audit-continue-rcr8ui`
- `claude/pholio-backend-audit-u4ar6t`
- `claude/pholio-legal-audit-y8nmsj`
- `claude/pholio-match-score-backend-g0897q`
- `claude/pholio-talent-app-limits-qzp3b4`
- `claude/profile-tab-mobile-layout-8y216l`
- `claude/signing-page-redesign-18wx1n`
- `claude/talent-dashboard-mobile-audit-2lmtr7`
- `claude/talent-dashboard-notifications-co5n9t`
- `codex/conduct-production-readiness-audit-for-talent-experience`
- `codex/create-comprehensive-business/status-document-for-codex-rmy0iu`
- `codex/create-talent-dashboard-settings-page`
- `codex/create-talent-dashboard-settings-page-40j0p2`
- `codex/create-talent-dashboard-settings-page-7bgjwd`
- `codex/create-talent-dashboard-settings-page-j9pxc7`
- `codex/rebuild-email-system-from-scratch`
- `codex/redefine-agency-access-and-onboarding-flow`
- `codex/research-claude-configuration-files`
- `consolidation-2026-07-11`
- `cursor/client-deps-security-280d`
- `cursor/dependency-audit-280d`
- `cursor/eslint-hooks-remediation-280d`
- `cursor/google-login-terms-acceptance-1b6a`
- `cursor/intel-light-shell-tone-b72c`
- `cursor/oauth-avatar-account-layer-3844`
- `cursor/orphan-import-cleanup-280d`
- `cursor/root-deps-security-280d`
- `cursor/root-native-majors-280d`
- `cursor/settings-section-ledger-nav-b72c`
- `cursor/unify-loading-spinner-3e2a`
- `cursor/zod-root-v4-280d`
- `devin/1783451377-agency-onboarding-design`
- `devin/1783740533-dev-seeded-agency-login`
- `feat/agency-command-center`
- `profile-audit-remediation`

## DELETE — squash / patch-equivalent already on main

| Branch | Evidence |
|---|---|
| `claude/intel-page-completion-p9c8mh` | PR #6 merged; Intel page present on main |
| `claude/pholio-comp-card-system-nofxfm` | PR #36 merged; `git cherry` all `-` |
| `codex/conduct-agency-dashboard-security-audit` | PR #34 merged; `git cherry` all `-` |
| `cursor/ai-agent-operating-rule-51d1` | PR #51 merged; `docs/ai-agent-operating-rule.md` on main |
| `cursor/fix-intel-useintel-hook-b72c` | PR #61 merged; `git cherry` `-` |
| `cursor/login-oauth-native-branding-6e1e` | PR #53 merged |
| `cursor/settings-toggle-row-layout-b72c` | PR #64 merged; `git cherry` all `-` |
| `refactor/domain-first-reorganization` | PR #1 merged (2026-03); cherry mostly `-` |
| `claude/pholio-reasoning-manual-5a00ch` | No PR; `git cherry` `-`; `docs/reasoning-manual.md` on main |

## DELETE — closed-only / superseded

| Branch | Evidence |
|---|---|
| `codex/create-talent-dashboard-settings-page-kq0ib4` | PR #11 closed; cherry `-`; superseded by #13 |
| `codex/create-talent-dashboard-settings-page-se65n0` | PR #10 closed; cherry `-`; superseded by #13 |
| `cursor/fix-client-eslint-peer-deps-280d` | PR #46 closed; `client/.npmrc` legacy-peer-deps already on main via #49 |

## CLOSE + DELETE — stale open PRs

| Branch | PR | Evidence |
|---|---|---|
| `codex/create-talent-dashboard-settings-page-esm6fe` | #15 | Duplicate of settings/Intel work; cherry `-`; superseded by #13/#17/#20; stale since 2026-07-04 |
| `codex/create-talent-dashboard-settings-page-0nvplu` | #16 | Same |
| `codex/create-talent-dashboard-settings-page-o2cl5s` | #19 | Same |
| `claude/agency-dashboard-audit-0c2g52` | #37 | `mergeable=CONFLICTING`; 27/28 commits cherry-equivalent; purge targets already gone on main; stale since 2026-07-12 |

## DELETE — abandoned / superseded no-PR (tips recorded)

| Branch | Tip SHA | Why |
|---|---|---|
| `claude/agency-setup-redesign-wudsb4` | `7d01e64` | Older parallel SetupPage redesign; superseded by `ka60u6` (2026-07-26) |
| `claude/dependency-audit-review-eegrmu` | `14d2a92` | Docs-only verification addendum; dep fixes already merged via #47–#57; never PR'd |

## Not latest / duplicates noted

- Talent settings: many `codex/create-talent-dashboard-settings-page-*` branches. Winners already merged (#8, #13, #17, #20). Open #15/#16/#19 are duplicates.
- Agency setup: `wudsb4` (Jul 20) vs `ka60u6` (Jul 26) — **ka60u6 is latest**.
- Agency dashboard audit: `0c2g52` open/conflicting vs `yhe0lg` merged — work continued on main via later redesign PRs.

## Post-cleanup expected remote branches

- `main`
- `claude/talent-dashboard-auth-bug-7499at`
- `claude/agency-onboarding-redesign-ka60u6`
- `claude/agency-submissions-audit-oc5pht`
- `claude/logo-icon-12euah`
- `cursor/branch-audit-cleanup-54be` (this audit)
