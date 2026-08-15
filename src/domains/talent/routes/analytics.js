const express = require("express");
const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");

/**
 * Helper function to format time ago
 */
function getTimeAgo(date) {
  if (!date) return "Unknown";
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  return then.toLocaleDateString();
}

function parseActivityMetadata(rawMetadata) {
  if (!rawMetadata) return {};
  if (typeof rawMetadata === "object") return rawMetadata;
  if (typeof rawMetadata === "string") {
    try {
      return JSON.parse(rawMetadata);
    } catch {
      return {};
    }
  }
  return {};
}

function analyticsWindowDays(rawDays, fallback = 30) {
  const parsed = Number.parseInt(rawDays, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 90);
}

function startOfUtcDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function websiteAnalyticsWindow(days, now = new Date()) {
  const currentStart = startOfUtcDay(
    new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000),
  );
  const previousStart = new Date(
    currentStart.getTime() - days * 24 * 60 * 60 * 1000,
  );

  return {
    currentStart,
    currentEnd: now,
    previousStart,
    previousEnd: currentStart,
  };
}

function countValue(row) {
  return Number(row?.total ?? row?.count ?? 0);
}

function calculatePeriodChange(current, previous) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function applyTimestampRange(
  query,
  {
    column,
    start,
    end,
    endInclusive = true,
    isPostgres,
  },
) {
  if (isPostgres) {
    query.where(column, ">=", start);
    query.where(column, endInclusive ? "<=" : "<", end);
    return query;
  }

  query.whereRaw("datetime(??) >= datetime(?)", [
    column,
    start.toISOString(),
  ]);
  query.whereRaw(`datetime(??) ${endInclusive ? "<=" : "<"} datetime(?)`, [
    column,
    end.toISOString(),
  ]);
  return query;
}

