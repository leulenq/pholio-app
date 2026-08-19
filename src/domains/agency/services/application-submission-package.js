"use strict";

const {
  redactExpiredSubmissionPackages,
} = require("../../../shared/lib/submission-retention");

const DIGITAL_SLOT_ORDER = [
  "headshot",
  "profile",
  "three_quarter",
  "full_length",
  "back",
];

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function imagePath(image) {
  return image?.public_url || image?.url || image?.path || null;
}

function boundedString(value, maxLength = 160) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength) || null
    : null;
}

function normalizeCompCard(value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: boundedString(value.id, 80),
    name: boundedString(value.name, 120) || "Comp card",
    seed: boundedString(value.seed, 160),
    layoutFamily: boundedString(value.layoutFamily, 80),
    styleVariant: boundedString(value.styleVariant, 80),
    lockHeroId: boundedString(value.lockHeroId, 80),
    lockGridIds: Array.isArray(value.lockGridIds)
      ? value.lockGridIds
          .slice(0, 8)
          .map((id) => boundedString(id, 80))
      : [],
    board: boundedString(value.board, 120),
    market: boundedString(value.market, 120),
    external: value.external === true,
    externalUrl: boundedString(value.externalUrl, 1500),
  };
}

function normalizeImage(image) {
  if (!image || typeof image !== "object" || !image.id) return null;
  const path = imagePath(image);
  if (!path) return null;
  return {
    id: image.id,
    path,
    public_url: image.public_url || path,
    alt: image.alt || image.alt_text || "",
    image_type: image.image_type || null,
    shot_type: image.shot_type || null,
    sort: Number.isFinite(Number(image.sort)) ? Number(image.sort) : null,
    is_primary: Boolean(image.is_primary),
  };
}

function orderedImages(images, digitalSlotPicks = {}) {
  const normalized = images.map(normalizeImage).filter(Boolean);
  const byId = new Map(normalized.map((image) => [image.id, image]));
  const ordered = [];
  const used = new Set();

  for (const slot of DIGITAL_SLOT_ORDER) {
    const image = byId.get(digitalSlotPicks?.[slot]);
    if (image && !used.has(image.id)) {
      ordered.push(image);
      used.add(image.id);
    }
  }
  for (const image of normalized) {
    if (!used.has(image.id)) ordered.push(image);
  }
  return ordered;
}

function compCardViewUrl(slug, compCard) {
  if (!slug || !compCard) return null;
  if (compCard.externalUrl) return compCard.externalUrl;
  const params = new URLSearchParams();
  if (compCard.seed) params.set("seed", compCard.seed);
  if (compCard.layoutFamily) {
    params.set("layoutFamily", compCard.layoutFamily);
  }
  if (compCard.styleVariant) {
    params.set("styleVariant", compCard.styleVariant);
  }
  if (compCard.lockHeroId) params.set("lockHeroId", compCard.lockHeroId);
  if (Array.isArray(compCard.lockGridIds) && compCard.lockGridIds.some(Boolean)) {
    params.set(
      "lockGridIds",
      compCard.lockGridIds.map((id) => id || "").join(","),
    );
  }
  const query = params.toString();
  return `/pdf/view/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`;
}

