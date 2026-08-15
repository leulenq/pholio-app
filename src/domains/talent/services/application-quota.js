"use strict";

// A flat anti-spam ceiling on platform-discovery submissions. No tier lifts
// it. Selling a higher submission ceiling would make Pholio a "talent listing
// service" under Cal. Lab. Code §1701 (storage/distribution of promotional
// material to purported opportunity-givers, for a fee), which carries a
// $50,000 bond, mandatory contract disclosures and a 10-business-day
// cancellation right. Studio+ sells talent-owned artifacts only, and nothing
// that touches the submission pipeline.
const MONTHLY_DISCOVERY_SUBMISSION_LIMIT = 5;

// Deploy-before-migrate guard: quota math must not throw while the
// quota_exempt column is still rolling out. Checked once per process.
let quotaExemptColumnPromise = null;
function hasQuotaExemptColumn(db) {
  if (!quotaExemptColumnPromise) {
    quotaExemptColumnPromise = db.schema
      .hasColumn("application_submission_requests", "quota_exempt")
      .catch(() => {
        quotaExemptColumnPromise = null;
        return false;
      });
  }
  return quotaExemptColumnPromise;
}

function utcMonthWindow(referenceDate = new Date()) {
  const reference =
    referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const periodStart = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1),
  );
  const periodEnd = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1),
  );
  return { periodStart, periodEnd };
}

function monthWindowQuery(db, query, periodStart, periodEnd) {
  if (db.client.config.client === "sqlite3") {
    return query
      .whereRaw("datetime(completed_at) >= datetime(?)", [
        periodStart.toISOString(),
      ])
      .whereRaw("datetime(completed_at) < datetime(?)", [
        periodEnd.toISOString(),
      ]);
  }
  return query
    .where("completed_at", ">=", periodStart)
    .where("completed_at", "<", periodEnd);
}

async function loadApplicationQuota(db, profile, referenceDate = new Date()) {
  const { periodStart, periodEnd } = utcMonthWindow(referenceDate);
  const exemptAware = await hasQuotaExemptColumn(db);

  // Only platform-discovery submissions count toward the monthly limit.
  // Open-call (agency-invited) submissions are recorded quota_exempt.
  let countQuery = db("application_submission_requests")
    .where({ profile_id: profile.id, status: "completed" })
    .whereNotNull("completed_at");
  if (exemptAware) {
    countQuery = countQuery.where({ quota_exempt: false });
  }
  countQuery = monthWindowQuery(db, countQuery, periodStart, periodEnd);
  const count = await countQuery.count({ count: "*" }).first();
  const used = Number(count?.count || 0);

  let exemptUsed = 0;
  if (exemptAware) {
    let exemptQuery = db("application_submission_requests")
      .where({ profile_id: profile.id, status: "completed", quota_exempt: true })
      .whereNotNull("completed_at");
    exemptQuery = monthWindowQuery(db, exemptQuery, periodStart, periodEnd);
    const exemptCount = await exemptQuery.count({ count: "*" }).first();
    exemptUsed = Number(exemptCount?.count || 0);
  }

  const limit = MONTHLY_DISCOVERY_SUBMISSION_LIMIT;

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    exemptUsed,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

module.exports = {
  MONTHLY_DISCOVERY_SUBMISSION_LIMIT,
  loadApplicationQuota,
  utcMonthWindow,
};
