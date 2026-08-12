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

module.exports = router;
module.exports._test = {
  normalizedImageIds,
  normalizedRevisionId,
  normalizedSeriesId,
  normalizedSeriesIds,
  normalizedUuid,
  registryStorageUnavailable,
};
