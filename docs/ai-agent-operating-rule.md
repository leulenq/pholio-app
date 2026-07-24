# AI Agent Operating Rule

**Status:** Global / mandatory  
**Applies to:** All coding agents and model providers working in this repository — Claude, Cursor, Codex, and any future agent or orchestrator.  
**Canonical copy:** This file. Cursor always-applies the same rule via `.cursor/rules/ai-agent-operating-rule.mdc`. `CLAUDE.md` and `AGENTS.md` summarize and point here.

## Purpose

Optimize **cost and token usage** without sacrificing **engineering quality**.

Use the smallest / cheapest / fastest model that can do the job well. Escalate to stronger models for complexity, risk, architecture, final review, testing strategy, and production-grade validation. Scale with multiple agents only when parallelism is safe.

This rule is provider-agnostic. Map local model names to the **capability classes** below.

---

## 1. Capability Classes (provider-agnostic)

| Class | Role | Typical local names (examples, not exhaustive) |
|-------|------|--------------------------------------------------|
| **Fast** | Cheap, low-latency mechanical work | Haiku-class, GPT mini/nano, Composer fast, flash/lite models |
| **Standard** | Default implementation quality | Sonnet-class, GPT mid-tier, Composer default, Codex default |
| **Strong** | High-risk reasoning and hard review | Opus-class, GPT high/pro, Claude Opus, deep-thinking modes |
| **Frontier** | Long-horizon / ambiguous / very expensive-mistake work | Fable-class or strongest available planning model |

**Default:** Standard.  
**Escalate** when blast radius, ambiguity, or cross-system risk rises.  
**De-escalate** when the subtask is mechanical, well-specified, and easy to verify.

If a requested model is unavailable, use the nearest model in the **same class** and state the substitution once.

---

## 2. Model Selection — Right Model for the Job

### Use Fast when

- File lookups, greps, path discovery
- Small, localized edits with an exact spec
- Formatting, renames, import cleanup
- Summarizing command output or logs
- Boilerplate generation from a clear template
- Narrow mechanical refactors with an obvious oracle (tests/lint)

### Use Standard when

- Everyday feature implementation on one surface
- Routine refactors and test writing
- Moderate debugging with a clear reproduction
- Product copy and most single-page UI work
- Following an already-approved plan

### Use Strong when

- Architecture or multi-system design
- Auth, sessions, payments, migrations, middleware order, security
- Ambiguous product/design decisions
- Deep code review and production validation
- Hard multi-file debugging
- Final review of high-risk changes before merge

### Use Frontier when available and only when

- Broad redesigns spanning many domains
- Large multi-agent plans with contested trade-offs
- Ambiguous architecture where a wrong call is very expensive
- Cross-cutting refactors that rewrite shared contracts

### Hard rule

Never spend Strong/Frontier capacity on work Fast/Standard can finish safely.  
Never leave high-blast-radius work on Fast because it is cheaper.

---

## 3. Work Splitting Across Models and Agents

Prefer a **planner → executor → reviewer** split on non-trivial work:

1. **Plan (Strong/Frontier when needed):** scope, risks, file ownership, acceptance checks.
2. **Execute (Standard/Fast):** implement narrow, well-specified slices.
3. **Review / validate (Strong for high risk; Standard for ordinary work):** correctness, regressions, test strategy, production readiness.

### Single-agent default

If the task is simple enough for one agent, **that single agent may plan, implement, review, test, and commit** its own changes. Do not invent multi-agent ceremony for small work.

### Multi-agent / multi-model use

- One clear objective per agent.
- Give executors a tight brief: goal, constraints, allowed files, done criteria.
- Keep the parent/lead context clean by offloading research and exploration.
- Escalate a slice mid-flight if the executor hits ambiguity, security risk, or failing invariants — do not push through with a too-weak model.

---

## 4. Token and Context Control

Tokens are a budget. Spend them on signal.

1. **Read narrowly.** Prefer targeted search and partial file reads over whole-repo dumps.
2. **Avoid re-reading.** Cache decisions in the plan; do not reopen the same files without a reason.
3. **Prefer diffs and symbols** over pasting large unchanged regions.
4. **Offload exploration** to short-lived subagents / side queries; return summaries, not raw trees.
5. **Keep plans short and checkable.** Long narrative context burns tokens and drifts.
6. **Do not duplicate large rule bodies** into prompts when a durable repo rule already applies.
7. **Stop early** when the acceptance criteria are met. Extra polish loops need a concrete defect.
8. **Batch tool calls** when independent. Serial curiosity walks waste turns and tokens.
9. **Discard dead ends quickly.** If a hypothesis fails, record it once and move on.