function emptyWebsiteAnalytics(days) {
  const { currentStart, currentEnd } = websiteAnalyticsWindow(days);
  const series = [];

  for (let offset = 0; offset < days; offset += 1) {
    series.push({
      date: new Date(
        currentStart.getTime() + offset * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .slice(0, 10),
      visits: 0,
    });
  }

  return {
    status: "connected",
    source: "first_party",
    period: {
      days,
      start: currentStart.toISOString(),
      end: currentEnd.toISOString(),
    },
    metrics: {
      visits: 0,
      uniqueVisitors: 0,
      returningVisitors: 0,
      pageViews: 0,
      outboundClicks: 0,
    },
    measurement: {
      uniqueVisitors: "complete",
    },
    trend: {
      visitsChangePct: null,
      hasPriorBaseline: false,
    },
    sources: [],
    series,
    hasData: false,
  };
}

/**
 * GET /api/talent/analytics
 * Get analytics data for the profile
 */
router.get(
  "/analytics",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const breakdownDays = analyticsWindowDays(req.query.days);
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first();

    if (!profile) {
      return res.json({
        success: true,
        data: {
          views: { total: 0, thisWeek: 0, thisMonth: 0 },
          downloads: { total: 0, thisWeek: 0, thisMonth: 0, byTheme: [] },
          website: emptyWebsiteAnalytics(breakdownDays),
        },
      });
    }

    // Determine DB client for JSON extraction
    const isPostgres = knex.client.config.client === "pg";
    const jsonExtract = (field, path) =>
      isPostgres
        ? knex.raw(`metadata->>'${path}' as ${path}`)
        : knex.raw(`json_extract(metadata, '$.${path}') as ${path}`);

    // Dynamic Date Filter
    const daysParam = req.query.days ? breakdownDays : null;

    const filterDate = new Date();
    filterDate.setDate(filterDate.getDate() - breakdownDays);

    // Helper for counts
    const getCount = async (type, dateFilter) => {
      const query = knex("analytics").where({
        profile_id: profile.id,
        event_type: type,
      });
      if (dateFilter) query.where("created_at", ">=", dateFilter);
      const res = await query.count({ total: "*" }).first();
      return Number(res?.total || 0);
    };

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // If days param provided, filter totals by it. Otherwise, all time.
    const totalFilter = daysParam ? filterDate : null;

    const [
      viewsTotal,
      downloadsTotal,
      viewsThisWeek,
      downloadsThisWeek,
      engagementEvents,
    ] = await Promise.all([
      getCount("view", totalFilter),
      getCount("download", totalFilter),
      getCount("view", weekAgo),
      getCount("download", weekAgo),
      knex("analytics")
        .where({ profile_id: profile.id })
        .where("created_at", ">=", filterDate)
        .whereIn("event_type", [
          "bio_read",
          "social_click",
          "portfolio_click",
          "scroll_depth",
        ])
        .select("event_type")
        .count({ total: "*" })
        .groupBy("event_type"),
    ]);

    // Format engagement events for easier consumption
    const engagementMap = engagementEvents.reduce((acc, curr) => {
      acc[curr.event_type] = Number(curr.total);
      return acc;
    }, {});

    // Get views by source (referrer)
    const viewsBySource = await knex("analytics")
      .where({ profile_id: profile.id, event_type: "view" })
      .where("created_at", ">=", filterDate)
      .select(jsonExtract("metadata", "referrer"))
      .count({ total: "*" })
      .groupBy("referrer");

    // Helper to categorize referrers
    const categorizeReferrer = (ref) => {
      if (!ref) return "Direct";
      const lowRef = ref.toLowerCase();
      if (
        lowRef.includes("instagram.com") ||
        lowRef.includes("t.co") ||
        lowRef.includes("facebook.com")
      )
        return "Social Media";
      if (lowRef.includes("google.com") || lowRef.includes("bing.com"))
        return "Search Engine";
      return "External Links";
    };

    const sourceBreakdownMap = viewsBySource.reduce((acc, curr) => {
      const cat = categorizeReferrer(curr.referrer);
      acc[cat] = (acc[cat] || 0) + Number(curr.total);
      return acc;
    }, {});

    // Get downloads by theme
    const downloadsByTheme = await knex("analytics")
      .where({ profile_id: profile.id, event_type: "download" })
      .where("created_at", ">=", filterDate)
      .select(jsonExtract("metadata", "theme"))
      .count({ total: "*" })
      .groupBy("theme");

    const {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
    } = websiteAnalyticsWindow(breakdownDays);

    const [
      currentVisitsRow,
      previousVisitsRow,
      identifiedVisitsRow,
      uniqueVisitorsRow,
      returningVisitsRow,
      websitePageViewsRow,
      outboundClicksRow,
      websiteReferrerRows,
      dailyVisits,
    ] = await Promise.all([
      knex("visitor_sessions")
        .where({ profile_id: profile.id })
        .modify((query) =>
          applyTimestampRange(query, {
            column: "started_at",
            start: currentStart,
            end: currentEnd,
            isPostgres,
          }),
        )
        .count({ total: "*" })
        .first(),
      knex("visitor_sessions")
        .where({ profile_id: profile.id })
        .modify((query) =>
          applyTimestampRange(query, {
            column: "started_at",
            start: previousStart,
            end: previousEnd,
            endInclusive: false,
            isPostgres,
          }),
        )
        .count({ total: "*" })
        .first(),
      knex("visitor_sessions")
        .where({ profile_id: profile.id })
        .modify((query) =>
          applyTimestampRange(query, {
            column: "started_at",
            start: currentStart,
            end: currentEnd,
            isPostgres,
          }),
        )
        .whereNotNull("visitor_id")
        .count({ total: "*" })
        .first(),
      knex("visitor_sessions")
        .where({ profile_id: profile.id })
        .modify((query) =>
          applyTimestampRange(query, {
            column: "started_at",
            start: currentStart,
            end: currentEnd,
            isPostgres,
          }),
        )
        .whereNotNull("visitor_id")
        .countDistinct({ total: "visitor_id" })
        .first(),
      // Count repeat sessions as an observed traffic fact; do not infer intent.
      knex("visitor_sessions")
        .where({ profile_id: profile.id })
        .modify((query) =>
          applyTimestampRange(query, {
            column: "started_at",
            start: currentStart,
            end: currentEnd,
            isPostgres,
          }),
        )
        .where("is_returning", true)
        .count({ total: "*" })
        .first(),
      knex("analytics")
        .where({ profile_id: profile.id, event_type: "view" })
        .modify((query) =>
          applyTimestampRange(query, {
            column: "created_at",
            start: currentStart,
            end: currentEnd,
            isPostgres,
          }),
        )
        .count({ total: "*" })
        .first(),
      knex("analytics")
        .where({ profile_id: profile.id })
        .whereIn("event_type", ["social_click", "portfolio_click"])
        .modify((query) =>
          applyTimestampRange(query, {
            column: "created_at",
            start: currentStart,
            end: currentEnd,
            isPostgres,
          }),
        )
        .count({ total: "*" })
        .first(),
      // Session-level referrers (not view events): "who sent these people" is
      // answered per visitor, so it stays consistent with the visitor counts.
      knex("visitor_sessions")
        .where({ profile_id: profile.id })
        .modify((query) =>
          applyTimestampRange(query, {
            column: "started_at",
            start: currentStart,
            end: currentEnd,
            isPostgres,
          }),
        )
        .select("referrer")
        .count({ total: "*" })
        .groupBy("referrer"),
      knex("visitor_sessions")
        .where({ profile_id: profile.id })
        .modify((query) =>
          applyTimestampRange(query, {
            column: "started_at",
            start: currentStart,
            end: currentEnd,
            isPostgres,
          }),
        )
        .select(knex.raw("DATE(started_at) as date"))
        .count({ total: "*" })
        .groupBy("date")
        .orderBy("date", "asc"),
    ]);

    const visits = countValue(currentVisitsRow);
    const previousVisits = countValue(previousVisitsRow);
    const identifiedVisits = countValue(identifiedVisitsRow);
    const uniqueVisitors = countValue(uniqueVisitorsRow);
    const returningVisitors = countValue(returningVisitsRow);
    const pageViews = countValue(websitePageViewsRow);
    const outboundClicks = countValue(outboundClicksRow);
    const websiteSourceMap = websiteReferrerRows.reduce((acc, row) => {
      const label = categorizeReferrer(row.referrer);
      acc[label] = (acc[label] || 0) + countValue(row);
      return acc;
    }, {});
    const websiteSources = Object.entries(websiteSourceMap)
      .map(([label, count]) => ({
        label,
        visits: count,
        percentage: visits > 0 ? Math.round((count / visits) * 100) : 0,
      }))
      .sort((a, b) => b.visits - a.visits);
    const dailyVisitMap = new Map(
      dailyVisits.map((row) => {
        const date =
          typeof row.date === "string"
            ? row.date.slice(0, 10)
            : new Date(row.date).toISOString().slice(0, 10);
        return [date, countValue(row)];
      }),
    );
    const websiteSeries = [];

    for (let offset = 0; offset < breakdownDays; offset += 1) {
      const date = new Date(
        currentStart.getTime() + offset * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .slice(0, 10);
      websiteSeries.push({
        date,
        visits: dailyVisitMap.get(date) || 0,
      });
    }

    return res.json({
      success: true,
      data: {
        views: {
          total: viewsTotal,
          thisWeek: viewsThisWeek,
          thisMonth: viewsTotal, // Last 30 days = thisMonth
          latestSourceBreakdown: Object.entries(sourceBreakdownMap).map(
            ([label, count]) => ({
              label,
              percentage:
                viewsTotal > 0 ? Math.round((count / viewsTotal) * 100) : 0,
              count,
            }),
          ),
        },
        downloads: {
          total: downloadsTotal,
          thisWeek: downloadsThisWeek,
          thisMonth: downloadsTotal, // Last 30 days = thisMonth
          byTheme: downloadsByTheme.map((item) => ({
            theme: item.theme || "unknown",
            count: Number(item.total || 0),
          })),
        },
        // Raw event counts only; passive activity does not establish intent.
        engagement: {
          counts: engagementMap,
        },
        website: {
          status: "connected",
          source: "first_party",
          period: {
            days: breakdownDays,
            start: currentStart.toISOString(),
            end: currentEnd.toISOString(),
          },
          metrics: {
            visits,
            uniqueVisitors,
            returningVisitors,
            pageViews,
            outboundClicks,
          },
          measurement: {
            uniqueVisitors:
              visits === 0 || identifiedVisits === visits
                ? "complete"
                : "partial",
          },
          trend: {
            visitsChangePct: calculatePeriodChange(visits, previousVisits),
            hasPriorBaseline: previousVisits > 0,
          },
          sources: websiteSources,
          series: websiteSeries,
          hasData: visits > 0 || pageViews > 0 || outboundClicks > 0,
        },
      },
    });
  }),
);

