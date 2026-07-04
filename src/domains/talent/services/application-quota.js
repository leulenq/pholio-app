"use strict";

const FREE_MONTHLY_APPLICATION_LIMIT = 5;

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
  const unlimited = Boolean(profile?.is_pro);
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

  const limit = unlimited ? null : FREE_MONTHLY_APPLICATION_LIMIT;

  return {
    used,
    limit,
    remaining: unlimited ? null : Math.max(0, limit - used),
    unlimited,
    exemptUsed,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

module.exports = {
  FREE_MONTHLY_APPLICATION_LIMIT,
  loadApplicationQuota,
  utcMonthWindow,
};
