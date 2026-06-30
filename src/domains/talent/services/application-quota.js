"use strict";

const FREE_MONTHLY_APPLICATION_LIMIT = 5;

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

async function loadApplicationQuota(db, profile, referenceDate = new Date()) {
  const { periodStart, periodEnd } = utcMonthWindow(referenceDate);
  const unlimited = Boolean(profile?.is_pro);
  let countQuery = db("application_submission_requests")
    .where({ profile_id: profile.id, status: "completed" })
    .whereNotNull("completed_at");
  if (db.client.config.client === "sqlite3") {
    countQuery = countQuery
      .whereRaw("datetime(completed_at) >= datetime(?)", [
        periodStart.toISOString(),
      ])
      .whereRaw("datetime(completed_at) < datetime(?)", [
        periodEnd.toISOString(),
      ]);
  } else {
    countQuery = countQuery
      .where("completed_at", ">=", periodStart)
      .where("completed_at", "<", periodEnd);
  }
  const count = await countQuery.count({ count: "*" }).first();
  const used = Number(count?.count || 0);
  const limit = unlimited ? null : FREE_MONTHLY_APPLICATION_LIMIT;

  return {
    used,
    limit,
    remaining: unlimited ? null : Math.max(0, limit - used),
    unlimited,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

module.exports = {
  FREE_MONTHLY_APPLICATION_LIMIT,
  loadApplicationQuota,
  utcMonthWindow,
};
