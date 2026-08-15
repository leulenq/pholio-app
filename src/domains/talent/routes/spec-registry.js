"use strict";

const express = require("express");
const { validate: isUuid } = require("uuid");

const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");
const apiResponse = require("../../../shared/lib/api-response");
const {
  SpecRegistryServiceError,
  getRegistryRoute,
  listRegistryRoutes,
  preflightRegistry,
} = require("../../spec-registry/preflight-service");
const { buildSpecExport } = require("../../spec-registry/export/spec-export-service");
const {
  EVENT_TYPES,
  recordEngagement,
} = require("../../spec-registry/engagement-service");

const router = express.Router();
const SERIES_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,179}$/;
const REVISION_ID_PATTERN = /^[a-z0-9][a-z0-9:_@-]{0,199}$/;
const MAX_SERIES = 25;
const MAX_IMAGES = 100;

function invalid(message, details = null) {
  return new SpecRegistryServiceError(
    "SPEC_REGISTRY_REQUEST_INVALID",
    message,
    422,
    details,
  );
}

function normalizedUuid(value, field, { optional = true } = {}) {
  if (value === null || value === undefined || value === "") {
    if (optional) return null;
    throw invalid(`${field} is required`);
  }
  if (typeof value !== "string" || !isUuid(value)) {
    throw invalid(`${field} must be a UUID`);
  }
  return value;
}

function normalizedSeriesId(value, field = "seriesId") {
  if (typeof value !== "string" || !SERIES_ID_PATTERN.test(value)) {
    throw invalid(`${field} is invalid`);
  }
  return value;
}

function normalizedRevisionId(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !REVISION_ID_PATTERN.test(value)) {
    throw invalid("expectedRevisionId is invalid");
  }
  return value;
}

function normalizedImageIds(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw invalid("imageIds must be an array");
  if (value.length > MAX_IMAGES) {
    throw invalid(`imageIds cannot contain more than ${MAX_IMAGES} items`);
  }
  const ids = [...new Set(value)];
  if (ids.some((id) => typeof id !== "string" || !isUuid(id))) {
    throw invalid("Every imageId must be a UUID");
  }
  return ids.sort();
}

function normalizedSeriesIds(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) throw invalid("seriesIds must be an array");
  if (value.length > MAX_SERIES) {
    throw invalid(`seriesIds cannot contain more than ${MAX_SERIES} items`);
  }
  return [...new Set(value.map((id) => normalizedSeriesId(id, "seriesIds")))].sort();
}

async function ownProfile(req) {
  return knex("profiles")
    .where({ user_id: req.session.userId })
    .first("id");
}

function registryStorageUnavailable(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("spec_registry_") &&
    (message.includes("no such table") ||
      message.includes("does not exist") ||
      message.includes("undefined table"))
  );
}

function sendRegistryError(res, error) {
  if (error instanceof SpecRegistryServiceError) {
    return apiResponse.error(res, error.message, error.status, {
      code: error.code,
      ...(error.details || {}),
    });
  }
  if (registryStorageUnavailable(error)) {
    return apiResponse.error(
      res,
      "Published requirements are temporarily unavailable. Agency submissions remain available.",
      503,
      { code: "SPEC_REGISTRY_UNAVAILABLE", advisoryOnly: true },
    );
  }
  throw error;
}

router.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

router.get(
  "/routes",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    try {
      const agencyId = normalizedUuid(req.query.agencyId, "agencyId");
      const payload = await listRegistryRoutes(knex, { agencyId });
      return apiResponse.success(res, payload);
    } catch (error) {
      return sendRegistryError(res, error);
    }
  }),
);

router.get(
  "/routes/:seriesId",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    try {
      const seriesId = normalizedSeriesId(req.params.seriesId);
      const route = await getRegistryRoute(knex, seriesId);
      if (!route) {
        return apiResponse.error(res, "Registry route not found", 404, {
          code: "SPEC_REGISTRY_ROUTE_NOT_FOUND",
        });
      }
      return apiResponse.success(res, route);
    } catch (error) {
      return sendRegistryError(res, error);
    }
  }),
);

