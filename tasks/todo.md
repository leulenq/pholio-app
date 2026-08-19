# Open-call applicant flow — implementation plan (v2 design)

Design authority: `docs/open-call-applicant-flow-design-2026-08.md` (rev 2, commit `441af8f`).
Branch: `claude/open-call-applicant-flow-0w71i7`. Lead integrates and commits; workers never commit.
Out of scope per owner: FWBK age policy / minor intake (another agent owns it). The 18+ attestation
field stays as a plain apply-stage attestation; no guardian machinery is touched.

Rulings assumed (per doc §9 recommendations, owner said proceed): Q2 yes, Q3 nullable+resolver,
Q4 yes, Q5 event_ends_on+90d, Q6 yes, Q7 photos gate submit but come last, Q8 fulfilment needs no claim.

## Waves

- [ ] **W1-A1 (Opus)** C4 claim-key fix: `agency_open_call_claims.call_purpose`, per-purpose partial
      uniques (repr: agency+profile; event: link+profile), service + submit-path updates, tests.
- [ ] **W1-A2 (Opus)** Schema: `applicant_identities`, `open_call_submissions`,
      `open_call_submission_media`, `applicant_claim_tokens`, `open_call_material_requests`;
      `applications.profile_id` → nullable (SQLite introspect-and-rebuild per `20260815090000`
      precedent) + `applicant_identity_id` + CHECK + identity-keyed partial uniques;
      `agency_open_call_links.intake_spec/intake_spec_version/identity_policy`. Migration tests.
- [ ] **W1-B (Sonnet)** Intake vocabulary constants, server + client mirror + parity test:
      field keys, stages, requirements, identity policies, default specs per call kind,
      normalize/validate helpers.
- [ ] **W2-C1 (Opus)** Identity + token services: `applicant-identities`, claim/disown/materials
      tokens (hashed, message-reply-tokens idiom), claim transaction (users+profiles projection,
      media promotion, application re-pointing, email_verified=true), disown flow. Tests.
- [ ] **W2-C2 (Opus)** Anonymous draft + submit: draft cookie service, public endpoints
      (spec fetch, draft CRUD, media upload gated behind email, submit → applications row +
      frozen snapshot + consent event + receipt email), moderation wiring, funnel events. Tests.
- [ ] **W3-D (Opus)** `resolveApplicantIdentity` resolver + enforcement test; the 8 agency
      `profiles`-join sites; unclaimed rows in inbox + CSV; verified-email/completeness as plain
      text; Request-materials endpoint + chase email. Tests.
- [ ] **W4-E (Opus)** Client applicant flow at `/opencall/:code`: screen-1-with-first-question,
      apply-stage spec screens (photos last), email step (no oracle), consent, send, payoff;
      draft resume; retire arrival page as a gate.
- [ ] **W4-E2 (Sonnet)** Materials fulfilment page (tokenized, ReplyPage shape) + claim offer after send.
- [ ] **W5 (lead)** Full test suite + client lint + adversarial diff review; docs updated; commits.

## Review log
(filled as waves land)
