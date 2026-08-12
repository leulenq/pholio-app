/**
 * Submission conversion + read-clock ageing.
 *
 * The old funnel drew three bands scaled to `entered` next to an outcome column
 * scaled to its own total — two incomparable halves of one picture. This module
 * produces a single ordered ladder where every step carries the count AND the
 * rate off the step above it, so the drop-off is the reading.
 *
 * The read clock answers the question a model actually has about silence: is
 * this submission still normal, or is it past the point where a read usually
 * happens? That needs the platform latency band applied per open submission,
 * not one median dot on an axis.
 */

const { parseDbDate } = require("./db-utils");
const pipeline = require("./pipeline");

/** Steps in the order a submission travels. Order is meaningful — ordinal. */
const STEPS = [
  { key: "sent", label: "Sent" },
  { key: "opened", label: "Opened" },
  { key: "advanced", label: "Advanced" },
  { key: "settled", label: "Represented or kept" },
];

/**
 * Ladder for one flow. `rate` is conversion off the previous step — the number
 * that says where submissions die. Null (not zero) when the previous step is
 * empty, so the frontend can withhold rather than print a fake 0%.
 */
function ladder(flow) {
  if (!flow) return [];
  const settled =
    (Number(flow.outcomes?.represented) || 0) +
    (Number(flow.outcomes?.keptOnFile) || 0);
  const counts = {
    sent: Number(flow.entered) || 0,
    opened: Number(flow.reviewed) || 0,
    advanced: Number(flow.advanced) || 0,
    settled,
  };
  return STEPS.map((step, i) => {
    const count = counts[step.key];
    const prev = i === 0 ? null : counts[STEPS[i - 1].key];
    return {
      ...step,
      count,
      // Conversion off the step above; null when there is no denominator.
      rate: prev == null || prev === 0 ? null : count / prev,
      ofSent: counts.sent === 0 ? null : count / counts.sent,
    };
  });
}

/**
 * The single weakest transition — where this talent loses submissions. Only
 * claimed when the step above it carried enough volume to mean anything.
 */
function weakestStep(steps, { minDenominator = 3 } = {}) {
  let worst = null;
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1];
    if (prev.count < minDenominator) continue;
    const rate = steps[i].rate;
    if (rate == null) continue;
    if (!worst || rate < worst.rate) {
      worst = { from: prev.key, to: steps[i].key, rate, denominator: prev.count };
    }
  }
  return worst;
}

/**
 * Per-submission ageing against the platform read band.
 *
 *  - `read`  — already opened; latency is history, not a decision
 *  - `normal` — unread, still inside the typical window (p75)
 *  - `late`   — unread, past p75: most reads have happened by now
 *  - `cold`   — unread, past 3× p75: the board has moved on
 *
 * Without a platform band (small population) nothing is graded — ages are
 * reported and the states stay `normal`, because calling a submission late
 * against an invented threshold is exactly the failure mode this page had.
 */
function openSubmissions(applications, band, now = new Date()) {
  const p75 = Number(band?.p75);
  const graded = Number.isFinite(p75) && p75 > 0;
  const OPEN = new Set(["submitted", "pending", "reviewing"]);

  return applications
    .filter((app) => OPEN.has(app.status) || pipeline.ADVANCING.has(app.status))
    .map((app) => {
      const created = parseDbDate(app.created_at);
      const ageDays = created
        ? Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000))
        : null;
      const read = Boolean(app.viewed_at);
      const advancing = pipeline.ADVANCING.has(app.status);

      let state = "normal";
      if (read || advancing) state = "read";
      else if (graded && ageDays != null) {
        if (ageDays > p75 * 3) state = "cold";
        else if (ageDays > p75) state = "late";
      }

      return {
        applicationId: app.id,
        agencyName: app.agency_name,
        status: app.status,
        statusLabel: pipeline.STATUS_LABELS[app.status] || app.status,
        ageDays,
        read,
        state,
        urgent: app.status === "requested_more",
      };
    })
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
}

function countStates(rows) {
  return rows.reduce(
    (acc, r) => {
      acc[r.state] = (acc[r.state] || 0) + 1;
      return acc;
    },
    { read: 0, normal: 0, late: 0, cold: 0 },
  );
}

module.exports = { STEPS, ladder, weakestStep, openSubmissions, countStates };