async function loadApplicationSubmissionPackages(db, applications) {
  const applicationRows = (applications || []).filter(
    (application) => application?.id && application?.profile_id,
  );
  const packagesByApplication = new Map();
  if (
    applicationRows.length === 0 ||
    !(await db.schema.hasTable("talent_submission_packages"))
  ) {
    return packagesByApplication;
  }
  await redactExpiredSubmissionPackages(db);

  const applicationIds = new Set(
    applicationRows.map((application) => application.id),
  );
  const profileIds = [
    ...new Set(applicationRows.map((application) => application.profile_id)),
  ];
  const rows = await db("talent_submission_packages")
    .whereIn("profile_id", profileIds)
    .orderBy("created_at", "desc");

  const unresolvedImageIds = new Set();
  const candidates = [];
  for (const row of rows) {
    const payload = parsePayload(row.payload);
    const applicationId = row.application_id || payload.applicationId;
    if (
      !applicationIds.has(applicationId) ||
      packagesByApplication.has(applicationId)
    ) {
      continue;
    }
    if (row.revoked_at || row.redacted_at || payload.disclosureRedacted) {
      packagesByApplication.set(applicationId, {
        id: row.id,
        submittedAt: payload.submittedAt || row.created_at || null,
        revoked: true,
        redacted: true,
        redactionReason:
          row.redaction_reason || payload.redactionReason || "revoked",
        mediaSet: null,
        boards: [],
        digitalSlotPicks: {},
        images: [],
        compCard: null,
        contact: null,
        profile: null,
      });
      continue;
    }
    const imageIds = Array.isArray(payload.imageIds)
      ? payload.imageIds.filter((id) => typeof id === "string")
      : [];
    if (!Array.isArray(payload.images)) {
      imageIds.forEach((id) => unresolvedImageIds.add(id));
    }
    const candidate = { row, payload, applicationId, imageIds };
    candidates.push(candidate);
    packagesByApplication.set(applicationId, candidate);
  }

  const currentImages = unresolvedImageIds.size
    ? await db("images").whereIn("id", [...unresolvedImageIds])
    : [];
  const currentImagesById = new Map(
    currentImages.map((image) => [image.id, image]),
  );

  for (const candidate of candidates) {
    const sourceImages = Array.isArray(candidate.payload.images)
      ? candidate.payload.images
      : candidate.imageIds
          .map((id) => currentImagesById.get(id))
          .filter(Boolean);
    const compCard = normalizeCompCard(
      candidate.payload.compCard &&
      typeof candidate.payload.compCard === "object"
        ? candidate.payload.compCard
        : candidate.payload.compCardPresetId ||
            candidate.payload.compCardPresetName ||
            candidate.payload.compCardSeed
          ? {
              id: candidate.payload.compCardPresetId || null,
              name:
                candidate.payload.compCardPresetName ||
                candidate.payload.compCardName ||
                null,
              seed: candidate.payload.compCardSeed || null,
            }
          : null,
    );
    packagesByApplication.set(candidate.applicationId, {
      id: candidate.row.id,
      submittedAt:
        candidate.payload.submittedAt || candidate.row.created_at || null,
      mediaSet: {
        id: boundedString(candidate.payload.mediaSetId, 80),
        name: boundedString(candidate.payload.mediaSetName, 120),
      },
      boards: Array.isArray(candidate.payload.boards)
        ? candidate.payload.boards
            .slice(0, 20)
            .map((board) => boundedString(board, 120))
            .filter(Boolean)
        : [],
      digitalSlotPicks:
        candidate.payload.digitalSlotPicks &&
        typeof candidate.payload.digitalSlotPicks === "object"
          ? candidate.payload.digitalSlotPicks
          : {},
      images: orderedImages(
        sourceImages,
        candidate.payload.digitalSlotPicks,
      ),
      compCard: compCard
        ? {
            ...compCard,
            viewUrl: compCardViewUrl(
              applicationRows.find(
                (application) => application.id === candidate.applicationId,
              )?.slug,
              compCard,
            ),
          }
        : null,
      contact:
        candidate.payload.contact &&
        typeof candidate.payload.contact === "object"
          ? {
              email: boundedString(candidate.payload.contact.email, 254),
              phone: boundedString(candidate.payload.contact.phone, 40),
            }
          : null,
      profile:
        candidate.payload.profile &&
        typeof candidate.payload.profile === "object"
          ? candidate.payload.profile
          : null,
      minorDataMinimized: candidate.payload.minorDataMinimized === true,
    });
  }

  return packagesByApplication;
}

module.exports = {
  boundedString,
  loadApplicationSubmissionPackages,
  normalizeCompCard,
  orderedImages,
  parsePayload,
};