router.post(
  "/preflight",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    try {
      const body = req.body || {};
      const agencyId = normalizedUuid(body.agencyId, "agencyId");
      const seriesId = body.seriesId
        ? normalizedSeriesId(body.seriesId)
        : null;
      const seriesIds = normalizedSeriesIds(body.seriesIds);
      if (seriesId && seriesIds) {
        throw invalid("Use seriesId or seriesIds, not both");
      }
      if (agencyId && (seriesId || seriesIds)) {
        throw invalid("Use agencyId or registry series IDs, not both");
      }
      const expectedRevisionId = normalizedRevisionId(body.expectedRevisionId);
      const imageIds = normalizedImageIds(body.imageIds);
      const profile = await ownProfile(req);
      if (!profile) return apiResponse.error(res, "Profile not found", 404);

      const payload = await preflightRegistry(knex, {
        profileId: profile.id,
        imageIds,
        agencyId,
        seriesId,
        seriesIds,
        expectedRevisionId,
      });
      return apiResponse.success(res, payload);
    } catch (error) {
      return sendRegistryError(res, error);
    }
  }),
);

/**
 * Which Pholio agency, if any, this series belongs to.
 *
 * Only used to tag an engagement event, so a failure here must not fail the
 * download: the count is worth less than the thing being counted.
 */
async function pholioAgencyIdForSeries(seriesId) {
  try {
    const row = await knex("spec_registry_agency_routes as r")
      .join("agencies as a", "a.id", "r.agency_id")
      .where("r.series_id", seriesId)
      .where("a.status", "ACTIVE")
      .first("a.id");
    return row?.id || null;
  } catch {
    return null;
  }
}

/**
 * Download the talent's images, prepared to one agency's published requirements.
 *
 * Deliberately not gated behind Studio+. A spec-correct set exists to get the
 * talent into an agency's hands, which places it in the submission pipeline
 * invariant A1-2 protects and inside the Cal. Lab. Code §1701 analysis in C1 —
 * charging so that more agencies receive your submission is the statutory
 * tripwire. See guardrail 1 of `docs/spec-correct-export-brief.md`; keep this
 * line visible in review.
 */
router.post(
  "/export",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    try {
      const body = req.body || {};
      const seriesId = normalizedSeriesId(body.seriesId);
      // Omitting `imageIds` exports the whole eligible book; sending an empty
      // array would otherwise mean "chose nothing", which is a valid preflight
      // answer and a pointless download.
      const imageIds =
        body.imageIds === undefined ? null : normalizedImageIds(body.imageIds);
      const profile = await ownProfile(req);
      if (!profile) return apiResponse.error(res, "Profile not found", 404);

      const { archiveName, buffer, manifest } = await buildSpecExport(knex, {
        profileId: profile.id,
        seriesId,
        imageIds,
      });

      await recordEngagement(knex, {
        seriesId,
        profileId: profile.id,
        eventType: EVENT_TYPES.EXPORT,
        agencyId: await pholioAgencyIdForSeries(seriesId),
        revisionId: manifest.revisionId,
        fileCount: manifest.entries.length,
      });

      res.set("Content-Type", "application/zip");
      res.set("Content-Disposition", `attachment; filename="${archiveName}"`);
      res.set("Content-Length", String(buffer.length));
      // The manifest is inside the archive; this header lets the surface report
      // what shipped without unzipping the response it just triggered.
      res.set("X-Pholio-Export-Files", String(manifest.entries.length));
      return res.send(buffer);
    } catch (error) {
      return sendRegistryError(res, error);
    }
  }),
);

/**
 * The talent followed the link to the agency's own application page.
 *
 * Recorded, then answered plainly. The client fires this alongside opening the
 * link rather than through it — a redirect Pholio owns would put Pholio in the
 * path of an application it has nothing to do with.
 */
router.post(
  "/outbound-click",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    try {
      const seriesId = normalizedSeriesId((req.body || {}).seriesId);
      const profile = await ownProfile(req);
      if (!profile) return apiResponse.error(res, "Profile not found", 404);

      const recorded = await recordEngagement(knex, {
        seriesId,
        profileId: profile.id,
        eventType: EVENT_TYPES.OUTBOUND_CLICK,
        agencyId: await pholioAgencyIdForSeries(seriesId),
      });
      return apiResponse.success(res, { recorded });
    } catch (error) {
      return sendRegistryError(res, error);
    }
  }),
);

module.exports = router;
module.exports._test = {
  normalizedImageIds,
  normalizedRevisionId,
  normalizedSeriesId,
  normalizedSeriesIds,
  normalizedUuid,
  registryStorageUnavailable,
};