/**
 * GET /api/talent/activity
 * Get activity feed for the user
 */
router.get(
  "/activity",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const activities = await knex("activities")
      .where({ user_id: req.session.userId })
      .orderBy("created_at", "desc")
      .limit(10);

    // Format activities
    const formattedActivities = activities.map((activity) => {
      const metadata = parseActivityMetadata(activity.metadata);

      let message = "";
      let icon = "📝";

      switch (activity.activity_type) {
        case "profile_updated":
          message = "Profile updated";
          icon = "✏️";
          break;
        case "image_uploaded":
          const imageCount = metadata.imageCount || 1;
          message = `${imageCount} image${imageCount > 1 ? "s" : ""} uploaded`;
          icon = "📷";
          break;
        case "pdf_downloaded":
          const theme = metadata.theme || "default";
          message = `PDF downloaded (${theme} theme)`;
          icon = "📄";
          break;
        case "portfolio_viewed":
          message = "Portfolio viewed";
          icon = "👁️";
          break;
        case "submission_package_created": {
          const n = metadata.imageCount ?? 0;
          message =
            n > 0
              ? `Submission package saved (${n} image${n !== 1 ? "s" : ""})`
              : "Submission package saved";
          icon = "📦";
          break;
        }
        default:
          message = "Activity recorded";
          icon = "📝";
      }

      return {
        id: activity.id,
        type: activity.activity_type,
        message,
        icon,
        metadata,
        createdAt: activity.created_at,
        timeAgo: getTimeAgo(activity.created_at),
      };
    });

    return res.json({
      success: true,
      data: formattedActivities,
    });
  }),
);

