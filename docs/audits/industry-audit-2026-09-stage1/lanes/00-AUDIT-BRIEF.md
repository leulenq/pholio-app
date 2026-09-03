# Audit lane brief: Pholio industry-alignment audit, Stage 1 pre-launch (2026-09)

You are auditing a slice of Pholio (a talent-portfolio + agency-intake product) as an experienced
modeling-industry professional would experience it: an agent/booker, scout, casting professional, or
working model. The question for every string, state, action, default, measurement, and workflow:
would a professional stop and think "why is it called that?", "that's not how this works", or
"who designed this without understanding the industry?"

## Ground truth (read these first, in full)
- ./research/R0-first-principles.md
- ./research/R1-intake-submissions.md
- ./research/R2-agency-ops-representation.md
- ./research/R3-materials-stats.md
- ./research/R4-casting-events-options.md
- ./research/R5-legal-minors-trust.md
- ./SURFACE-MAP.md (where every user-facing string lives)
These were built from primary sources independent of the codebase. Cite them (file + section) as
the industry evidence for each finding. Where they are silent, reason from first principles and say so.

## Hard rules
1. Do NOT read, cite, or defer to: /home/user/pholio-app/.claude/skills/**, docs/audits/**, any
   docs/*audit*, tasks/**, or DESIGN.md/PRODUCT.md/CLAUDE.md as vocabulary authorities. The
   product's own vocabulary, language system, and prior audits are UNDER audit, not authorities.
   You may read PRODUCT.md once, only to learn the declared scope boundary (e.g. "Pholio is not
   an agency; no commission workflow"), so you do not flag deliberate absences as gaps. If a
   surface contradicts that declared scope, that is a finding.
2. Audit the LIVE product only. Before reporting a string, confirm the component/template is
   reachable (imported and routed, or the email/notification is actually sent by a live caller).
   Say "reachable via <route/caller>" in each finding. Dead code goes in a separate short list.
3. Every finding cites the exact string(s) and file:line, the industry reality with its evidence
   (research file section or a first-principles argument), and a concrete credible fix. No
   floating opinions; no findings without a string or a state.
4. Go beneath words. If a label is fine but the concept, state, default, or workflow underneath
   is not how the industry works, flag the product model, not the wording. Say which of these
   lenses applies: TERM (wrong/outsider/invented word), CONCEPT (the underlying object or workflow
   is not real), STATE (status vocabulary or transitions wrong, missing, or owner-confused),
   DATA (measurements, units, order, recency, required fields, defaults), CLAIM (copy asserts
   intent, suitability, outcome, representation, eligibility, readiness, verification, or any
   fact the data does not support), CONSISTENCY (defensible alone, inconsistent across Pholio;
   list all variants you saw with locations), LEAK (backend/system concept exposed to users:
   enum values, internal names, ids, job names, "snapshot", "dossier", "spec registry", etc.),
   MINOR (under-18 handling), SCOPE (surface implies a workflow Pholio declares it does not do).
5. Grade: P0 = a professional would distrust the product or there is legal/compliance exposure;
   P1 = a real user would hit it and be confused or misled; P2 = polish. Lead with P0. Do not
   pad. Prefer 25 sharp findings over 80 soft ones, but be exhaustive on P0/P1.
6. Read the actual code paths for CLAIM findings: what data feeds the string? If "Under review"
   is shown when nobody has opened it, trace that. If a status is auto-set, say so.
7. Also record what is RIGHT and should be preserved (short list). And record any internal
   coined terms you encounter (every non-standard noun the product invented) with a verdict:
   keep / translate / hide.

## Output format
Write to the path you are given. Structure:
# Lane <n>: <scope>  ·  audience: <talent | agency | both>
## Verdict (one paragraph: would a pro trust this slice; the headline gap)
## Findings
For each: `### <id> [P0|P1|P2] [LENS] <one-line title>`
- Where: file:line, reachable via ...
- String/state: "exact text" (quote several if a pattern)
- Industry reality: ... (evidence: R#.§ or first principles)
- Why it fails: ...
- Fix: ...
## Coined / internal terms encountered (table: term | where | verdict | translation)
## Consistency variants (table: concept | variants seen | locations)
## Working well (preserve)
## Dead or unreachable code carrying issues (brief)
## Coverage: files read, files skipped and why
