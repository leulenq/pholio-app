# Presentation contract — `entry.glance`

For the Market-card workstream (`client/src/domains/talent/components/market/**`),
which this document does not touch or own.

## The shape

Every market-directory entry that has a `seriesId` (built by
`client/src/domains/talent/lib/marketDirectory.js`) now carries an additive
`glance` field, computed by `client/src/domains/talent/lib/glanceModel.js`:

```js
entry.glance = {
  applyMethod: string | null,   // "Online form" | "Email" | "Online form or email" | "Event registration" | …
  prepSummary: string | null,   // "4 photos · measurements" — one compact line, or null when not known
  gates: string[],              // hard gates only — "Women only", "18+" — never preferences, [] when none
  hasHeadsUp: boolean,          // true when >=1 caution exists worth a single indicator
  checkedOn: string | null,     // "August 19, 2026" — the one trust stamp, formatted, or null
};
```

Nothing else on the entry changed shape, order, or name — `glance` is purely
additive. An entry without a `seriesId` (a Pholio agency with no researched
route behind it) has no `glance` at all; check for its presence before reading
it.

## Where it comes from

- When an authored brief exists for the entry's series id
  (`content/agencyBriefs.js`), `glance` is that brief's own hand-written
  glance, verbatim — including its `gates` and `hasHeadsUp`.
- When none exists yet, `glance` is derived minimally from the route DTO
  already on the entry: `applyMethod` from the channel type, `prepSummary`
  from a shot count when one is actually known, else `null`. `gates` is
  always `[]` and `hasHeadsUp` is always `false` in this fallback — a hard
  gate or a caution is a claim, and nothing safely derives one from a bare
  channel type. This is expected, not a bug: most of the pack has no authored
  brief yet.

## Tier-1 content budget (IA-DESIGN.md)

The Market card is a glance, not a brief. Budget is **six data points, no
prose paragraphs**:

1. Name + market
2. Registered indicator (only from `entry.verification`, unrelated to `glance`)
3. `glance.applyMethod`
4. `glance.prepSummary`
5. `glance.gates` — render only when non-empty, and only as the gate's own
   short phrase ("Women only", "18+"), never restyled
6. `glance.hasHeadsUp` — fold to one indicator, never a count

Footer microcopy: `glance.checkedOn` ("Checked August 19, 2026").

## What NOT to render

Per `client/src/domains/talent/DESIGN.md` and `CLAUDE.md` (read both before
touching Market UI):

- No badges, chips, pills, dots-as-status, eyebrows/kickers, tables, gradient
  text, or glass. `glance.gates` is words in a sentence, not a chip row.
- No file sizes, formats, channel counts, contradiction text, legal detail, or
  minors detail at this tier — that's Tier 2 (the agency brief) and Tier 3
  (apply/preflight), not the card.
- No raw `sourceLabel` strings, research vocabulary (FACT/OBSERVED/etc.), or
  machine field names — `glance` is already talent-facing copy.
- Never invent a gate, a heads-up, or a prep summary the fields above report
  as `null`/`false`/`[]`. Unknown reads as absence at this tier — the full
  "The agency doesn't say" phrasing belongs to Tier 2.