/**
 * GET /api/talent/analytics/summary
 * Get summary stats for dashboard overview
 */
const { calculateProfileCompleteness } = require("../services/completeness");

router.get(
  "/summary",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first();

    if (!profile) {
      return apiResponse.success(res, {
        views: { total: 0, change: "0%", trend: "neutral" },
        downloads: { total: 0, change: "0%", trend: "neutral" },
        completeness: { percentage: 0, missingItems: [] },
      });
    }

    // Fetch images for completeness calculation
    const images = await knex("images")
      .where({ profile_id: profile.id })
      .orderBy("sort", "asc")
      .select("id", "path", "label as kind", "created_at");

    // Use the shared source of truth for calculations
    const completenessResult = calculateProfileCompleteness(profile, images);

    // Extract missing items from incomplete sections
    const missingItems = [];
    Object.entries(completenessResult.sections).forEach(([key, section]) => {
      if (!section.complete) {
        // Use the friendly message from the section
        missingItems.push(section.message);
      }
    });

    // Ensure we limit to top 3 missing items to not overwhelm the UI card
    const topMissingItems = missingItems.slice(0, 3);

    const completeness = completenessResult.percentage;

    // --- Analytics Trends Logic ---
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [currentViews, funcPrevViews, currentDownloads, funcPrevDownloads] =
      await Promise.all([
        knex("analytics")
          .where({ profile_id: profile.id, event_type: "view" })
          .whereBetween("created_at", [thirtyDaysAgo, now])
          .count("* as count")
          .first(),
        knex("analytics")
          .where({ profile_id: profile.id, event_type: "view" })
          .whereBetween("created_at", [sixtyDaysAgo, thirtyDaysAgo])
          .count("* as count")
          .first(),
        knex("analytics")
          .where({ profile_id: profile.id, event_type: "download" })
          .whereBetween("created_at", [thirtyDaysAgo, now])
          .count("* as count")
          .first(),
        knex("analytics")
          .where({ profile_id: profile.id, event_type: "download" })
          .whereBetween("created_at", [sixtyDaysAgo, thirtyDaysAgo])
          .count("* as count")
          .first(),
      ]);

    const calcTrend = (current, previous) => {
      const cur = Number(current?.count || 0);
      const prev = Number(previous?.count || 0);

      if (prev === 0) {
        const changePct = cur > 0 ? 100 : 0;
        return {
          change: cur > 0 ? "+100%" : "0%",
          changePct,
          trend: cur > 0 ? "up" : "neutral",
        };
      }

      const percent = ((cur - prev) / prev) * 100;
      const changePct = Math.round(percent);
      const sign = percent > 0 ? "+" : "";
      const trend = percent > 0 ? "up" : percent < 0 ? "down" : "neutral";

      return { change: `${sign}${changePct}%`, changePct, trend };
    };

    const viewsTrend = calcTrend(currentViews, funcPrevViews);
    const downloadsTrend = calcTrend(currentDownloads, funcPrevDownloads);

    // Calculate thisWeek and thisMonth for Free tier display
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [thisWeekViews, thisWeekDownloads] = await Promise.all([
      knex("analytics")
        .where({ profile_id: profile.id, event_type: "view" })
        .whereBetween("created_at", [sevenDaysAgo, now])
        .count("* as count")
        .first(),
      knex("analytics")
        .where({ profile_id: profile.id, event_type: "download" })
        .whereBetween("created_at", [sevenDaysAgo, now])
        .count("* as count")
        .first(),
    ]);

    apiResponse.success(res, {
      views: {
        total: Number(currentViews?.count || 0),
        thisWeek: Number(thisWeekViews?.count || 0),
        thisMonth: Number(currentViews?.count || 0), // Last 30 days = thisMonth
        change: viewsTrend.change,
        changePct: viewsTrend.changePct,
        trend: viewsTrend.trend,
      },
      downloads: {
        total: Number(currentDownloads?.count || 0),
        thisWeek: Number(thisWeekDownloads?.count || 0),
        thisMonth: Number(currentDownloads?.count || 0), // Last 30 days = thisMonth
        change: downloadsTrend.change,
        changePct: downloadsTrend.changePct,
        trend: downloadsTrend.trend,
      },
      completeness: {
        percentage: completeness,
        missingItems: topMissingItems,
      },
    });
  }),
);

