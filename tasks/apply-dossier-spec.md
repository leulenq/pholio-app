# Apply flow — right-side redesign spec (submission dossier)

Status: BUILT (all 7 pages). Grounded in `/industry` consult + real schema.
Verified: client lint clean · production build passes · applications integration
tests pass on fresh SQLite schema (migration is cross-engine safe).

## Reframe

Drop the Address / Curate / Send wizard model entirely. New persistent layout:

- **Header** (`apply-workspace-top`) — constant. Keep as-is.
- **Left rail** (`apply-editorial-rail` / dossier identity) — now PERMANENT across the
  whole flow, not just the locked address scene. Agency identity is the constant masthead.
- **Right column** — a **paginated submission dossier**: the package laid out as a
  document the talent reviews and finalizes, addressed to the house on the left.

Agency is chosen *before* this surface (market deep-link `?agency=`, or a lightweight
chooser that resolves to the locked view). Once here, the agency is fixed and the right
side is purely "review what you have → see what you're sending → write the message."

Two pages, turned (not stepped). Editorial page marker (e.g. `01 — The package`,
`02 — The message`), spring page-turn using existing `app-entrance` / staged-rise.

---

## What the agency requires (the spine — from /industry consult)

Assessment order: **digitals + stats first**, book/comp card supporting. Digitals ≠ book.

1. Digitals set — raw, ≤3mo: headshot · ¾ · full-length front · profile/side · back
2. Stats — structured, dual-unit (cm + in), dated
3. Board they're submitting for (changes what "good" means)
4. Book — curated best work (secondary)
5. Comp card — leave-behind
6. Identity + contact — name, market, email, phone, age (minors branch)
7. Short honest note (not a "cover letter")
8. Consent (minors = stricter)

---

## PAGE 1 — THE PACKAGE (review prepared materials)

Right-column vertical spread. Reads top→bottom as "everything {agency} receives."

1. **Dossier masthead** — small title "The package" + standfirst
   ("Everything {agency} will receive. Review before you send."). Page marker.

2. **Submitting for / board** *(new — industry gap #3)*
   Talent selects which board(s) they submit for (Fashion, Commercial, Curve, Petite,
   Fitness, Mature, …). Reuse `.apply-set` tab language. Frames everything below.
   [DEFERRABLE — flagged]

3. **Digitals** *(primary assessment material — industry gap #1)*
   Five labeled slots: Headshot · ¾-length · Full-length front · Profile/side · Back.
   Each slot = the talent's tagged image, or an empty "missing" slot with a quiet prompt.
   Staleness flag if >3 months. Replaces the generic frames grid as the agency spine.
   This is review + light swap, NOT a separate curate step.

4. **Stats** *(industry gap #2)*
   Readable measurement card, dual-unit ("178 cm / 5′10″"), in agency reading order:
   Height · Bust/Chest · Waist · Hips · (Inseam) · Shoe US/EU/UK · Dress/Suit · Hair ·
   Eyes. "Measured {date}" recency line. Read-only here (edit lives in profile).

5. **Book** — supporting selection, clearly secondary to digitals.
   Existing `.apply-frames` grid, reframed "from your book." Keep hold-back interaction.

6. **Comp card** — `CardThumb` + `.apply-cardpicks` variant rows.

7. **Enclosed strip** (quiet running manifest/count).

Footer: meta (monthly limit) + **[Save draft]** **[Next page →]**.

## PAGE 2 — THE MESSAGE & SEND

1. **Masthead** — "The message" / "A note to {agency}" + standfirst.
2. **The note** — existing `WritingAssistToolbar` + textarea. Honest, short.
3. **What's enclosed** — final at-a-glance manifest: digitals (n + set completeness),
   stats (current/stale), book (n), comp card (variant), contact. The "see what you're
   sending" requirement, consolidated.
4. **Readiness line** — existing `.apply-readyline` showing gaps.
5. **Consent** — checkbox; minors branch note when DOB < 18.
6. Footer: meta + **[Back to package]** **[Send submission →]** (locked until ready).

---

## Interaction

- Pages turn (spring), agency rail constant. Editorial page marker, not "Step 2 of 3".
- **Save draft** on both pages → persists server-side (see below).
- Send → converts draft to application, transitions to existing post-send success state.

## Draft persistence (real, server-side)

New table `application_drafts` (NOT a `draft` status on `applications`):
- Columns: id, talent_id, agency_id, payload (jsonb: board, digitals slot map, excluded
  image ids, media set, comp card variant, note, consent), updated_at. Unique
  (talent_id, agency_id).
- Why a table, not a status: agency inbox queries filter by status across many files;
  a `draft` status risks leaking unsent packages into the agency. A draft isn't an
  application yet — separate object matches the industry mental model and the existing
  "already applied" guard in createApplication (applications.js:246).
- Endpoints (talent domain): PUT upsert draft, GET draft by agency, DELETE draft.
  Send path: createApplication then delete draft (same txn).
- Client: React Query mutation; Save draft = explicit upsert. (Autosave optional later.)

## Industry gaps captured (deferrable, flagged in spec)

- P1 Digitals set missing profile/back slots → Page 1 §3 adds them.
- P1 Stats not shown as dual-unit card → Page 1 §4.
- P1 No board captured → Page 1 §2.
- P0/P1 Minors branch → consent §5 page 2 (DOB-gated copy + visibility).
