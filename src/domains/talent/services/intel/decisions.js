/**
 * The decision stack — what this talent should actually do next.
 *
 * This replaces the old `materials.nextMoves`, which could only see materials
 * and so produced the same three tips for everyone. Decisions here are ranked
 * by expected effect on tier 1–2 signal (an agency reading you, a submission
 * advancing) and every one carries the number that triggered it: a talent
 * should be able to check the claim against the chart beside it.
 *
 * Nothing is emitted without evidence. An empty stack is a real answer — it
 * means the package is current and the pipeline is moving — and the caller
 * renders it as such rather than padding with advice.
 */

const STEP_LABEL = {
  sent: "sent",
  opened: "opened",
  advanced: "advanced",
  settled: "signed or kept",
};

function plural(n, one, many) {
  return Number(n) === 1 ? one : many || `${one}s`;
}

/**
 * @param {object} input
 * @param {Array}  input.materials   currency items (digitals / measurements / card)
 * @param {Array}  input.range       range coverage rows
 * @param {Array}  input.open        open submissions with ageing state
 * @param {object} input.states      counts by ageing state
 * @param {Array}  input.steps       funnel ladder
 * @param {object} input.weakest     weakest transition, or null
 * @param {object} input.band        platform read band, or null
 * @param {number} input.periodDays
 */
function buildDecisions({
  materials = [],
  range = [],
  open = [],
  states = {},
  steps = [],
  weakest = null,
  band = null,
  periodDays = 30,
}) {
  const out = [];
  const byKey = Object.fromEntries(materials.map((m) => [m.key, m]));
  const sent = steps.find((s) => s.key === "sent")?.count ?? 0;

  // 1. A board asked for more. Response time is part of the read.
  const requested = open.filter((r) => r.urgent);
  for (const row of requested.slice(0, 2)) {
    out.push({
      key: `respond:${row.applicationId}`,
      severity: "act",
      headline: `${row.agencyName} asked for more materials${
        row.ageDays != null ? ` ${row.ageDays} ${plural(row.ageDays, "day")} ago` : ""
      }.`,
      reason: "The strongest signal a live submission carries. Response time is read as part of it.",
      action: "Send what they asked for",
      to: "/dashboard/talent/applications",
    });
  }

  // 2. Digitals are what a board rejects a package over first.
  const digitals = byKey.digitals;
  if (digitals && digitals.state !== "current") {
    const weeks = digitals.ageDays == null ? null : Math.round(digitals.ageDays / 7);
    out.push({
      key: "digitals",
      severity: digitals.state === "current" ? "fix" : "act",
      headline:
        digitals.state === "missing"
          ? "You have no digitals."
          : `Your digitals are ${weeks} ${plural(weeks, "week")} old — ${digitals.daysOver} ${plural(
              digitals.daysOver,
              "day",
            )} past the 12-week window.`,
      reason: "Boards measure you against unretouched digitals. Past 12 weeks they get re-requested.",
      action: "Shoot fresh digitals",
      to: "/dashboard/talent/media",
    });
  }

  // 3. A gap in the three frames every booker scans for.
  const missing = range.filter((r) => !r.present);
  if (missing.length > 0) {
    out.push({
      key: "range",
      severity: "act",
      headline: `Your book is missing ${missing
        .map((r) => r.label.toLowerCase())
        .join(" and ")}.`,
      reason: "Headshot, full length and profile are checked before the work. A gap reads as unfinished.",
      action: "Add the missing frames",
      to: "/dashboard/talent/media",
    });
  }

  // 4. Submissions past the window where reads normally happen.
  const stale = (states.late || 0) + (states.cold || 0);
  if (stale > 0 && band?.p75) {
    out.push({
      key: "stalled",
      severity: "fix",
      headline: `${stale} ${plural(stale, "submission")} ${plural(
        stale,
        "is",
        "are",
      )} unread past ${Math.round(band.p75)} days — the point by which most reads have happened.`,
      reason: "A board that hasn't opened you by now usually won't. More boards beats more waiting.",
      action: "Submit to other agencies",
      to: "/dashboard/talent/agencies",
    });
  }

  // 5. Where submissions actually die — only when the step above carries volume.
  if (weakest && weakest.rate < 0.5) {
    const isOpenGap = weakest.to === "opened";
    out.push({
      key: `funnel:${weakest.from}-${weakest.to}`,
      severity: "fix",
      headline: `Only ${Math.round(weakest.rate * 100)}% of your ${
        STEP_LABEL[weakest.from]
      } submissions ${STEP_LABEL[weakest.to]} (${weakest.denominator} ${plural(
        weakest.denominator,
        "submission",
      )}).`,
      reason: isOpenGap
        ? "Never being opened is a targeting problem, not a materials one."
        : "Boards open you and stop. That gap is the package, not the targeting.",
      action: isOpenGap ? "Widen where you submit" : "Strengthen the package",
      to: isOpenGap ? "/dashboard/talent/agencies" : "/dashboard/talent/media",
    });
  }

  // 6. Stats a booker works from.
  const measurements = byKey.measurements;
  if (measurements && measurements.state !== "current") {
    out.push({
      key: "measurements",
      severity: "fix",
      headline:
        measurements.state === "missing"
          ? "Your measurements have never been confirmed."
          : `Your measurements were last confirmed ${measurements.ageDays} days ago.`,
      reason: "Bookers work from current numbers. Stats over 90 days get re-asked first.",
      action: "Re-confirm your stats",
      to: "/dashboard/talent/profile",
    });
  }

  // 7. The card is what gets pulled and filed.
  const card = byKey.card;
  if (card && card.state !== "current") {
    out.push({
      key: "card",
      severity: "fix",
      headline:
        card.state === "missing"
          ? "You have no comp card."
          : "Your comp card predates your current book.",
      reason: "The card is what gets pulled, filed and passed around a board.",
      action: "Regenerate your card",
      to: "/dashboard/talent/media",
    });
  }

  // 8. Current package, nothing out. The window to use it is now.
  if (sent === 0 && open.length === 0 && out.length === 0 && periodDays >= 30) {
    out.push({
      key: "submit",
      severity: "grow",
      headline: "Your package is current and nothing is out.",
      reason: "Materials only age from here. Spend them while they still represent you.",
      action: "Submit to an agency",
      to: "/dashboard/talent/agencies",
    });
  }

  return out.slice(0, 4);
}

module.exports = { buildDecisions };