/**
 * GET /api/talent/analytics/timeseries
 * Get daily analytics data for charts
 */
router.get(
  "/timeseries",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first();

    if (!profile) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const requestedDays = parseInt(req.query.days) || 30;
    const isPro = profile.is_pro || false;

    // Enforce tier-based limits
    // Free users: max 7 days
    // Studio+ users: max 90 days
    const maxDays = isPro ? 90 : 7;
    const days = Math.min(requestedDays, maxDays);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get daily counts grouped by date
    const rawData = await knex("analytics")
      .where({ profile_id: profile.id })
      .where("created_at", ">=", startDate)
      .select(
        knex.raw("DATE(created_at) as date"),
        "event_type",
        knex.raw("COUNT(*) as count"),
      )
      .groupBy("date", "event_type")
      .orderBy("date", "asc");

    // Transform into a format suitable for charts: { date, views, downloads }
    const dataMap = {};

    // Initialize all dates in range with zeros
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - days + i + 1);
      const dateStr = d.toISOString().split("T")[0];
      dataMap[dateStr] = { date: dateStr, views: 0, downloads: 0 };
    }

    // Fill in actual data
    rawData.forEach((row) => {
      const dateStr =
        typeof row.date === "string"
          ? row.date
          : new Date(row.date).toISOString().split("T")[0];
      if (!dataMap[dateStr]) {
        dataMap[dateStr] = { date: dateStr, views: 0, downloads: 0 };
      }
      if (row.event_type === "view") {
        dataMap[dateStr].views = Number(row.count);
      } else if (row.event_type === "download") {
        dataMap[dateStr].downloads = Number(row.count);
      }
    });

    const data = Object.values(dataMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    res.json({
      success: true,
      data,
    });
  }),
);