Cheaper models are a token strategy only when quality remains acceptable. A failed Fast attempt that forces a full Strong redo is more expensive than starting at Standard.

---

## 5. Quality Bar (non-negotiable)

Cost optimization never overrides these:

1. **Root cause over patches.** No temporary fixes for production paths.
2. **Minimal impact.** Touch only what the task requires.
3. **Prove it works.** Run the relevant tests/lint/repro before claiming done.
4. **Staff-engineer standard.** Ask: would this pass serious review?
5. **High-risk zones get Strong review** even if Fast/Standard wrote the code:
   - Auth / sessions / role gates
   - Stripe / webhooks / money
   - Migrations and data integrity
   - Middleware order and cross-tenant boundaries
   - Onboarding / access gating that can lock users out
6. **Testing strategy scales with risk.** Mechanical edits need focused checks; risky changes need regression coverage and explicit failure-mode thinking.
7. **If quality slips, escalate model class** and fix — do not ship a cheap wrong answer.

---

## 6. Parallel Agent Coordination

Parallelism is allowed for large tasks that benefit from it. Safety beats speed.

### When to parallelize

- Independent research/review lanes (e.g. visual audit vs routing audit)
- Disjoint implementation slices with no shared files
- Read-only investigation fan-out that returns findings to a lead agent

### When not to parallelize

- The task fits one agent cleanly
- Required edits concentrate in the same files
- Shared contracts, routing tables, schemas, or design tokens must change together
- Anyone would need to “just quickly touch” another lane’s files

### Hard parallel rules

1. **Strict disjoint file ownership.** Every writable file belongs to at most one active parallel agent.
2. **No shared writable files.** Shared integration files stay with the **lead agent** only.
3. **No overlapping edit areas.** If two agents would touch the same module, serialize or re-scope.
4. **No git commits from parallel worker agents.** Workers do not `git add`, `commit`, `push`, or open/update PRs.
5. **Lead agent integrates.** The lead owns merge order, conflict resolution, verification, task docs, and all commits.
6. **Workers report, they do not freelance.** Findings and patches return to the lead within the assigned lane.
7. **Read-only lanes may share reads** freely; write lanes must remain disjoint.
8. **If ownership would collide, stop and re-plan** — do not “coordinate in chat” while editing the same files.

### Single-agent exception

If the task is simple enough for one agent, that agent is allowed to handle implementation, review, testing, and commits alone. Parallel rules apply only when multiple writers are active.

---

## 7. Operating Loop

1. **Classify** the task: Fast / Standard / Strong / Frontier.
2. **Decide shape:** single agent vs parallel lanes.
3. **If parallel:** assign disjoint file ownership before any writes; name the lead.
4. **Plan** only as much as needed; check in on non-trivial work via `tasks/todo.md` when that workflow applies.
5. **Execute** with the cheapest capable model per slice.
6. **Verify** with tests, repro, or Strong review according to risk.
7. **Integrate and commit** only from the single-agent owner or the lead agent.
8. **Capture lessons** after corrections in `tasks/lessons.md`.

---

## 8. Quick Decision Guide

| Situation | Action |
|-----------|--------|
| Typo, rename, tiny CSS tweak | Single Fast/Standard agent; commit own change |
| One-feature UI/API slice with clear spec | Single Standard agent; self-review + tests |
| Auth/payment/migration/security change | Standard/Strong implement; Strong review required |
| Large redesign, many independent files | Lead plans; parallel workers on disjoint files; lead commits |
| Ambiguous product/architecture call | Strong/Frontier plan first; do not parallelize into the fog |
| Worker needs a file outside its lane | Stop; return to lead; reassign ownership |

---

## 9. Compatibility Notes

- **Claude Code:** follows this rule via `CLAUDE.md` + this doc.
- **Cursor (IDE / Cloud):** always-applies `.cursor/rules/ai-agent-operating-rule.mdc`.
- **Codex and AGENTS.md consumers:** follow via `AGENTS.md` + this doc.
- Future agents: treat this file as the repo’s universal orchestration contract.

Provider UI labels change. **Capability class and ownership rules do not.**
