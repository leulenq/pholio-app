# CSAM Escalation Runbook (Internal)

> **Not legal advice.** Automated NCMEC CyberTipline submission is **not** implemented. All escalations require human review and counsel before any external report.

## Purpose

Pholio's CSAM scaffold flags uploads that match high-risk heuristics (e.g. extreme skin-tone ratio, moderation pipeline errors) and records them in `csam_escalations` for moderator review. This runbook describes triage steps only.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `CSAM_MODERATION_PROVIDER` | `heuristic_escalation` | Set to `none` to disable CSAM screening (dev/test only). |
| `MODERATOR_USER_IDS` | — | Comma-separated user UUIDs with moderator access. |
| `MODERATION_PROVIDER` | `heuristic` | General content moderation provider for upload review queue. |

Moderators are also granted access when their account email ends with `@pholio.studio`.

## Detection flow

1. Talent uploads an image (`POST /api/talent/media`).
2. `content-moderation` analyzes the buffer; suspicious images enter `moderation_queue`.
3. `screenImageForCsam()` runs in parallel; if `shouldEscalate`, `recordCsamEscalation()` inserts a `pending_review` row.
4. Image remains hidden from public/agency views until approved (standard moderation queue).

## Moderator actions

### API

- `GET /api/moderation/csam-escalations` — list `pending_review` escalations
- `PATCH /api/moderation/csam-escalations/:id` — update status:
  - `cleared` — false alarm, no further action
  - `false_positive` — heuristic misfire
  - `escalated` — requires legal / executive review (do **not** use for automated NCMEC filing)
  - `pending_review` — reset to queue

### Triage checklist

1. **Do not re-download or share** flagged media outside secure systems.
2. Open the related queue item via `/dashboard/moderation` (image URL in queue payload).
3. If content appears to depict a minor in sexual context:
   - Set escalation status to `escalated`
   - **Immediately** notify legal counsel and engineering leadership
   - Preserve logs (`csam_escalations`, `moderation_queue`, upload timestamps, `user_id`)
   - **Do not** attempt NCMEC submission without counsel — integrate PhotoDNA / approved vendor per legal direction
4. If clearly benign (e.g. fashion headshot, heuristic false positive): `false_positive` or `cleared`.
5. Document notes in the PATCH `notes` field.

## Production hardening (future)

- Replace heuristic provider with Microsoft PhotoDNA Cloud or counsel-approved vendor
- Wire counsel-approved NCMEC CyberTipline workflow (18 U.S.C. § 2258A)
- Restrict moderator UI access via SSO + audit logging
- Rotate and restrict access to escalation tables

## Related docs

- Community Guidelines (marketing site `/community-guidelines`)
- `src/shared/lib/csam-moderation.js` — provider implementation
- `tasks/legal-audit.md` — audit tracking