/* Fabricated insight multipliers and retention cohorts are intentionally absent. */

/**
 * GET /api/talent/analytics/sessions
 * Get daily session data for charts
 */
router.get(
  "/sessions",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first();
    if (!profile) return res.json({ success: true, data: [] });

    const requestedDays = parseInt(req.query.days) || 30;
    const isPro = profile.is_pro || false;
    const maxDays = isPro ? 90 : 7;
    const days = Math.min(requestedDays, maxDays);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const rawSessions = await knex("visitor_sessions")
      .where({ profile_id: profile.id })
      .where("started_at", ">=", startDate)
      .select(
        knex.raw("DATE(started_at) as date"),
        knex.raw("COUNT(*) as count"),
      )
      .groupBy("date")
      .orderBy("date", "asc");

    // Format for chart
    const dataMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - days + i + 1);
      const dateStr = d.toISOString().split("T")[0];
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      dataMap[dateStr] = { date: dateStr, time: dayName, value: 0 };
    }

    rawSessions.forEach((row) => {
      const dateStr =
        typeof row.date === "string"
          ? row.date
          : new Date(row.date).toISOString().split("T")[0];
      if (dataMap[dateStr]) {
        dataMap[dateStr].value = Number(row.count);
      }
    });

    const data = Object.values(dataMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    res.json({
      success: true,
      data,
    });
  }),
);

/**
 * GET /api/talent/analytics/export
 * Export analytics data as CSV (Studio+ only)
 */
router.get(
  "/analytics/export",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first();

    if (!profile) return res.status(404).json({ error: "Profile not found" });

    // Allow debug mode to bypass subscription check
    const isDebugPro = req.query.debug === "pro";
    if (!profile.is_pro && !isDebugPro)
      return res.status(403).json({ error: "Studio+ subscription required" });

    const days = 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch daily stats
    const rawData = await knex("analytics")
      .where({ profile_id: profile.id })
      .where("created_at", ">=", startDate)
      .select(
        knex.raw("DATE(created_at) as date"),
        "event_type",
        knex.raw("COUNT(*) as count"),
      )
      .groupBy("date", "event_type")
      .orderBy("date", "asc");

    // Process data
    const dataMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - days + i + 1);
      const dateStr = d.toISOString().split("T")[0];
      dataMap[dateStr] = { date: dateStr, views: 0, downloads: 0 };
    }

    rawData.forEach((row) => {
      const dateStr =
        typeof row.date === "string"
          ? row.date
          : new Date(row.date).toISOString().split("T")[0];
      if (dataMap[dateStr]) {
        if (row.event_type === "view")
          dataMap[dateStr].views = Number(row.count);
        if (row.event_type === "download")
          dataMap[dateStr].downloads = Number(row.count);
      }
    });

    // Generate CSV
    const csvRows = ["Date,Profile Views,Comp Card Downloads"];
    Object.values(dataMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((row) => {
        csvRows.push(`${row.date},${row.views},${row.downloads}`);
      });

    const csvContent = csvRows.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="pholio_analytics.csv"',
    );
    res.send(csvContent);
  }),
);

module.exports = router;
