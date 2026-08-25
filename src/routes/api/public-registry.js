"use strict";

/**
 * The public requirement pages' data source (§7 item 5, §9.6 #2).
 *
 * Unauthenticated on purpose. These pages exist to own "how do I apply to
 * ⟨agency⟩" as a search result, and a search result behind a login is not one.
 * Everything served here is already public on the agency's own site; Pholio's
 * contribution is that it is normalized, dated, and honest about its gaps.
 *
 * THREE THINGS THIS ROUTE HAS TO GET RIGHT.
 *
 * The projection is an allowlist and lives in `public-projection.js`, not here.
 * A route that shaped its own payload would drift the moment a second endpoint
 * wanted the same data.
 *
 * A missing registry is a 503, never a 500 and never an empty 200. This runs on
 * a database that may be one deploy ahead of its migration, and the marketing
 * site will cache what it is given — an empty 200 would be cached as "this
 * agency publishes nothing", which is a lie with a long tail.
 *
 * Responses are cacheable, and deliberately so. The underlying data changes on
 * a research cadence measured in months, the marketing site renders these
 * server-side, and an uncached public endpoint on a serverless function is a
 * bill and an outage waiting for whichever comes first.
 */

const express = require("express");
const knex = require("../../shared/db/knex");
const {
  getRegistryRoute,
  listRegistryRoutes,
} = require("../../domains/spec-registry/preflight-service");
const {
  publicAgencyDto,
  publicAgencySummaryDto,
} = require("../../domains/spec-registry/public-projection");
const { getCurrentRevision } = require("../../domains/spec-registry/store/repository");

const router = express.Router();

/**
 * Long enough that a crawl or a traffic spike costs one origin hit per window,
 * short enough that a corrected requirement reaches readers the same day.
 * `stale-while-revalidate` keeps the page up while that refresh happens.
 */
const CACHE_CONTROL = "public, max-age=1800, stale-while-revalidate=86400";

function cacheable(res) {
  res.set("Cache-Control", CACHE_CONTROL);
  return res;
}

/** Registry tables absent (deploy ahead of migrate) — say so, do not invent. */
function unavailable(res) {
  // No-store: a 503 cached for half an hour would outlive the deploy that fixes it.
  res.set("Cache-Control", "no-store");
  return res.status(503).json({
    success: false,
    error: "registry_unavailable",
    message: "The agency registry is briefly unavailable.",
  });
}

/**
 * GET /api/public/registry/agencies
 *
 * Every listed agency Pholio holds published requirements for. Delisted series
 * never appear: `getCurrentRevision` and `listCurrentRoutes` both drop them at
 * the repository, so absence here is structural rather than a filter this
 * handler could forget.
 */
router.get("/agencies", async (req, res, next) => {
  try {
    const result = await listRegistryRoutes(knex);
    if (!result?.available) return unavailable(res);

    const agencies = (result.routes || []).map(publicAgencySummaryDto);
    return cacheable(res).json({
      success: true,
      data: {
        agencies,
        count: agencies.length,
        // What the reader is looking at, in one line, so a page rendering this
        // never has to describe the dataset in its own words.
        about:
          "Requirements researched from each agency's own published pages. Pholio is not affiliated with any agency listed here.",
      },
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/public/registry/agencies/:seriesId
 *
 * One agency's published requirements, including what they do not publish.
 */
router.get("/agencies/:seriesId", async (req, res, next) => {
  try {
    const seriesId = String(req.params.seriesId || "").trim();
    if (!seriesId || seriesId.length > 200) {
      return res
        .status(400)
        .json({ success: false, error: "invalid_series_id" });
    }

    const route = await getRegistryRoute(knex, seriesId);
    if (!route) {
      // 404 for absent, delisted and never-existed alike. Distinguishing them
      // would tell a crawler which agencies Pholio has removed and when, which
      // is a fact about Pholio's editorial decisions rather than about the
      // agency, and none of a stranger's business.
      res.set("Cache-Control", "public, max-age=300");
      return res.status(404).json({ success: false, error: "not_found" });
    }

    const revision = await getCurrentRevision(knex, seriesId);
    if (!revision?.payload) return unavailable(res);

    return cacheable(res).json({
      success: true,
      data: publicAgencyDto(route, revision.payload),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
