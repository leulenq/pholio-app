const express = require("express");
const path = require("path");
const fs = require("fs");
const { getSharp } = require("../../../shared/lib/lazy-sharp");
const {
  uploadAgencyLogo,
  processAgencyLogo,
} = require("../../../shared/lib/uploader");
const {
  renderCompCard,
  renderDigitalsSheet,
  loadProfile,
  toFeetInches,
} = require("../generator");
const {
  getTheme,
  isProTheme,
  getDefaultTheme,
  mergeThemeWithCustomization,
  generateThemeFontsUrl,
  validateCustomization,
} = require("../themes");
const { selectCompCardImages } = require("../comp-card-selector");
const { injectSocialFields } = require("../../../shared/lib/social-helpers");
const { composeCompCard } = require("../composition");
const { resolveCompCardArtDirection } = require("../style-engine");
const { evaluateCompCardGuardrails } = require("../guardrails");
const {
  normalizePresetInput,
  mapPresetRow,
  mapPresetRevisionRow,
  snapshotFromPresetRow,
  toPresetQuery,
  toPresetPayload,
  buildPresetInsert,
} = require("../presets");
const { getFontFamilyCSS } = require("../fonts");
const {
  generateLayoutClasses,
  getImageGridCSS,
  validateLayout,
} = require("../layouts");
const { requireRole } = require("../../auth/middleware/require-auth");
const { recordProfileEvent } = require("../../talent/services/intel/capture");
const knex = require("../../../shared/db/knex");
const { minorPublicExposureAllowed } = require("../../../shared/lib/talent-age");
const { buildCanonicalStats } = require("../../../shared/lib/stats-formatter");
const QRCode = require("qrcode");
const config = require("../../../config");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const MAX_PRESETS_PER_PROFILE = 40;
const MAX_PRESET_REVISIONS = 50;
const PRESET_EXPORT_VERSION = "1.0";

// EJS templates live in src/domains/pdf/templates/ (bundled via netlify.toml included_files).
const pdfTemplateDir = config.isServerless
  ? path.join(
      process.env.LAMBDA_TASK_ROOT || "/var/task",
      "src/domains/pdf/templates",
    )
  : path.join(__dirname, "..", "templates");
const TEMPLATE_STANDARD = path.join(pdfTemplateDir, "compcard-standard.ejs");
const TEMPLATE_COMPOSED = path.join(pdfTemplateDir, "compcard-composed.ejs");
const TEMPLATE_LEGACY = path.join(pdfTemplateDir, "compcard.ejs");

// Helper function to log analytics event (non-blocking)
async function logAnalyticsEvent(
  profileId,
  eventType,
  metadata = {},
  req = null,
) {
  try {
    // Only log if profile exists (not demo)
    if (!profileId || profileId === "demo-elara-k") {
      return;
    }

    await knex("analytics").insert({
      id: uuidv4(),
      profile_id: profileId,
      event_type: eventType,
      event_source: "web",
      metadata: JSON.stringify(metadata),
      ip_address:
        req?.ip ||
        req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
        null,
      user_agent: req?.headers?.["user-agent"] || null,
      created_at: knex.fn.now(),
    });
  } catch (error) {
    console.error("[PDF] Error logging analytics:", error);
    // Don't throw - analytics logging is non-critical
  }
}

// Helper function to detect database connection errors
function isDatabaseError(error) {
  if (!error) return false;

  // Check for database connection error codes
  const dbErrorCodes = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"];
  if (dbErrorCodes.includes(error.code)) {
    return true;
  }

  // Check for PostgreSQL error codes
  // 42P01 = relation does not exist (missing tables - need to run migrations)
  // 42P07 = relation already exists
  // 3D000 = database does not exist
  // 28P01 = authentication failed
  const pgErrorCodes = ["42P01", "42P07", "3D000", "28P01"];
  if (pgErrorCodes.includes(error.code)) {
    return true;
  }

  // Check for database-related error messages
  if (error.message) {
    const dbErrorKeywords = [
      "connect",
      "connection",
      "DATABASE_URL",
      "database",
      "Cannot find module 'pg'",
      "Knex: run",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "ECONNRESET",
      'relation "',
      "does not exist",
      "table",
      "relation does not exist",
    ];

    const errorMessage = error.message.toLowerCase();
    return dbErrorKeywords.some((keyword) =>
      errorMessage.includes(keyword.toLowerCase()),
    );
  }

  return false;
}

// Helper function to detect missing tables error (needs migrations)
function isMissingTablesError(error) {
  if (!error) return false;

  // PostgreSQL error code for "relation does not exist"
  if (error.code === "42P01") {
    return true;
  }

  // Check error message for "relation" or "does not exist"
  if (
    error.message &&
    ((error.message.includes("relation") &&
      error.message.includes("does not exist")) ||
      (error.message.includes("table") &&
        error.message.includes("does not exist")))
  ) {
    return true;
  }

  return false;
}

// Helper function to verify profile ownership
async function verifyProfileOwnership(req, profileSlug) {
  if (!req.session || !req.session.userId) {
    return { authorized: false, error: "Not authenticated" };
  }

  let profile = await knex("profiles").where({ slug: profileSlug }).first();
  if (profile) {
    profile = await injectSocialFields(profile);
  }
  if (!profile) {
    return { authorized: false, error: "Profile not found" };
  }

  if (profile.user_id !== req.session.userId) {
    return { authorized: false, error: "Not authorized" };
  }

  return { authorized: true, profile };
}

function renderMinorPdfBlocked(res) {
  return renderSimpleError(
    res,
    403,
    "Unavailable",
    "Guardian consent is required before this comp card can be shared publicly.",
  );
}

// Demo profile data for elara-k (fallback when database is empty)
function getDemoProfile(slug) {
  if (slug !== "elara-k") return null;

  return {
    profile: {
      id: "demo-elara-k",
      slug: "elara-k",
      user_id: "demo-user",
      first_name: "Elara",
      last_name: "Keats",
      city: "Los Angeles, CA",
      height_cm: 180,
      measurements: "32-25-35",
      bio_raw:
        "Elara is a collaborative creative professional with a background in editorial campaigns and on-set leadership. Based in Los Angeles, she balances editorial edge with commercial versatility.",
      bio_curated:
        "Elara Keats brings a polished presence to every production. Based in Los Angeles, she balances editorial edge with commercial versatility. Standing at 5'11\" with measurements of 32-25-35, she brings a commanding presence to both high-fashion editorials and commercial campaigns.",
      // hero_image_path removed from demo as it is derived
      is_pro: false,
      pdf_theme: null,
      pdf_customizations: null,
      phone: null,
      bust: 32,
      waist: 25,
      hips: 35,
      shoe_size: "9 US",
      eye_color: "Brown",
      hair_color: "Blonde",
      specialties: JSON.stringify(["Editorial", "Commercial"]),
      partner_agency_id: null,
      // New comprehensive fields
      gender: "Female",
      date_of_birth: "1995-06-15",
      age: 29,
      weight_kg: 58,
      weight_lbs: 128,
      dress_size: "4",
      hair_length: "Long",
      skin_tone: "Fair",
      languages: JSON.stringify(["English", "Spanish"]),
      availability_travel: true,
      availability_schedule: "Full-time",
      experience_level: "Experienced",
      training: "Formal training in editorial modeling and commercial acting.",
      portfolio_url: "https://elarakeats.portfolio.com",
      instagram_handle: "elarakeats",
      instagram_url: null, // Free users don't get URLs
      twitter_handle: "elarakeats",
      twitter_url: null, // Free users don't get URLs
      tiktok_handle: "elarakeats",
      tiktok_url: null, // Free users don't get URLs
      reference_name: null,
      reference_email: null,
      reference_phone: null,
      reference_relationship: null,
      emergency_contact_name: "Jane Doe",
      emergency_contact_phone: "+1 (555) 123-4567",
      emergency_contact_relationship: "Parent",
      nationality: "American",
      union_membership: null,
      ethnicity: null,
      tattoos: false,
      piercings: false,
      created_at: new Date(),
      updated_at: new Date(),
    },
    images: [
      {
        id: "demo-img-1",
        profile_id: "demo-elara-k",
        path: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=70",
        label: "Headshot",
        width: 1200,
        height: 1800,
        shot_type: "headshot",
        sort: 1,
        created_at: new Date(),
      },
      {
        id: "demo-img-2",
        profile_id: "demo-elara-k",
        path: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=70",
        label: "Editorial",
        width: 900,
        height: 1125,
        style_type: "editorial",
        sort: 2,
        created_at: new Date(),
      },
      {
        id: "demo-img-3",
        profile_id: "demo-elara-k",
        path: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=70",
        label: "Runway",
        width: 900,
        height: 1247,
        shot_type: "full_length",
        sort: 3,
        created_at: new Date(),
      },
      {
        id: "demo-img-4",
        profile_id: "demo-elara-k",
        path: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=70",
        label: "Portfolio",
        width: 900,
        height: 1350,
        style_type: "lifestyle",
        sort: 4,
        created_at: new Date(),
      },
    ],
  };
}

function normalizeQueryValue(value) {
  if (Array.isArray(value)) return value[0] ?? undefined;
  return value;
}

function normalizeCompCardSeed(value) {
  const normalized = normalizeQueryValue(value);
  if (normalized == null) return undefined;
  const trimmed = String(normalized).trim();
  return trimmed === "" ? undefined : trimmed;
}

function toSafeMetadataToken(value, fallback = "auto", maxLen = 96) {
  const normalized = value == null ? "" : String(value).trim();
  if (!normalized) return fallback;
  const compact = normalized.replace(/\s+/g, "-");
  const safe = compact.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, maxLen);
  return safe || fallback;
}

function parseCompCardLocks(req) {
  const heroRaw = normalizeQueryValue(req.query.lockHeroId);
  const heroId =
    heroRaw == null ? null : toSafeMetadataToken(heroRaw, "", 64) || null;

  const gridRaw = normalizeQueryValue(req.query.lockGridIds);
  let gridIds = [];
  if (typeof gridRaw === "string" && gridRaw.trim() !== "") {
    gridIds = gridRaw
      .split(",")
      .map((item) => toSafeMetadataToken(item, "", 64) || null)
      .slice(0, 4);
  }
  while (gridIds.length < 4) gridIds.push(null);

  return { heroId, gridIds };
}

function resolveCompCardGenerationMetadata(req, theme) {
  const seed = normalizeCompCardSeed(req.query.seed);
  const locks = parseCompCardLocks(req);
  const artDirection = resolveCompCardArtDirection({
    seed,
    theme,
    requestedLayoutFamily: req.query.layoutFamily,
    requestedStyleVariant: req.query.styleVariant,
  });

  return {
    seed,
    locks,
    artDirection,
    metadata: {
      seed: toSafeMetadataToken(seed, "auto", 96),
      layoutFamily: toSafeMetadataToken(
        artDirection.layoutFamily,
        "editorial-balanced",
        64,
      ),
      layoutFamilyLabel: artDirection.layoutFamilyLabel || null,
      styleVariant: toSafeMetadataToken(
        artDirection.styleVariant,
        "default",
        64,
      ),
      styleVariantLabel: artDirection.styleVariantLabel || null,
      locks: {
        heroId: locks.heroId || null,
        gridIds: locks.gridIds,
      },
    },
  };
}

function resolveGenerationMode(req) {
  const queryMode = normalizeQueryValue(req.query.mode);
  const bodyMode = req.body ? normalizeQueryValue(req.body.mode) : undefined;
  const normalized = String(queryMode ?? bodyMode ?? "")
    .trim()
    .toLowerCase();
  return normalized === "master" ? "master" : "draft";
}

function isUniqueViolation(error) {
  if (!error) return false;
  if (error.code === "23505") return true; // PostgreSQL
  return (
    String(error.code || "").includes("SQLITE_CONSTRAINT") ||
    String(error.message || "")
      .toLowerCase()
      .includes("unique")
  );
}

function toSafeRevisionReason(reason) {
  const normalized = reason == null ? "" : String(reason).trim().toLowerCase();
  const safe = normalized.replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  return safe || "update";
}

async function insertPresetRevision(db, presetRow, reason = "update") {
  if (!presetRow?.id) return null;
  const safeReason = toSafeRevisionReason(reason);
  const snapshot = JSON.stringify(snapshotFromPresetRow(presetRow));

  let attempts = 0;
  while (attempts < 3) {
    attempts += 1;
    const maxResult = await db("comp_card_preset_revisions")
      .where({ preset_id: presetRow.id })
      .max("revision_number as maxRevision")
      .first();
    const currentMax = Number(maxResult?.maxRevision) || 0;
    const revisionNumber = currentMax + 1;
    const revisionId = uuidv4();
    try {
      await db("comp_card_preset_revisions").insert({
        id: revisionId,
        preset_id: presetRow.id,
        revision_number: revisionNumber,
        reason: safeReason,
        snapshot,
        created_at: db.fn.now(),
      });
      return db("comp_card_preset_revisions").where({ id: revisionId }).first();
    } catch (error) {
      if (isUniqueViolation(error) && attempts < 3) {
        continue;
      }
      throw error;
    }
  }
  return null;
}

async function prunePresetRevisions(
  db,
  presetId,
  keepLatest = MAX_PRESET_REVISIONS,
) {
  const staleRows = await db("comp_card_preset_revisions")
    .where({ preset_id: presetId })
    .orderBy("revision_number", "desc")
    .offset(keepLatest)
    .select("id");
  if (!staleRows.length) return 0;
  const staleIds = staleRows.map((row) => row.id).filter(Boolean);
  if (!staleIds.length) return 0;
  return db("comp_card_preset_revisions").whereIn("id", staleIds).delete();
}

async function ensurePresetCapacity(db, profileId) {
  const countResult = await db("comp_card_presets")
    .where({ profile_id: profileId })
    .count({ count: "*" })
    .first();
  const currentCount = Number(countResult?.count || 0);
  if (currentCount >= MAX_PRESETS_PER_PROFILE) {
    const error = new Error(
      `Preset limit reached (${MAX_PRESETS_PER_PROFILE}). Delete an existing preset before creating a new one.`,
    );
    error.status = 409;
    error.code = "PRESET_LIMIT_REACHED";
    throw error;
  }
}

function extractImportPayload(body) {
  if (!body || typeof body !== "object") {
    return {};
  }
  if (
    body.preset &&
    typeof body.preset === "object" &&
    body.preset.payload &&
    typeof body.preset.payload === "object"
  ) {
    return body.preset.payload;
  }
  if (body.payload && typeof body.payload === "object") {
    return body.payload;
  }
  if (body.preset && typeof body.preset === "object") {
    return body.preset;
  }
  return body;
}

function parseOverwriteExisting(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

// Helper function to render simple HTML error page (for iframe compatibility)
function renderSimpleError(res, statusCode, title, message) {
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
    title +
    '</title><style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;color:#666}.error{text-align:center;padding:2rem;max-width:600px}.error h1{margin:0 0 0.5rem 0;font-size:1.5rem;color:#c9a55a}.error p{margin:0.5rem 0;font-size:0.9rem}</style></head><body><div class="error"><h1>' +
    title +
    "</h1><p>" +
    message +
    "</p></div></body></html>";
  return res.status(statusCode).send(html);
}

// Helper function to load archetype data for a profile (non-blocking)
async function loadArchetype(profileId) {
  if (!profileId || profileId === "demo-elara-k") {
    return {
      label: "Editorial",
      verdict: "Strong editorial presence with versatile commercial appeal.",
    };
  }
  try {
    const row = await knex("onboarding_signals")
      .where({ profile_id: profileId })
      .select("archetype_label", "casting_verdict")
      .first();
    if (!row) return null;
    return {
      label: row.archetype_label || null,
      verdict: row.casting_verdict || null,
    };
  } catch {
    return null;
  }
}

// Resolve the comp-card engine from ?engine=. Default is the composed
// engine; anything explicitly 'classic' keeps the legacy standard path.
// layoutFamily / styleVariant are classic-engine art-direction controls, so a
// caller sending them without an explicit engine expects classic output
// (existing preset UI and saved links keep working under the new default).
function resolveCompCardEngine(req) {
  const raw = String(normalizeQueryValue(req.query.engine) ?? "")
    .trim()
    .toLowerCase();
  if (raw === "classic") return "classic";
  if (raw === "composed") return "composed";
  const layoutFamily = normalizeQueryValue(req.query.layoutFamily);
  const styleVariant = normalizeQueryValue(req.query.styleVariant);
  if (
    (layoutFamily != null && layoutFamily !== "") ||
    (styleVariant != null && styleVariant !== "")
  ) {
    return "classic";
  }
  return "composed";
}

// Resolve ?units= into a stats-formatter units preference (or undefined).
function resolveUnitsPreference(req) {
  const raw = String(normalizeQueryValue(req.query.units) ?? "")
    .trim()
    .toLowerCase();
  return ["dual", "imperial", "metric"].includes(raw) ? raw : undefined;
}

// In-process forensics cache (keyed by image id + source) so repeat renders
// — especially the demo profile, which has no DB row to cache into — never
// re-fetch and re-measure the same pixels. Bounded to stay small.
const forensicsMemoryCache = new Map();
const FORENSICS_MEMORY_CACHE_MAX = 200;

/**
 * Image forensics for the composed view: cached measurements from
 * images.metadata.forensics when present, otherwise measured now (local
 * uploads via fs, remote via fetch with a hard per-image timeout) inside a
 * total time budget. Fresh measurements are cached back best-effort.
 * Always resolves to a Map — failures yield null entries, never throws.
 */
async function loadCompCardForensics(images, { isDemo } = {}) {
  const result = new Map();
  const rows = Array.isArray(images) ? images.filter((i) => i && i.id != null) : [];
  if (!rows.length) return result;

  let forensicsModule;
  try {
    forensicsModule = require("../composition/image-forensics");
  } catch {
    return result;
  }

  const parseMeta = (metadata) => {
    if (!metadata) return {};
    if (typeof metadata === "object") return metadata;
    try {
      return JSON.parse(metadata) || {};
    } catch {
      return {};
    }
  };

  const cacheKey = (img) => `${img.id}:${img.public_url || img.path || ""}`;
  const toMeasure = [];
  for (const img of rows) {
    const cached = parseMeta(img.metadata).forensics;
    if (cached && cached.version === forensicsModule.FORENSICS_VERSION) {
      result.set(img.id, cached);
    } else if (forensicsMemoryCache.has(cacheKey(img))) {
      result.set(img.id, forensicsMemoryCache.get(cacheKey(img)));
    } else {
      toMeasure.push(img);
    }
  }
  // Tests must stay offline and deterministic: cached forensics only.
  if (!toMeasure.length || process.env.NODE_ENV === "test") return result;

  const fetchBuffer = async (img) => {
    const src = img.public_url || img.path || null;
    if (!src) return null;
    if (/^https?:\/\//i.test(src)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) return null;
        return Buffer.from(await response.arrayBuffer());
      } finally {
        clearTimeout(timer);
      }
    }
    const fs = require("fs/promises");
    const path = require("path");
    const relative = src.replace(/^\//, "");
    const candidates = [
      path.join(process.cwd(), relative),
      path.join(process.cwd(), "public", relative),
    ];
    for (const candidate of candidates) {
      try {
        return await fs.readFile(candidate);
      } catch {
        /* try next */
      }
    }
    return null;
  };

  try {
    // Total budget: never let forensics make a render feel slow.
    const measured = await Promise.race([
      forensicsModule.forensicsForImages(toMeasure, {
        fetchBuffer,
        timeoutMs: 2200,
        concurrency: 3,
      }),
      new Promise((resolve) => setTimeout(() => resolve(new Map()), 4500)),
    ]);
    for (const [id, forensics] of measured) {
      result.set(id, forensics);
      if (!forensics) continue;
      const img = toMeasure.find((i) => i.id === id);
      // Always cache in-process (covers demo rows with no DB row)…
      if (forensicsMemoryCache.size >= FORENSICS_MEMORY_CACHE_MAX) {
        forensicsMemoryCache.delete(forensicsMemoryCache.keys().next().value);
      }
      if (img) forensicsMemoryCache.set(cacheKey(img), forensics);
      // …and back to the DB best-effort for real profiles.
      if (!isDemo) {
        const metadata = { ...parseMeta(img && img.metadata), forensics };
        knex("images")
          .where({ id })
          .update({ metadata: JSON.stringify(metadata) })
          .catch(() => {});
      }
    }
  } catch (error) {
    console.warn("[compcard-forensics] measurement failed:", error.message);
  }
  return result;
}

// Subject mattes for the composed engine: cached in image metadata like
// forensics; on a miss the studio matte (sharp-only, clean-backdrop) is
// computed under a strict budget and cached back. A real alpha matte
// (@imgly, when installed) takes precedence inside computeBestMatte.
const matteMemoryCache = new Map();
const MATTE_MEMORY_CACHE_MAX = 300;
async function loadCompCardMattes(images, { isDemo } = {}) {
  const result = {};
  const rows = Array.isArray(images) ? images.filter((i) => i && i.id != null) : [];
  if (!rows.length) return result;
  let matteModule;
  try {
    matteModule = require("../composition/perception/matte");
  } catch {
    return result;
  }
  const parseMeta = (metadata) => {
    if (!metadata) return {};
    if (typeof metadata === "object") return metadata;
    try {
      return JSON.parse(metadata) || {};
    } catch {
      return {};
    }
  };
  const cacheKey = (img) => `${img.id}:${img.public_url || img.path || ""}`;
  const toCompute = [];
  for (const img of rows) {
    const cached = parseMeta(img.metadata).matte;
    if (cached && Array.isArray(cached.maskGrid)) {
      // null-miss marker: a previous attempt found the backdrop unverifiable
      result[img.id] = cached;
    } else if (cached === false || (cached && cached.unavailable)) {
      /* known-unmattable: skip */
    } else if (matteMemoryCache.has(cacheKey(img))) {
      const mem = matteMemoryCache.get(cacheKey(img));
      if (mem) result[img.id] = mem;
    } else {
      toCompute.push(img);
    }
  }
  if (!toCompute.length || process.env.NODE_ENV === "test") return result;

  const fsPromises = require("fs/promises");
  const path = require("path");
  const readLocal = async (img) => {
    const src = img.public_url || img.path || null;
    if (!src || /^https?:\/\//i.test(src)) return null; // local files only (budget)
    const relative = src.replace(/^\//, "");
    for (const candidate of [
      path.join(process.cwd(), relative),
      path.join(process.cwd(), "public", relative),
    ]) {
      try {
        return await fsPromises.readFile(candidate);
      } catch {
        /* try next */
      }
    }
    return null;
  };

  // Budget: mattes must never make a render feel slow.
  const work = (async () => {
    for (const img of toCompute.slice(0, 8)) {
      try {
        const buffer = await readLocal(img);
        const matte = buffer ? await matteModule.computeBestMatte(buffer) : null;
        if (matteMemoryCache.size >= MATTE_MEMORY_CACHE_MAX) {
          matteMemoryCache.delete(matteMemoryCache.keys().next().value);
        }
        matteMemoryCache.set(cacheKey(img), matte);
        if (matte) result[img.id] = matte;
        if (!isDemo) {
          const metadata = {
            ...parseMeta(img.metadata),
            matte: matte || { unavailable: true, version: matteModule.MATTE_VERSION },
          };
          knex("images")
            .where({ id: img.id })
            .update({ metadata: JSON.stringify(metadata) })
            .catch(() => {});
        }
      } catch {
        /* per-image fail-soft */
      }
    }
  })();
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 3500))]);
  return result;
}

// Render the composed-engine comp card. Returns true when a response was
// sent; false when composition/rendering failed and the caller should fall
// back to the classic path (resilience: a composed failure never 500s when
// the classic template can still serve the card).
async function renderComposedView(req, res, data, isDemo) {
  const { profile, images } = data;
  try {
    let seed = normalizeCompCardSeed(req.query.seed);
    const locks = parseCompCardLocks(req);
    const unitsPreference = resolveUnitsPreference(req);
    const generationMode = resolveGenerationMode(req);
    const wantsMeta = normalizeQueryValue(req.query.meta) === "1";
    const wantsDirections = normalizeQueryValue(req.query.directions) === "1";

    // ── Editions (plan 2.9) — env flag + QA overrides ─────────────────────
    // The editions engine activates when COMP_CARD_EDITIONS === '1' OR the
    // request carries ?editions=1; ?editions=0 force-disables regardless.
    // Default OFF until the flag flips (Gate 3) — legacy behavior is
    // byte-identical.
    const { listEditions, isEditionId } = require("../composition/editions");
    let editionsEnabled = (() => {
      const q = normalizeQueryValue(req.query.editions);
      if (q === "0") return false;
      if (q === "1") return true;
      return process.env.COMP_CARD_EDITIONS === "1";
    })();
    // Repeatable/comma-separated query tokens → ordered list (most-recent
    // first for avoidEdition); Express gives a string or an array.
    const parseTokenList = (value) =>
      (Array.isArray(value) ? value : value != null ? [value] : [])
        .flatMap((v) => String(v).split(","))
        .map((v) => v.trim())
        .filter(Boolean);
    let editionPin = null;
    let avoidEditions = [];
    let avoidHeroId = null;
    if (editionsEnabled) {
      const rawEdition = normalizeQueryValue(req.query.edition);
      if (isEditionId(rawEdition)) editionPin = rawEdition;
      avoidEditions = parseTokenList(req.query.avoidEdition).filter(isEditionId);
      avoidHeroId = toSafeMetadataToken(normalizeQueryValue(req.query.avoidHero), null, 64);
    }

    // ── Named creative directions (audit P0-3) ────────────────────────────
    // ?structure pins the front field structure to one of the catalog
    // directions; ?board conditions the design language through the bounded
    // advice channel (a Runway card skews formal, a Commercial card warm).
    const {
      DIRECTIONS,
      isDirectionStructure,
      directionForStructure,
      boardAdvice,
    } = require("../composition/directions");
    let forceStructure = (() => {
      const raw = normalizeQueryValue(req.query.structure);
      return isDirectionStructure(raw) ? raw : null;
    })();
    const TREATMENTS = ["classic", "statement", "straddle", "over", "band", "inset"];
    let forceTreatment = (() => {
      const raw = normalizeQueryValue(req.query.treatment);
      return TREATMENTS.includes(raw) ? raw : null;
    })();
    const BACK_ARCHS = ["uniform-grid", "feature-column", "feature-row", "mosaic", "filmstrip", "editorial-stagger", "restrained-duo", "high-density"];
    let forceBackArchitecture = (() => {
      const raw = normalizeQueryValue(req.query.backArchitecture);
      return BACK_ARCHS.includes(raw) ? raw : null;
    })();
    // "Another take" diversity: the dashboard passes the previous take's
    // structure/treatment/voice so the next take diverges materially.
    const avoid = (() => {
      const structureRaw = normalizeQueryValue(req.query.avoidStructure);
      const treatmentRaw = normalizeQueryValue(req.query.avoidTreatment);
      const voiceRaw = toSafeMetadataToken(normalizeQueryValue(req.query.avoidVoice), null, 32);
      const out = {};
      if (isDirectionStructure(structureRaw)) out.structure = structureRaw;
      if (TREATMENTS.includes(treatmentRaw) || treatmentRaw === "classic") out.treatment = treatmentRaw;
      if (voiceRaw) out.voice = voiceRaw;
      return Object.keys(out).length ? out : null;
    })();
    let boardParam = toSafeMetadataToken(normalizeQueryValue(req.query.board), null, 32);

    // ── Frozen saved cards (audit P1-6) ───────────────────────────────────
    // ?preset=<id> renders a saved card. If the preset captured a plan at
    // save time, that stored design is authoritative — a card a talent has
    // sent to agencies must never silently redesign under a new engine.
    // The saved parameters remain the fallback when the stored plan can no
    // longer render (e.g. an image it uses was deleted).
    let presetRow = null;
    let frozenPlan = null;
    const presetId = toSafeMetadataToken(normalizeQueryValue(req.query.preset), null, 64);
    if (presetId && !isDemo && profile.id) {
      try {
        presetRow = await knex("comp_card_presets")
          .where({ id: presetId, profile_id: profile.id })
          .first();
      } catch {
        presetRow = null;
      }
      if (presetRow) {
        if (!req.query.seed && presetRow.seed) seed = normalizeCompCardSeed(presetRow.seed);
        if (!locks.heroId && presetRow.lock_hero_id) locks.heroId = presetRow.lock_hero_id;
        if (!forceStructure && isDirectionStructure(presetRow.structure)) {
          forceStructure = presetRow.structure;
        }
        if (!forceTreatment && TREATMENTS.includes(presetRow.treatment)) {
          forceTreatment = presetRow.treatment;
        }
        if (!boardParam && presetRow.board) boardParam = presetRow.board;
        // A preset saved under an edition pins it on render (the same
        // faithful-render principle as the frozen plan). Editions are forced
        // on for that render regardless of the global flag.
        if (isEditionId(presetRow.edition)) {
          editionsEnabled = true;
          if (!editionPin) editionPin = presetRow.edition;
        }
        if (presetRow.plan_json) {
          try {
            const parsed = typeof presetRow.plan_json === "string"
              ? JSON.parse(presetRow.plan_json)
              : presetRow.plan_json;
            if (parsed && parsed.front && parsed.back) frozenPlan = parsed;
          } catch {
            frozenPlan = null;
          }
        }
      }
    }
    // ?print=1 → 0.125in-bleed canvas (5.75×8.75) for print shops. The PDF
    // stays RGB — online printers convert; CMYK proofing is the shop's step.
    const printBleed = normalizeQueryValue(req.query.print) === "1";
    const archetype = await loadArchetype(profile.id);
    const forensicsById = await loadCompCardForensics(images, { isDemo });
    // Subject mattes (P1): metadata-cached; on a miss the sharp-only STUDIO
    // matte is computed under budget (clean-backdrop photography — the
    // comp-card norm) and cached back. A real alpha matte (@imgly, when
    // installed) takes precedence. Unverifiable backdrops stay matte-less
    // and the engine simply skips mask-dependent moves.
    const matteById = await loadCompCardMattes(images, { isDemo });

    // Representation: a represented talent's card leads with the agency.
    let representation = null;
    if (!isDemo && profile.partner_agency_id) {
      try {
        const agency = await knex("agencies")
          .where({ id: profile.partner_agency_id })
          .select("name")
          .first();
        representation = agency?.name || null;
      } catch {
        representation = null;
      }
    }

    const { plan, statsBlock, guardrailReport, poolAnalysis } = await composeCompCard({
      profile,
      images: images || [],
      archetype,
      options: {
        seed,
        // Editions engine (plan 2.9) — strictly flag-gated. When disabled the
        // compose output is byte-identical to the legacy engine.
        editionsEnabled,
        edition: editionPin,
        avoidEditions,
        avoidHeroId,
        locks: { heroId: locks.heroId, gridIds: locks.gridIds },
        unitsPreference,
        mode: generationMode,
        forensicsById,
        briefStore: isDemo
          ? null
          : {
              load: async () => {
                try {
                  const raw = profile.pdf_design_brief;
                  if (!raw) return null;
                  return typeof raw === "string" ? JSON.parse(raw) : raw;
                } catch {
                  return null;
                }
              },
              save: (payload) =>
                knex("profiles")
                  .where({ id: profile.id })
                  .update({ pdf_design_brief: JSON.stringify(payload) })
                  .catch(() => {}),
            },
        // Meta requests power the dashboard panel — they must be fast and
        // deterministic, never waiting on the Groq planning layer. Candidate
        // renders (jury rasterizer, ?candidate=N) likewise skip the brief:
        // 5× re-authoring would be slow and the front program is
        // deterministic per candidate regardless.
        aiAdvice:
          wantsMeta || normalizeQueryValue(req.query.candidate) != null
            ? false
            : undefined,
        // v4 front-page design-program synthesis (grammar-sampled element
        // tree). Default on for the composed engine; ?front=legacy opts out.
        frontEngine:
          normalizeQueryValue(req.query.front) === "legacy" ? "legacy" : "program",
        // ?candidate=N forces a specific front candidate — used by the jury
        // rasterizer (render each candidate's front, rank, re-render winner).
        frontCandidateIndex: (() => {
          const n = parseInt(normalizeQueryValue(req.query.candidate), 10);
          return Number.isInteger(n) && n >= 0 && n < 5 ? n : null;
        })(),
        matteById,
        representation,
        // Named-direction pin + deterministic board conditioning (P0-3).
        forceStructure,
        forceTreatment,
        forceBackArchitecture,
        avoid,
        advice: boardAdvice(boardParam),
      },
    });

    // Frozen preset render: the stored plan wins whenever it can still
    // render (every image it references must still exist). Stats and the
    // portfolio link stay live — the DESIGN is what is frozen.
    let planIsFrozen = false;
    if (frozenPlan) {
      const availableIds = new Set(
        (images || []).filter((img) => img && img.id != null).map((img) => String(img.id)),
      );
      const neededIds = [
        frozenPlan.front?.imageId,
        ...(Array.isArray(frozenPlan.back?.layout?.cells)
          ? frozenPlan.back.layout.cells.map((c) => c && c.imageId)
          : []),
      ].filter((id) => id != null);
      if (neededIds.every((id) => availableIds.has(String(id)))) {
        Object.assign(plan, frozenPlan);
        planIsFrozen = true;
      } else {
        console.warn(
          `[renderComposedView] preset ${presetId} references removed images — recomposed from saved parameters`,
        );
      }
    }

    // ?directions=1 — the named creative directions catalog for this
    // profile (audit P0-3): stable ids, talent-facing copy, availability.
    // The dashboard renders one preview per direction via ?structure=.
    if (wantsDirections) {
      // the cutout direction needs a REAL alpha matte on at least one image
      const hasMatte = Object.values(matteById).some(
        (m) => m && (m.source || "alpha") === "alpha",
      );
      const payload = {
        engine: "composed",
        seed: toSafeMetadataToken(seed, "auto", 96),
        current: plan.frontProgramMeta?.structure || null,
        directions: DIRECTIONS.filter((d) => !d.requiresMatte || hasMatte).map((d) => ({
          id: d.id,
          structure: d.structure,
          label: d.label,
          description: d.description,
        })),
      };
      // Editions catalog with real availability (plan 2.9). Additive; present
      // only when the editions engine is active so a flag-off directions
      // payload is unchanged.
      if (editionsEnabled) {
        const pool = Array.isArray(poolAnalysis?.pool) ? poolAnalysis.pool : [];
        const kids = statsBlock?.category === "kids";
        // Alpha-matte availability mirrors composition/index.js: a real alpha
        // source (legacy cached mattes predate `source` = alpha).
        const hasAlphaMatte = Object.values(matteById).some(
          (m) => m && (m.source == null || m.source === "alpha"),
        );
        const topId =
          Array.isArray(poolAnalysis?.heroRanking) && poolAnalysis.heroRanking.length
            ? poolAnalysis.heroRanking[0]
            : (pool[0] && pool[0].id) ?? null;
        const hasPairableSupport = pool.some(
          (p) => p.id !== topId && Number(p.aspect) > 0 && Number(p.aspect) < 1,
        );
        payload.editions = listEditions({
          poolSize: pool.length,
          hasAlphaMatte,
          kids,
          hasPairableSupport,
        }).map((e) => ({
          id: e.id,
          label: e.label,
          tone: e.tone,
          available: e.available,
        }));
      }
      res.json(payload);
      return true;
    }

    // ?meta=1 — JSON design summary for the dashboard comp card surface
    // (same information the rendered card itself exposes; no extra fields).
    if (wantsMeta) {
      const metaStructure = plan.frontProgramMeta?.structure || null;
      const metaDirection = metaStructure ? directionForStructure(metaStructure) : null;
      res.json({
        engine: "composed",
        seed: toSafeMetadataToken(seed, "auto", 96),
        // Editions (plan 2.9): the resolved edition + composite take signature,
        // present ONLY when the engine is active — a flag-off meta payload
        // carries no edition keys at all.
        ...(plan.edition
          ? {
              edition: {
                id: plan.edition.id,
                label: plan.edition.label,
                field: plan.edition.field,
                register: plan.edition.register,
              },
              takeSignature: plan.takeSignature || null,
            }
          : {}),
        toneProfile: plan.toneProfile,
        voice: plan.typography.voiceId,
        display: plan.typography.display,
        structure: metaStructure,
        direction: metaDirection ? { id: metaDirection.id, label: metaDirection.label } : null,
        treatment:
          plan.frontProgram?.elements?.find((e) => e.role === "split-first")?.variant || "classic",
        frozen: planIsFrozen,
        booking: plan.back.booking
          ? { mode: plan.back.booking.mode, label: plan.back.booking.label }
          : null,
        photoCount: plan.back.layout.cells.length + (plan.front.imageId ? 1 : 0),
        warnings: plan.warnings,
        guardrails: {
          status: guardrailReport.status,
          blockingIssues: guardrailReport.blockingIssues.map((c) => c.message),
          // Structured variant: check ids let the dashboard coach the talent
          // accurately (rights vs type-safety vs crops), instead of
          // collapsing every failure into "needs photos" (audit P1-7).
          blockingChecks: guardrailReport.blockingIssues.map((c) => ({
            id: c.id,
            message: c.message,
          })),
          warnings: guardrailReport.warnings.map((c) => c.message),
        },
      });
      return true;
    }

    const imagesById = {};
    (images || []).forEach((img) => {
      if (img && img.id != null) imagesById[img.id] = img;
    });
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Premium portfolio link: the wordmark rects + short URL travel to the
    // PDF generator as headers; it stamps clickable link annotations.
    // PRODUCTION URL SAFETY: the printed/annotated URL must be the PUBLIC
    // app URL — during PDF generation the request host is the internal
    // Puppeteer target (localhost in dev), which must never be baked into a
    // card. `baseUrl` stays request-derived for image srcs only (Puppeteer
    // fetches those from the local server).
    const { shortPortfolioUrl } = require("../composition/portfolio-link");
    const portfolioUrl = shortPortfolioUrl(profile, config.appUrl || baseUrl);
    if (portfolioUrl) {
      plan.wordmark.href = portfolioUrl;
      // Human-readable cue printed beside the wordmark — tells print readers
      // the portfolio exists and is OCR/Lens-friendly.
      plan.wordmark.displayUrl = portfolioUrl.replace(/^https?:\/\//i, "");
    }

    res.locals.layout = false;
    // Vendored fonts: same files the engine MEASURED with — the render is
    // deterministic and CDN-independent. Null falls back to Google Fonts.
    const { fontFaceCss } = require("../composition/perception/font-files");
    const fontsCss = fontFaceCss([plan.typography.display, plan.typography.body]);
    // Fail loudly on metric/render skew: a family the engine measured but
    // cannot serve from the vendored set renders via the CDN fallback with
    // potentially DIFFERENT metrics than the ones geometry was solved
    // against (silent undersizing — audit 0.3). Vendored fonts are
    // authoritative; a miss here is a vendoring bug to fix, not a fallback
    // to rely on.
    for (const family of [plan.typography.display, plan.typography.body]) {
      if (family && (!fontsCss || !fontsCss.includes(`font-family:'${family}'`))) {
        console.error(
          `[compcard] VENDORED-FONT MISS: '${family}' is not in the vendored set — ` +
            "render will use the CDN fallback with unverified metrics",
        );
      }
    }
    // Render to a string first so any template error can still fall back to
    // the classic path (nothing has been written to the response yet).
    const html = await new Promise((resolve, reject) => {
      res.render(
        TEMPLATE_COMPOSED,
        {
          layout: false,
          title: `${profile.first_name} ${profile.last_name} - Comp Card`,
          profile,
          plan,
          statsBlock,
          imagesById,
          baseUrl,
          printBleed,
          fontsCss,
          frontProgram: plan.frontProgram || null,
          // Cutout source for cover-story/cutout figure layers. No pre-matted
          // cutout image exists in the pipeline yet, so this is null and the
          // figure layer degrades to the base photo (never breaks).
          cutoutSrc: null,
        },
        (err, output) => (err ? reject(err) : resolve(output)),
      );
    });

    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("X-CompCard-Engine", "composed");
    res.set("X-CompCard-Seed", toSafeMetadataToken(seed, "auto", 96));
    // Editions (plan 2.9): expose the resolved edition on response headers.
    // Present only when the engine is active — a flag-off render carries no
    // edition headers.
    if (plan.edition) {
      res.set("X-CompCard-Edition", plan.edition.id);
      res.set("X-CompCard-Edition-Field", plan.edition.field);
      res.set("X-CompCard-Edition-Register", plan.edition.register);
    }
    const bleedOffset = printBleed ? 0.125 : 0;
    const markHeader = (rect) =>
      rect
        ? [rect.x + bleedOffset, rect.y + bleedOffset, rect.w, rect.h].join(",")
        : null;
    const frontMark = markHeader(plan.wordmark && plan.wordmark.front);
    const backMark = markHeader(plan.wordmark && plan.wordmark.back);
    if (portfolioUrl && frontMark && backMark) {
      res.set("X-CompCard-Portfolio-Url", portfolioUrl);
      res.set("X-CompCard-Wordmark-Front", frontMark);
      res.set("X-CompCard-Wordmark-Back", backMark);
      // Header-safe title: printable ASCII only (HTTP headers are latin1;
      // spaces are fine — toSafeMetadataToken would mangle them).
      const headerTitle = `${profile.first_name} ${profile.last_name} - Comp Card`
        .replace(/[^\x20-\x7E]/g, "")
        .trim()
        .slice(0, 120);
      if (headerTitle) res.set("X-CompCard-Title", headerTitle);
    }
    res.send(html);
    return true;
  } catch (error) {
    console.error("[renderComposedView] ERROR:", error.message);
    // If headers already went out we cannot fall back; report handled.
    return res.headersSent;
  }
}

// Helper function to render the new 2-page standard comp card
async function renderStandardView(req, res, data, isDemo) {
  const engine = resolveCompCardEngine(req);
  if (engine === "composed") {
    const handled = await renderComposedView(req, res, data, isDemo);
    if (handled) return;
    console.warn(
      "[renderStandardView] composed engine failed — falling back to classic",
    );
    res.set("X-CompCard-Engine", "classic-fallback");
  }

  const { profile, images } = data;

  // Theme selection: for standard cards, default is pholio-standard
  let themeKey = req.query.theme || profile.pdf_theme || "pholio-standard";
  let theme = getTheme(themeKey);
  if (!theme) {
    themeKey = "pholio-standard";
    theme = getTheme(themeKey);
  }

  // Downgrade Pro-only themes for non-Pro users
  if (isProTheme(themeKey) && !profile.is_pro) {
    themeKey = "pholio-standard";
    theme = getTheme(themeKey);
  }

  // Apply customizations (Pro only)
  let customizations = null;
  if (!isDemo && profile.is_pro && profile.pdf_customizations) {
    try {
      customizations =
        typeof profile.pdf_customizations === "string"
          ? JSON.parse(profile.pdf_customizations)
          : profile.pdf_customizations;
    } catch {
      customizations = null;
    }
  }
  const mergedTheme =
    mergeThemeWithCustomization(theme, customizations) || theme;

  // Select best images for the 2-page layout (optional ?seed= for reproducible picks)
  const { seed, locks, artDirection, metadata } =
    resolveCompCardGenerationMetadata(req, mergedTheme);
  const { heroImage, gridImages } = selectCompCardImages(images, {
    seed,
    locks,
    preferRoles: artDirection.rolePreference
      ? {
          hero: "headshot",
          grid: artDirection.rolePreference,
        }
      : undefined,
  });
  const generationMode = resolveGenerationMode(req);
  const guardrailReport = evaluateCompCardGuardrails({
    profile,
    images,
    heroImage,
    gridImages,
    mode: generationMode,
  });

  // Load archetype
  const archetype = await loadArchetype(profile.id);

  // QR code (Pro + non-demo)
  let qrCode = null;
  if (!isDemo && profile.is_pro) {
    try {
      const portfolioUrl = `${req.protocol}://${req.get("host")}/portfolio/${profile.slug}`;
      qrCode = await QRCode.toDataURL(portfolioUrl, { width: 128, margin: 1 });
    } catch {
      qrCode = null;
    }
  }

  const baseUrl = `${req.protocol}://${req.get("host")}`;

  res.locals.layout = false;
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("X-CompCard-Seed", metadata.seed);
  res.set("X-CompCard-Layout-Family", metadata.layoutFamily);
  res.set("X-CompCard-Style-Variant", metadata.styleVariant);
  if (metadata.layoutFamilyLabel) {
    res.set("X-CompCard-Layout-Family-Label", metadata.layoutFamilyLabel);
  }
  if (metadata.styleVariantLabel) {
    res.set("X-CompCard-Style-Variant-Label", metadata.styleVariantLabel);
  }

  try {
    res.render(TEMPLATE_STANDARD, {
      layout: false,
      title: `${profile.first_name} ${profile.last_name} - Comp Card`,
      profile,
      heroImage,
      gridImages,
      theme: artDirection.appliedTheme,
      themeKey,
      layoutFamily: artDirection.layoutFamily,
      styleVariant: artDirection.styleVariant,
      layoutPatch: artDirection.layoutPatch,
      styleTokens: artDirection.styleTokens,
      compCardMetadata: metadata,
      guardrailReport,
      archetype,
      isPro: profile.is_pro,
      qrCode,
      heightFeet: toFeetInches(profile.height_cm),
      // Canonical, track-driven stats (Wave 2C). Classic is the composed
      // engine's fallback, so it must not render blanks from dropped
      // profile.bust/waist/hips columns (audit P1-6).
      stats: buildCanonicalStats(profile),
      baseUrl,
    });
  } catch (renderError) {
    console.error("[renderStandardView] ERROR:", renderError.message);
    return renderSimpleError(
      res,
      500,
      "Error",
      "Failed to render comp card template.",
    );
  }
}

// Helper function to render PDF view with profile data
function renderPdfView(req, res, data, isDemo) {
  const { profile, images } = data;
  const hero = profile.hero_image_path;
  const gallery = hero ? images.filter((img) => img.path !== hero) : images;

  // Get theme from query parameter, default to profile's saved theme or default
  let themeKey = req.query.theme || profile.pdf_theme || getDefaultTheme();
  console.log("[renderPdfView] Theme selection:", {
    requested: req.query.theme,
    profileTheme: profile.pdf_theme,
    selected: themeKey,
    isDemo: isDemo,
  });

  // Validate theme exists
  let theme = getTheme(themeKey);
  if (!theme) {
    console.warn("[renderPdfView] Theme not found, using default:", themeKey);
    themeKey = getDefaultTheme();
    theme = getTheme(themeKey);
  }

  // Check if Studio+ theme is selected but user is not Studio+
  if (isProTheme(themeKey) && !profile.is_pro) {
    console.warn(
      "[renderPdfView] Studio+ theme selected for non-Studio+ user, using default:",
      themeKey,
    );
    themeKey = getDefaultTheme();
    theme = getTheme(themeKey);
  }

  console.log("[renderPdfView] Final theme:", {
    key: themeKey,
    name: theme.name,
    isPro: theme.isPro,
  });

  // Load customizations from database (Studio+ users only) - skip for demo
  let customizations = null;
  if (!isDemo && profile.is_pro && profile.pdf_customizations) {
    try {
      customizations =
        typeof profile.pdf_customizations === "string"
          ? JSON.parse(profile.pdf_customizations)
          : profile.pdf_customizations;
    } catch (error) {
      console.error("Error parsing PDF customizations:", error);
      customizations = null;
    }
  }

  // Merge theme with customizations
  let mergedTheme = mergeThemeWithCustomization(theme, customizations);

  // Ensure mergedTheme has all required properties
  if (!mergedTheme) {
    console.error(
      "[renderPdfView] mergedTheme is null, falling back to default theme",
    );
    mergedTheme = getTheme(getDefaultTheme());
  }

  // Ensure mergedTheme has all required properties with fallbacks
  if (!mergedTheme.colors) {
    console.warn(
      "[renderPdfView] mergedTheme.colors is missing, using default colors",
    );
    mergedTheme.colors = {
      background: "#FAF9F7",
      text: "#2D2D2D",
      accent: "#C9A55A",
    };
  }

  if (!mergedTheme.fonts) {
    console.warn(
      "[renderPdfView] mergedTheme.fonts is missing, using default fonts",
    );
    mergedTheme.fonts = {
      name: "Playfair Display",
      bio: "Lora",
      stats: "Inter",
    };
  }

  // Ensure layout exists (fallback to default if missing)
  if (!mergedTheme.layout) {
    console.warn(
      "[renderPdfView] mergedTheme.layout is missing, using default layout",
    );
    mergedTheme.layout = {
      headerPosition: "top",
      imageGrid: { cols: 2, rows: 2 },
      bioPosition: "bottom-center",
      statsPosition: "header-right",
    };
  }

  // Ensure profile has required fields
  if (!profile || !profile.first_name || !profile.last_name) {
    console.error("[renderPdfView] Profile is missing required fields:", {
      hasProfile: !!profile,
      hasFirstName: !!(profile && profile.first_name),
      hasLastName: !!(profile && profile.last_name),
    });
    throw new Error(
      "Profile is missing required fields (first_name, last_name)",
    );
  }

  // Build base URL for images
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  // Generate QR code for Studio+ users linking to portfolio - skip for demo (not studio+)
  // Note: QR code generation is async, but we'll handle it synchronously for now
  // If it fails, we'll just skip it
  let qrCodeDataUrl = null;
  if (!isDemo && profile.is_pro) {
    try {
      // Generate QR code synchronously (this might block, but it's fast)
      const portfolioUrl = `${baseUrl}/portfolio/${profile.slug}`;
      // QRCode.toDataURL is async, but we'll skip it for now to avoid blocking
      // We can make this async later if needed
      qrCodeDataUrl = null; // Skip QR code for now to ensure fast rendering
    } catch (error) {
      console.error("QR code generation failed:", error);
    }
  }

  // Get font CSS values (with fallbacks)
  const fontCSS = {
    nameFont: getFontFamilyCSS(mergedTheme.fonts?.name || theme.fonts?.name),
    bioFont: getFontFamilyCSS(mergedTheme.fonts?.bio || theme.fonts?.bio),
    statsFont: getFontFamilyCSS(mergedTheme.fonts?.stats || theme.fonts?.stats),
  };

  // Generate Google Fonts URL
  const googleFontsUrl = generateThemeFontsUrl(mergedTheme);

  // Generate layout classes (with fallback)
  const layoutClasses = generateLayoutClasses(mergedTheme.layout);
  const imageGridCSS = getImageGridCSS(mergedTheme.layout);

  // Get agency logo (Studio+ users only) - skip for demo
  let agencyLogo = null;
  if (
    !isDemo &&
    profile.is_pro &&
    customizations &&
    customizations.agencyLogo
  ) {
    agencyLogo = customizations.agencyLogo;
  }

  // Disable layout for PDF view - it's a standalone HTML document
  res.locals.layout = false;

  // Set content type to HTML (important for PDF rendering)
  res.set("Content-Type", "text/html; charset=utf-8");

  console.log("[renderPdfView] Rendering template with data:", {
    profileName: `${profile.first_name} ${profile.last_name}`,
    imageCount: gallery.length,
    hero: hero ? "yes" : "no",
    themeKey: themeKey,
    hasGoogleFonts: !!googleFontsUrl,
    hasLayoutClasses: !!layoutClasses,
    hasTheme: !!mergedTheme,
    hasThemeColors: !!(mergedTheme && mergedTheme.colors),
    bgColor:
      mergedTheme && mergedTheme.colors
        ? mergedTheme.colors.background
        : "not set",
    textColor:
      mergedTheme && mergedTheme.colors ? mergedTheme.colors.text : "not set",
    baseUrl: baseUrl,
  });

  // Verify critical data before rendering
  if (!profile || !profile.first_name || !profile.last_name) {
    console.error("[renderPdfView] CRITICAL: Profile missing required fields!");
    return renderSimpleError(res, 500, "Error", "Profile data is incomplete.");
  }

  if (!mergedTheme || !mergedTheme.colors) {
    console.error("[renderPdfView] CRITICAL: Theme is missing colors!");
    return renderSimpleError(
      res,
      500,
      "Error",
      "Theme configuration is incomplete.",
    );
  }

  try {
    // Call res.render() directly - it will send the response
    // res.render() doesn't return a Promise, so we don't need to await it
    res.render(TEMPLATE_LEGACY, {
      layout: false,
      title: `${profile.first_name} ${profile.last_name} - Comp Card`,
      profile,
      images: gallery,
      hero,
      heightFeet: toFeetInches(profile.height_cm),
      theme: mergedTheme,
      themeKey: themeKey,
      baseUrl,
      isPro: profile.is_pro,
      qrCode: qrCodeDataUrl,
      portfolioUrl: `${baseUrl}/portfolio/${profile.slug}`,
      fontCSS,
      googleFontsUrl,
      layoutClasses,
      imageGridCSS,
      agencyLogo,
    });

    console.log("[renderPdfView] Template rendered successfully");
  } catch (renderError) {
    console.error("[renderPdfView] ERROR rendering template:", {
      message: renderError.message,
      stack: renderError.stack,
      profileName: profile
        ? `${profile.first_name} ${profile.last_name}`
        : "no profile",
    });
    return renderSimpleError(
      res,
      500,
      "Error",
      "Failed to render PDF template.",
    );
  }
}

router.get("/pdf/view/:slug", async (req, res, next) => {
  const slug = req.params.slug;
  let data = null;
  let isDemo = false;

  try {
    console.log(
      "[PDF View] Route hit for slug:",
      slug,
      "query:",
      req.query,
      "theme:",
      req.query.theme,
    );

    // For demo slug, ALWAYS use demo data first (works even if database is empty)
    // This ensures demo page always works
    if (slug === "elara-k") {
      const demoData = getDemoProfile(slug);
      if (demoData) {
        console.log("[PDF View] Using demo profile data for demo slug:", slug);
        data = demoData;
        isDemo = true;
        // Skip database lookup for demo slug - use demo data directly
      } else {
        console.error("[PDF View] Demo data not found for slug:", slug);
        return renderSimpleError(
          res,
          500,
          "Demo Error",
          "Demo profile data is not available.",
        );
      }
    }

    // Try to load from database (only if not already using demo data)
    if (!data) {
      try {
        data = await loadProfile(slug);
        console.log(
          "[PDF View] Profile loaded from database:",
          data ? "found" : "not found",
        );
      } catch (dbError) {
        // If database error, check if it's a missing tables error or connection error
        if (isMissingTablesError(dbError) || isDatabaseError(dbError)) {
          console.log(
            "[PDF View] Database error, checking demo fallback for:",
            slug,
          );
          // For demo slug, use fallback data
          const demoData = getDemoProfile(slug);
          if (demoData) {
            data = demoData;
            isDemo = true;
            console.log(
              "[PDF View] Using demo profile data due to database error",
            );
          } else {
            // Not a demo slug and database is unavailable - return error
            return renderSimpleError(
              res,
              500,
              "Database Error",
              "Unable to connect to the database. Please check your database configuration.",
            );
          }
        } else {
          // Other database errors - rethrow to be caught by outer catch
          throw dbError;
        }
      }
    }

    // If profile not found in database and not using demo, try demo fallback
    if (!data && slug !== "elara-k") {
      console.log(
        "[PDF View] Profile not found in database, checking demo fallback",
      );
      const demoData = getDemoProfile(slug);
      if (demoData) {
        data = demoData;
        isDemo = true;
        console.log("[PDF View] Using demo profile fallback for slug:", slug);
      } else {
        console.log(
          "[PDF View] Profile not found and no demo fallback available for slug:",
          slug,
        );
        return renderSimpleError(
          res,
          404,
          "Profile not found",
          'The profile "' + slug + '" does not exist.',
        );
      }
    }

    // Ensure we have data
    if (!data) {
      console.error("[PDF View] No data available for slug:", slug);
      return renderSimpleError(
        res,
        500,
        "Error",
        "Unable to load profile data.",
      );
    }

    // Validate data structure before rendering
    if (!data.profile || !data.images) {
      console.error(
        "[PDF View] Invalid data structure for slug:",
        slug,
        "profile:",
        !!data.profile,
        "images:",
        !!data.images,
      );
      return renderSimpleError(
        res,
        500,
        "Error",
        "Invalid profile data structure.",
      );
    }

    if (!isDemo && !minorPublicExposureAllowed(data.profile)) {
      return renderMinorPdfBlocked(res);
    }

    const diagnosticsMode =
      req.query.diagnostics === "1" ||
      req.query.spec === "1" ||
      req.query.compose === "1" ||
      req.query.format === "json";
    if (diagnosticsMode && req.query.legacy !== "true") {
      let themeKey =
        req.query.theme || data.profile.pdf_theme || "pholio-standard";
      let theme = getTheme(themeKey);
      if (!theme) {
        themeKey = "pholio-standard";
        theme = getTheme(themeKey);
      }
      if (isProTheme(themeKey) && !data.profile.is_pro) {
        themeKey = "pholio-standard";
        theme = getTheme(themeKey);
      }

      let customizations = null;
      if (!isDemo && data.profile.is_pro && data.profile.pdf_customizations) {
        try {
          customizations =
            typeof data.profile.pdf_customizations === "string"
              ? JSON.parse(data.profile.pdf_customizations)
              : data.profile.pdf_customizations;
        } catch {
          customizations = null;
        }
      }

      const mergedTheme =
        mergeThemeWithCustomization(theme, customizations) || theme;
      const { seed, locks, artDirection, metadata } =
        resolveCompCardGenerationMetadata(req, mergedTheme);
      const { heroImage, gridImages } = selectCompCardImages(
        data.images || [],
        {
          seed,
          locks,
          preferRoles: artDirection.rolePreference
            ? {
                hero: "headshot",
                grid: artDirection.rolePreference,
              }
            : undefined,
        },
      );
      const generationMode = resolveGenerationMode(req);
      const guardrailReport = evaluateCompCardGuardrails({
        profile: data.profile,
        images: data.images || [],
        heroImage,
        gridImages,
        mode: generationMode,
      });
      return res.json({
        ok: true,
        slug: data.profile.slug,
        theme: themeKey,
        mode: generationMode,
        compCard: metadata,
        selection: {
          heroImageId: heroImage?.id || null,
          gridImageIds: (gridImages || []).map((img) => img?.id || null),
        },
        guardrailReport,
      });
    }

    // Render PDF view with profile data
    console.log("[PDF View] Rendering PDF for profile:", {
      slug: data.profile.slug,
      name: data.profile.first_name + " " + data.profile.last_name,
      isDemo: isDemo,
      imageCount: data.images.length,
      requestedTheme: req.query.theme || "none",
      legacy: req.query.legacy === "true",
    });

    // Default: new 2-page standard template.  Add ?legacy=true for old 1-page layout.
    if (req.query.legacy === "true") {
      renderPdfView(req, res, data, isDemo);
    } else {
      await renderStandardView(req, res, data, isDemo);
    }
    return; // Response is sent by res.render()
  } catch (error) {
    // Log errors for debugging
    console.error("[PDF View Route] Error in route:", {
      message: error.message,
      code: error.code,
      name: error.name,
      slug: slug,
      stack: error.stack,
    });

    // Check if response was already sent
    if (res.headersSent) {
      console.error(
        "[PDF View Route] Response already sent, cannot send error response",
      );
      return;
    }

    // Always try to return an error response instead of passing to next()
    // This ensures the iframe gets a response even if there's an error

    // For demo slug, always try demo data as last resort
    if (slug === "elara-k") {
      const demoData = getDemoProfile(slug);
      if (demoData) {
        console.log(
          "[PDF View Route] Last resort: Using demo data in catch for:",
          slug,
        );
        try {
          if (req.query.legacy === "true") {
            renderPdfView(req, res, demoData, true);
          } else {
            await renderStandardView(req, res, demoData, true);
          }
          return;
        } catch (renderError) {
          console.error(
            "[PDF View Route] Error rendering demo PDF in catch:",
            renderError.message,
          );
          // Fall through to return error page
        }
      }
    }

    // Check if it's a database error
    if (isMissingTablesError(error) || isDatabaseError(error)) {
      // For demo slug, try demo data even on database error
      if (slug === "elara-k") {
        const demoData = getDemoProfile(slug);
        if (demoData) {
          console.log(
            "[PDF View Route] Database error, using demo data for:",
            slug,
          );
          try {
            renderPdfView(req, res, demoData, true);
            return; // Response is sent by res.render()
          } catch (renderError) {
            console.error(
              "[PDF View Route] Error rendering demo PDF after database error:",
              renderError.message,
            );
            return renderSimpleError(
              res,
              500,
              "Error",
              "Unable to render PDF preview. Please try again.",
            );
          }
        }
      }
      return renderSimpleError(
        res,
        500,
        "Database Error",
        "Unable to connect to the database. Please check your database configuration.",
      );
    }

    // For template rendering errors, return a simple error page
    if (
      error.message &&
      (error.message.includes("render") ||
        error.message.includes("template") ||
        error.message.includes("EJS"))
    ) {
      console.error(
        "[PDF View Route] Template rendering error:",
        error.message,
      );
      return renderSimpleError(
        res,
        500,
        "Error",
        "Unable to render PDF preview. Please try again.",
      );
    }

    // For any other error, return error page instead of passing to next()
    // This ensures the iframe gets a response
    console.error("[PDF View Route] Returning error page for unhandled error");
    return renderSimpleError(
      res,
      500,
      "Error",
      "Unable to load PDF preview. Please try again.",
    );
  }
});

/* ── Digitals sheet — the raw, dated set of digital frames + measurements that
   agencies request. Distinct from the comp card (no composition engine). These
   routes MUST be registered before "/pdf/:slug" so "digitals" isn't read as a
   profile slug. ─────────────────────────────────────────────────────────── */

const DIGITALS_SHOT_LABELS = {
  headshot: "Headshot",
  beauty: "Beauty",
  three_quarter: "Three-quarter",
  half_body: "Half body",
  full_length: "Full length",
  full_body: "Full length",
  profile: "Profile",
  profile_left: "Profile",
  profile_right: "Profile",
  back: "Back",
  detail: "Detail",
};

function buildDigitalsSheetData(profile, images) {
  const norm = (v) =>
    String(v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const fmtMonth = (d) => {
    if (!d) return null;
    const x = new Date(d);
    return Number.isNaN(x.getTime())
      ? null
      : x.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };
  const resolveUrl = (img) => {
    const u = img.public_url || img.path || "";
    if (!u) return "";
    if (u.startsWith("http") || u.startsWith("/")) return u;
    return `/${u}`;
  };

  const digitals = (images || [])
    .filter((img) => norm(img.image_type) === "digital")
    .map((img) => ({
      url: resolveUrl(img),
      shotLabel: DIGITALS_SHOT_LABELS[norm(img.shot_type)] || "Digital",
      capturedLabel: fmtMonth(img.captured_at) || "Undated",
    }));

  const measure = (keys) => {
    for (const k of keys) {
      const v = profile[k];
      if (v !== null && v !== undefined && v !== "") return v;
    }
    return null;
  };
  const cmIn = (cm) => `${cm} cm / ${(Number(cm) / 2.54).toFixed(1)}″`;
  const gender = norm(profile.gender);
  const isMale = ["male", "man", "men", "m"].includes(gender);

  const stats = [];
  const heightCm = measure(["height_cm"]);
  if (heightCm) {
    const ftin = toFeetInches(heightCm);
    stats.push({ label: "Height", value: `${heightCm} cm / ${ftin}` });
  }
  const bust = measure(["bust_cm", "bust", "chest_cm", "chest"]);
  if (bust) stats.push({ label: isMale ? "Chest" : "Bust", value: cmIn(bust) });
  const waist = measure(["waist_cm", "waist"]);
  if (waist) stats.push({ label: "Waist", value: cmIn(waist) });
  const hips = measure(["hips_cm", "hips"]);
  if (hips) stats.push({ label: "Hips", value: cmIn(hips) });
  const inseam = measure(["inseam_cm"]);
  if (isMale && inseam) stats.push({ label: "Inseam", value: cmIn(inseam) });
  const shoe = measure(["shoe_size"]);
  if (shoe) stats.push({ label: "Shoe", value: String(shoe) });
  const dress = measure(["dress_size"]);
  if (dress) stats.push({ label: isMale ? "Suit" : "Dress", value: String(dress) });
  const hair = measure(["hair_color", "hair"]);
  const eyes = measure(["eye_color", "eyes"]);
  if (hair || eyes) {
    stats.push({
      label: "Hair · Eyes",
      value: [hair, eyes].filter(Boolean).join(" · "),
    });
  }

  const name = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || profile.name || "Talent";

  return {
    name,
    location: profile.location || "Global",
    digitals,
    stats,
    measuredLabel: fmtMonth(profile.measurements_updated_at),
    generatedLabel: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };
}

// GET /pdf/digitals/view/:slug — printable HTML the PDF renderer navigates to.
router.get("/pdf/digitals/view/:slug", async (req, res, next) => {
  try {
    const data = await loadProfile(req.params.slug);
    if (!data) return res.status(404).send("Profile not found");
    if (!minorPublicExposureAllowed(data.profile)) {
      return res
        .status(403)
        .send("Guardian consent is required before digitals can be shared.");
    }
    return res.render(path.join(pdfTemplateDir, "digitals-sheet.ejs"), {
      layout: false,
      ...buildDigitalsSheetData(data.profile, data.images),
    });
  } catch (error) {
    return next(error);
  }
});

// GET /pdf/digitals/:slug — the digitals sheet as a PDF (?download=1 to attach).
router.get("/pdf/digitals/:slug", async (req, res, next) => {
  const slug = req.params.slug;
  try {
    const data = await loadProfile(slug);
    if (!data) return res.status(404).json({ error: "Profile not found" });
    if (!minorPublicExposureAllowed(data.profile)) {
      return res.status(403).json({
        error:
          "Guardian consent is required before digitals can be shared publicly.",
        code: "MINOR_CONSENT_REQUIRED",
      });
    }
    const rawPdf = await renderDigitalsSheet(slug);
    const buffer = Buffer.isBuffer(rawPdf) ? rawPdf : Buffer.from(rawPdf);
    if (req.query.download) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="pholio-${slug}-digitals.pdf"`,
      );
    } else {
      res.setHeader("Content-Disposition", "inline");
    }
    res.contentType("application/pdf");
    return res.send(buffer);
  } catch (error) {
    console.error("[Digitals PDF] Error:", error.message);
    return next(error);
  }
});

router.get("/pdf/:slug", async (req, res, next) => {
  const slug = req.params.slug;
  let data = null;
  let isDemo = false;

  try {
    console.log(
      "[PDF Download] Loading profile for slug:",
      slug,
      "query:",
      req.query,
    );

    // For demo slug, ALWAYS use demo data first (works even if database is empty)
    if (slug === "elara-k") {
      const demoData = getDemoProfile(slug);
      if (demoData) {
        console.log(
          "[PDF Download] Using demo profile data for demo slug:",
          slug,
        );
        data = demoData;
        isDemo = true;
      }
    }

    // Try to load from database (only if not already using demo data)
    if (!data) {
      try {
        data = await loadProfile(slug);
        if (data) {
          console.log("[PDF Download] Profile loaded from database:", slug);
        }
      } catch (dbError) {
        // If database error, check if it's a connection error and we have demo data
        if (isDatabaseError(dbError) && slug === "elara-k") {
          console.log(
            "[PDF Download] Database error, using demo fallback for:",
            slug,
          );
          const demoData = getDemoProfile(slug);
          if (demoData) {
            data = demoData;
            isDemo = true;
          }
        } else {
          // Re-throw database errors that aren't handled
          throw dbError;
        }
      }
    }

    // If profile not found in database and not using demo, try demo fallback
    if (!data && slug === "elara-k") {
      console.log(
        "[PDF Download] Profile not found in database, checking demo fallback",
      );
      const demoData = getDemoProfile(slug);
      if (demoData) {
        data = demoData;
        isDemo = true;
        console.log(
          "[PDF Download] Using demo profile fallback for slug:",
          slug,
        );
      }
    }

    // If still no data, return 404
    if (!data) {
      console.log("[PDF Download] Profile not found for slug:", slug);
      return res.status(404).json({ error: "Profile not found" });
    }

    const { profile } = data;

    if (!isDemo && !minorPublicExposureAllowed(profile)) {
      return res.status(403).json({
        error: "Guardian consent is required before this comp card can be shared publicly.",
        code: "MINOR_CONSENT_REQUIRED",
      });
    }

    // Get theme from query parameter
    let themeKey = req.query.theme || profile.pdf_theme || getDefaultTheme();

    // Validate theme exists
    let theme = getTheme(themeKey);
    if (!theme) {
      themeKey = getDefaultTheme();
      theme = getTheme(themeKey);
    }

    // Check if Studio+ theme is selected but user is not Studio+
    if (isProTheme(themeKey) && !profile.is_pro) {
      themeKey = getDefaultTheme();
      theme = getTheme(themeKey);
    }

    // Save theme preference if user is logged in and owns this profile (skip for demo)
    if (
      !isDemo &&
      req.session.userId &&
      profile.user_id === req.session.userId &&
      themeKey !== profile.pdf_theme
    ) {
      try {
        await knex("profiles")
          .where({ id: profile.id })
          .update({ pdf_theme: themeKey });
      } catch (dbError) {
        // Log database error but don't fail PDF generation
        console.error(
          "[PDF Download Route] Error saving theme preference:",
          dbError.message,
        );
      }
    }

    // Build URL with theme parameter (customizations are loaded in the view route)
    const url = new URL(`/pdf/view/${req.params.slug}`, config.pdfBaseUrl);
    if (themeKey) {
      url.searchParams.set("theme", themeKey);
    }
    const dlSeed = req.query.seed;
    if (dlSeed != null && dlSeed !== "") {
      url.searchParams.set(
        "seed",
        String(Array.isArray(dlSeed) ? dlSeed[0] : dlSeed),
      );
    }
    const dlLayoutFamily = req.query.layoutFamily;
    if (dlLayoutFamily != null && dlLayoutFamily !== "") {
      url.searchParams.set(
        "layoutFamily",
        String(
          Array.isArray(dlLayoutFamily) ? dlLayoutFamily[0] : dlLayoutFamily,
        ),
      );
    }
    const dlStyleVariant = req.query.styleVariant;
    if (dlStyleVariant != null && dlStyleVariant !== "") {
      url.searchParams.set(
        "styleVariant",
        String(
          Array.isArray(dlStyleVariant) ? dlStyleVariant[0] : dlStyleVariant,
        ),
      );
    }
    const dlLockHeroId = req.query.lockHeroId;
    if (dlLockHeroId != null && dlLockHeroId !== "") {
      url.searchParams.set(
        "lockHeroId",
        String(Array.isArray(dlLockHeroId) ? dlLockHeroId[0] : dlLockHeroId),
      );
    }
    const dlLockGridIds = req.query.lockGridIds;
    if (dlLockGridIds != null && dlLockGridIds !== "") {
      url.searchParams.set(
        "lockGridIds",
        String(Array.isArray(dlLockGridIds) ? dlLockGridIds[0] : dlLockGridIds),
      );
    }

    console.log("[PDF Download] Generating PDF:", {
      slug: slug,
      themeKey: themeKey,
      pdfBaseUrl: config.pdfBaseUrl,
      targetUrl: url.toString(),
      isDemo: isDemo,
    });

    let downloadCustomizations = null;
    if (!isDemo && profile.is_pro && profile.pdf_customizations) {
      try {
        downloadCustomizations =
          typeof profile.pdf_customizations === "string"
            ? JSON.parse(profile.pdf_customizations)
            : profile.pdf_customizations;
      } catch {
        downloadCustomizations = null;
      }
    }
    const mergedTheme =
      mergeThemeWithCustomization(theme, downloadCustomizations) || theme;
    const { seed, locks, artDirection } = resolveCompCardGenerationMetadata(
      req,
      mergedTheme,
    );
    const { heroImage, gridImages } = selectCompCardImages(data.images || [], {
      seed,
      locks,
      preferRoles: artDirection.rolePreference
        ? {
            hero: "headshot",
            grid: artDirection.rolePreference,
          }
        : undefined,
    });
    const generationMode = resolveGenerationMode(req);
    const guardrailReport = evaluateCompCardGuardrails({
      profile,
      images: data.images || [],
      heroImage,
      gridImages,
      mode: generationMode,
    });
    if (generationMode === "master" && guardrailReport.blockingIssueCount > 0) {
      return res.status(422).json({
        error: "Guardrails failed",
        code: "COMP_CARD_GUARDRAILS_FAILED",
        message: "Master export blocked due to comp-card guardrail violations.",
        guardrailReport,
      });
    }

    const rawPdf = await renderCompCard(req.params.slug, themeKey, {
      seed: req.query.seed,
      layoutFamily: req.query.layoutFamily,
      styleVariant: req.query.styleVariant,
      lockHeroId: req.query.lockHeroId,
      lockGridIds: req.query.lockGridIds,
      engine: req.query.engine,
      units: req.query.units,
      print: req.query.print,
      structure: req.query.structure,
      treatment: req.query.treatment,
      board: req.query.board,
      preset: req.query.preset,
      // Vision jury: DEFAULT ON for downloads when a Groq key is present
      // (a download is the master artifact — worth K candidate renders and
      // one vision call). ?jury=0 opts out; keyless environments skip it
      // inside the generator automatically.
      jury: normalizeQueryValue(req.query.jury) !== "0",
    });
    const buffer = Buffer.isBuffer(rawPdf) ? rawPdf : Buffer.from(rawPdf);

    // Enforce stricter response size only in serverless environments (Netlify ~6MB limit).
    const maxResponseSize = config.isServerless
      ? 5.5 * 1024 * 1024
      : 20 * 1024 * 1024;
    const maxSizeLabel = config.isServerless ? "6MB" : "20MB";
    if (buffer.length > maxResponseSize) {
      console.error("[PDF Download Route] PDF too large:", {
        size: buffer.length,
        sizeMB: (buffer.length / 1024 / 1024).toFixed(2),
        slug: slug,
        themeKey: themeKey,
      });
      return res.status(413).json({
        error: "PDF too large",
        message:
          "The generated PDF is too large to download. Please try a different theme or contact support.",
        size: buffer.length,
        sizeMB: (buffer.length / 1024 / 1024).toFixed(2),
        maxSize: maxSizeLabel,
      });
    }

    // Log PDF download analytics (non-blocking, don't wait)
    if (!isDemo && profile.id) {
      logAnalyticsEvent(
        profile.id,
        "download",
        {
          slug: slug,
          theme: themeKey,
          size: buffer.length,
        },
        req,
      ).catch((err) => {
        console.error("[PDF Download] Error logging download analytics:", err);
        // Don't block response - analytics is non-critical
      });
      recordProfileEvent({
        profile,
        action: "card_pull",
        req,
        metadata: { theme: themeKey },
      });

      // Log activity if user owns this profile (non-blocking)
      if (
        req.session &&
        req.session.userId &&
        profile.user_id === req.session.userId
      ) {
        try {
          await knex("activities").insert({
            id: uuidv4(),
            user_id: req.session.userId,
            activity_type: "pdf_downloaded",
            metadata: JSON.stringify({
              profileId: profile.id,
              theme: themeKey,
              size: buffer.length,
            }),
            created_at: knex.fn.now(),
          });
        } catch (activityError) {
          console.error(
            "[PDF Download] Error logging activity:",
            activityError,
          );
          // Don't block response - activity logging is non-critical
        }
      }
    }

    if (req.query.download) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ZipSite-${req.params.slug}-compcard.pdf"`,
      );
    } else {
      res.setHeader("Content-Disposition", "inline");
    }
    res.contentType("application/pdf");

    // Stream the PDF response to avoid loading entire buffer in memory
    return res.send(buffer);
  } catch (error) {
    // Log database connection errors for debugging
    console.error("[PDF Download Route] Error:", {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
    });

    // Check if it's a missing tables error (needs migrations)
    if (isMissingTablesError(error)) {
      console.error(
        "[PDF Download Route] Missing tables error detected - migrations need to be run",
      );
      return res.status(500).json({
        error: "Database setup required",
        message:
          "Database tables do not exist. Please run migrations to set up the database.",
        code: error.code,
        migrationRequired: true,
        details:
          process.env.NODE_ENV !== "production" ? error.message : undefined,
        instructions: "Call POST /api/migrate to run database migrations.",
      });
    }

    // Check if it's a database connection error
    if (isDatabaseError(error)) {
      console.error("[PDF Download Route] Database connection error detected");
      // Return JSON error response for download endpoint
      return res.status(500).json({
        error: "Database connection error",
        message:
          "Unable to connect to the database. Please check your database configuration.",
        code: error.code,
        details:
          process.env.NODE_ENV !== "production" ? error.message : undefined,
      });
    }

    // Check if it's a Puppeteer error (browser launch, navigation, PDF generation)
    if (
      error.message &&
      (error.message.includes("browser") ||
        error.message.includes("puppeteer") ||
        error.message.includes("navigation") ||
        error.message.includes("timeout") ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("Failed to launch") ||
        error.message.includes("Failed to load PDF view") ||
        error.message.includes("Failed to generate PDF") ||
        error.message.includes("Invalid PDF base URL"))
    ) {
      console.error("[PDF Download Route] Puppeteer error detected:", {
        message: error.message,
        code: error.code,
        pdfBaseUrl: config.pdfBaseUrl,
        slug: slug,
        themeKey: req.query.theme,
      });
      return res.status(500).json({
        error: "PDF generation error",
        message: "Unable to generate PDF. Please try again later.",
        details:
          process.env.NODE_ENV !== "production"
            ? {
                errorMessage: error.message,
                pdfBaseUrl: config.pdfBaseUrl,
                targetUrl: config.pdfBaseUrl
                  ? `${config.pdfBaseUrl}/pdf/view/${slug}?theme=${req.query.theme || "default"}`
                  : "N/A",
              }
            : undefined,
      });
    }

    // For other errors, pass to error handler
    return next(error);
  }
});

// API Endpoints for PDF Customization (Studio+ users only)

/**
 * Freeze a saved card's design (audit P1-6): compose the plan exactly the
 * way /pdf/view would render it (same forensics, mattes, cached brief,
 * direction pin, board conditioning) and persist it on the preset row with
 * the engine version. From then on the stored plan is authoritative — an
 * artifact a talent sends to agencies never silently redesigns.
 *
 * Best-effort by design: any failure leaves the preset unfrozen (it renders
 * from its saved parameters, the pre-freeze behavior) — saving never fails
 * because freezing did.
 */
async function freezePresetPlan(slug, presetRow) {
  try {
    const { composeCompCard, ENGINE_VERSION } = require("../composition");
    const { isDirectionStructure, boardAdvice } = require("../composition/directions");
    const { isEditionId } = require("../composition/editions");
    const data = await loadProfile(slug);
    if (!data || !data.profile) return;
    const { profile, images } = data;
    const forensicsById = await loadCompCardForensics(images, { isDemo: false });
    const matteById = await loadCompCardMattes(images, { isDemo: false });
    let representation = null;
    if (profile.partner_agency_id) {
      try {
        const agency = await knex("agencies")
          .where({ id: profile.partner_agency_id })
          .select("name")
          .first();
        representation = agency?.name || null;
      } catch {
        representation = null;
      }
    }
    const gridIds = (() => {
      try {
        const parsed = typeof presetRow.lock_grid_ids === "string"
          ? JSON.parse(presetRow.lock_grid_ids)
          : presetRow.lock_grid_ids;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    const { plan } = await composeCompCard({
      profile,
      images: images || [],
      archetype: await loadArchetype(profile.id),
      options: {
        seed: normalizeCompCardSeed(presetRow.seed),
        locks: { heroId: presetRow.lock_hero_id || null, gridIds },
        forensicsById,
        matteById,
        representation,
        frontEngine: "program",
        forceStructure: isDirectionStructure(presetRow.structure) ? presetRow.structure : null,
        forceTreatment: ["classic", "statement", "straddle", "over", "band", "inset"].includes(presetRow.treatment)
          ? presetRow.treatment
          : null,
        // A preset saved under an edition freezes with that edition pinned
        // (editions forced on for the freeze regardless of the global flag).
        ...(isEditionId(presetRow.edition)
          ? { editionsEnabled: true, edition: presetRow.edition }
          : {}),
        advice: boardAdvice(presetRow.board),
        briefStore: {
          load: async () => {
            try {
              const raw = profile.pdf_design_brief;
              if (!raw) return null;
              return typeof raw === "string" ? JSON.parse(raw) : raw;
            } catch {
              return null;
            }
          },
          save: null,
        },
      },
    });
    // Never persist plan.editionProgram — its `def` carries the catalog
    // entry's functions (toneWeight/photoAffinity). plan.edition and
    // plan.takeSignature are the frozen contract; the program def is
    // re-derivable from the edition id. Strip it before serializing.
    if (plan && plan.editionProgram) delete plan.editionProgram;
    await knex("comp_card_presets")
      .where({ id: presetRow.id })
      .update({
        plan_json: JSON.stringify(plan),
        engine_version: ENGINE_VERSION,
        updated_at: new Date(),
      });
  } catch (error) {
    console.warn(`[presets] freeze failed for ${presetRow?.id}: ${error.message}`);
  }
}

// GET /api/pdf/presets/:slug - List saved comp-card presets for this profile
router.get(
  "/api/pdf/presets/:slug",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );
      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const rows = await knex("comp_card_presets")
        .where({ profile_id: profile.id })
        .orderBy("updated_at", "desc")
        .orderBy("created_at", "desc");

      return res.json({
        ok: true,
        presets: rows.map(mapPresetRow),
      });
    } catch (error) {
      if (isDatabaseError(error)) {
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }
      return next(error);
    }
  },
);

// POST /api/pdf/presets/:slug - Create a new comp-card preset
router.post(
  "/api/pdf/presets/:slug",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );
      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const normalized = normalizePresetInput(req.body || {});
      const insertRow = buildPresetInsert(profile.id, normalized);
      let created = null;
      try {
        await knex.transaction(async (trx) => {
          await ensurePresetCapacity(trx, profile.id);
          await trx("comp_card_presets").insert(insertRow);
          created = await trx("comp_card_presets")
            .where({ id: insertRow.id })
            .first();
          await insertPresetRevision(trx, created, "create");
          await prunePresetRevisions(trx, created.id);
        });
      } catch (insertError) {
        if (isUniqueViolation(insertError)) {
          return res.status(409).json({
            error: "Preset name already exists",
            message: "A preset with this name already exists for this profile.",
          });
        }
        throw insertError;
      }
      // Freeze the design at save time (P1-6); the preset row is re-read so
      // the response carries frozen/engineVersion. Failure leaves the
      // preset parameter-rendered — never blocks the save.
      await freezePresetPlan(slug, created);
      const finalRow = await knex("comp_card_presets")
        .where({ id: created.id })
        .first();
      return res.status(201).json({
        ok: true,
        preset: mapPresetRow(finalRow || created),
      });
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code || undefined });
      }
      if (isDatabaseError(error)) {
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }
      return next(error);
    }
  },
);

// PUT /api/pdf/presets/:slug/:presetId - Update a saved preset
router.put(
  "/api/pdf/presets/:slug/:presetId",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug, presetId } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );
      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const existing = await knex("comp_card_presets")
        .where({ id: presetId, profile_id: profile.id })
        .first();
      if (!existing) {
        return res.status(404).json({ error: "Preset not found" });
      }

      const normalized = normalizePresetInput(req.body || {});
      let updated = null;
      try {
        await knex.transaction(async (trx) => {
          await trx("comp_card_presets")
            .where({ id: presetId })
            .update({
              name: normalized.name,
              seed: normalized.seed,
              layout_family: normalized.layout_family,
              style_variant: normalized.style_variant,
              lock_hero_id: normalized.lock_hero_id,
              lock_grid_ids: JSON.stringify(normalized.lock_grid_ids),
              board: normalized.board,
              market: normalized.market,
              structure: normalized.structure,
              treatment: normalized.treatment,
              edition: normalized.edition,
              updated_at: trx.fn.now(),
            });
          updated = await trx("comp_card_presets")
            .where({ id: presetId })
            .first();
          await insertPresetRevision(trx, updated, "update");
          await prunePresetRevisions(trx, updated.id);
        });
      } catch (updateError) {
        if (isUniqueViolation(updateError)) {
          return res.status(409).json({
            error: "Preset name already exists",
            message: "A preset with this name already exists for this profile.",
          });
        }
        throw updateError;
      }
      // Parameters changed → the frozen design must be re-captured (P1-6).
      await freezePresetPlan(slug, updated);
      const finalRow = await knex("comp_card_presets")
        .where({ id: presetId })
        .first();
      return res.json({ ok: true, preset: mapPresetRow(finalRow || updated) });
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code || undefined });
      }
      if (isDatabaseError(error)) {
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }
      return next(error);
    }
  },
);

// DELETE /api/pdf/presets/:slug/:presetId - Delete a saved preset
router.delete(
  "/api/pdf/presets/:slug/:presetId",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug, presetId } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );
      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const removed = await knex("comp_card_presets")
        .where({ id: presetId, profile_id: profile.id })
        .delete();
      if (!removed) {
        return res.status(404).json({ error: "Preset not found" });
      }

      return res.json({ ok: true });
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code || undefined });
      }
      if (isDatabaseError(error)) {
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }
      return next(error);
    }
  },
);

// POST /api/pdf/presets/:slug/:presetId/apply - Resolve preset into query params
router.post(
  "/api/pdf/presets/:slug/:presetId/apply",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug, presetId } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );
      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const preset = await knex("comp_card_presets")
        .where({ id: presetId, profile_id: profile.id })
        .first();
      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      await knex("comp_card_presets")
        .where({ id: presetId })
        .update({ last_used_at: knex.fn.now(), updated_at: knex.fn.now() });

      const refreshed = await knex("comp_card_presets")
        .where({ id: presetId })
        .first();
      const mapped = mapPresetRow(refreshed);
      return res.json({
        ok: true,
        preset: mapped,
        query: toPresetQuery(refreshed),
      });
    } catch (error) {
      if (isDatabaseError(error)) {
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }
      return next(error);
    }
  },
);

// GET /api/pdf/presets/:slug/:presetId/export - Export preset payload
router.get(
  "/api/pdf/presets/:slug/:presetId/export",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug, presetId } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );
      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const preset = await knex("comp_card_presets")
        .where({ id: presetId, profile_id: profile.id })
        .first();
      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      return res.json({
        ok: true,
        exportVersion: PRESET_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        preset: {
          id: preset.id,
          name: preset.name,
          payload: toPresetPayload(preset),
        },
      });
    } catch (error) {
      if (isDatabaseError(error)) {
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }
      return next(error);
    }
  },
);

// POST /api/pdf/presets/:slug/import - Import preset payload
router.post(
  "/api/pdf/presets/:slug/import",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );
      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const importPayload = extractImportPayload(req.body || {});
      const overwriteExisting = parseOverwriteExisting(
        req.body?.overwriteExisting,
      );
      const normalized = normalizePresetInput(importPayload);

      let resultPreset = null;
      let status = "created";
      try {
        await knex.transaction(async (trx) => {
          const existing = await trx("comp_card_presets")
            .where({ profile_id: profile.id, name: normalized.name })
            .first();

          if (existing) {
            if (!overwriteExisting) {
              const conflictError = new Error(
                "A preset with this name already exists for this profile.",
              );
              conflictError.status = 409;
              conflictError.code = "PRESET_NAME_CONFLICT";
              throw conflictError;
            }

            await trx("comp_card_presets")
              .where({ id: existing.id })
              .update({
                seed: normalized.seed,
                layout_family: normalized.layout_family,
                style_variant: normalized.style_variant,
                lock_hero_id: normalized.lock_hero_id,
                lock_grid_ids: JSON.stringify(normalized.lock_grid_ids),
                updated_at: trx.fn.now(),
              });
            resultPreset = await trx("comp_card_presets")
              .where({ id: existing.id })
              .first();
            await insertPresetRevision(trx, resultPreset, "import-overwrite");
            await prunePresetRevisions(trx, resultPreset.id);
            status = "updated";
            return;
          }

          await ensurePresetCapacity(trx, profile.id);
          const insertRow = buildPresetInsert(profile.id, normalized);
          await trx("comp_card_presets").insert(insertRow);
          resultPreset = await trx("comp_card_presets")
            .where({ id: insertRow.id })
            .first();
          await insertPresetRevision(trx, resultPreset, "import-create");
          await prunePresetRevisions(trx, resultPreset.id);
          status = "created";
        });
      } catch (importError) {
        if (isUniqueViolation(importError)) {
          return res.status(409).json({
            error: "Preset name already exists",
            message: "A preset with this name already exists for this profile.",
          });
        }
        throw importError;
      }

      return res.status(status === "created" ? 201 : 200).json({
        ok: true,
        status,
        preset: mapPresetRow(resultPreset),
      });
    } catch (error) {
      if (error.status) {
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code || undefined });
      }
      if (isDatabaseError(error)) {
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }
      return next(error);
    }
  },
);

// GET /api/pdf/presets/:slug/:presetId/revisions - List immutable preset revisions
router.get(
  "/api/pdf/presets/:slug/:presetId/revisions",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug, presetId } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );
      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const preset = await knex("comp_card_presets")
        .where({ id: presetId, profile_id: profile.id })
        .first();
      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      const revisions = await knex("comp_card_preset_revisions")
        .where({ preset_id: presetId })
        .orderBy("revision_number", "desc");

      return res.json({
        ok: true,
        preset: mapPresetRow(preset),
        revisions: revisions.map(mapPresetRevisionRow),
      });
    } catch (error) {
      if (isDatabaseError(error)) {
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }
      return next(error);
    }
  },
);

// POST /api/pdf/presets/:slug/:presetId/rollback - Roll preset back to a revision snapshot
router.post(
  "/api/pdf/presets/:slug/:presetId/rollback",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug, presetId } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );
      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const preset = await knex("comp_card_presets")
        .where({ id: presetId, profile_id: profile.id })
        .first();
      if (!preset) {
        return res.status(404).json({ error: "Preset not found" });
      }

      const revisionId = req.body?.revisionId
        ? String(req.body.revisionId)
        : null;
      if (!revisionId) {
        return res.status(400).json({ error: "revisionId is required" });
      }

      const revision = await knex("comp_card_preset_revisions")
        .where({ id: revisionId, preset_id: presetId })
        .first();
      if (!revision) {
        return res.status(404).json({ error: "Revision not found" });
      }

      const mappedRevision = mapPresetRevisionRow(revision);
      const snapshot = mappedRevision.snapshot || {};
      let rolledBack = null;
      try {
        await knex.transaction(async (trx) => {
          await trx("comp_card_presets")
            .where({ id: presetId })
            .update({
              name: snapshot.name || preset.name,
              seed: snapshot.seed || null,
              layout_family: snapshot.layoutFamily || null,
              style_variant: snapshot.styleVariant || null,
              lock_hero_id: snapshot.lockHeroId || null,
              lock_grid_ids: JSON.stringify(snapshot.lockGridIds || []),
              updated_at: trx.fn.now(),
            });
          rolledBack = await trx("comp_card_presets")
            .where({ id: presetId })
            .first();
          await insertPresetRevision(trx, rolledBack, "rollback");
          await prunePresetRevisions(trx, rolledBack.id);
        });
      } catch (rollbackError) {
        if (isUniqueViolation(rollbackError)) {
          return res.status(409).json({
            error: "Preset name already exists",
            message:
              "Rollback target name conflicts with another preset on this profile.",
          });
        }
        throw rollbackError;
      }

      return res.json({
        ok: true,
        preset: mapPresetRow(rolledBack),
        rolledBackTo: mappedRevision,
      });
    } catch (error) {
      if (isDatabaseError(error)) {
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }
      return next(error);
    }
  },
);

// GET /api/pdf/customize/:slug - Get current customizations
router.get(
  "/api/pdf/customize/:slug",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );

      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      if (!profile.is_pro) {
        return res.status(403).json({ error: "Studio+ account required" });
      }

      let customizations = null;
      if (profile.pdf_customizations) {
        try {
          customizations =
            typeof profile.pdf_customizations === "string"
              ? JSON.parse(profile.pdf_customizations)
              : profile.pdf_customizations;
        } catch (err) {
          console.error("Error parsing customizations:", err);
          customizations = null;
        }
      }

      return res.json({
        ok: true,
        customizations: customizations || {},
        theme: profile.pdf_theme || getDefaultTheme(),
      });
    } catch (error) {
      // Log database connection errors for debugging
      console.error("[PDF Customize GET Route] Error:", {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack,
      });

      // Check if it's a database connection error
      if (isDatabaseError(error)) {
        console.error(
          "[PDF Customize GET Route] Database connection error detected",
        );
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }

      // For other errors, pass to error handler
      return next(error);
    }
  },
);

// POST /api/pdf/customize/:slug - Save PDF customizations
router.post(
  "/api/pdf/customize/:slug",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );

      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const { theme, customizations } = req.body;

      // Validate theme if provided
      if (theme) {
        const themeObj = getTheme(theme);
        if (!themeObj) {
          return res.status(400).json({ error: "Invalid theme" });
        }

        // Check if Studio+ theme is selected for non-Studio+ users
        if (isProTheme(theme) && !profile.is_pro) {
          return res
            .status(403)
            .json({ error: "Studio+ theme requires Studio+ account" });
        }
      }

      // Customizations require Studio+ account
      if (customizations && !profile.is_pro) {
        return res
          .status(403)
          .json({ error: "Studio+ account required for customizations" });
      }

      // Validate customizations if provided (Studio+ users only)
      if (customizations) {
        const themeKey = theme || profile.pdf_theme || getDefaultTheme();
        const themeObj = getTheme(themeKey);
        const validation = validateCustomization(customizations, themeObj);

        if (!validation.valid) {
          return res.status(400).json({
            error: "Invalid customizations",
            errors: validation.errors,
          });
        }

        // Validate layout if provided
        if (customizations.layout && !validateLayout(customizations.layout)) {
          return res
            .status(400)
            .json({ error: "Invalid layout configuration" });
        }
      }

      // Prepare update object
      // Theme can be saved for all users (Free themes for Free users, Studio+ themes for Studio+ users)
      const updates = {};
      if (theme) {
        updates.pdf_theme = theme;
      }
      // Customizations only for Studio+ users
      if (customizations && profile.is_pro) {
        updates.pdf_customizations = JSON.stringify(customizations);
      }

      // Update profile
      await knex("profiles").where({ id: profile.id }).update(updates);

      return res.json({
        ok: true,
        message: "Customizations saved successfully",
      });
    } catch (error) {
      // Log database connection errors for debugging
      console.error("[PDF Customize POST Route] Error:", {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack,
      });

      // Check if it's a database connection error
      if (isDatabaseError(error)) {
        console.error(
          "[PDF Customize POST Route] Database connection error detected",
        );
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }

      // For other errors, pass to error handler
      return next(error);
    }
  },
);

// POST /api/pdf/agency-logo/:slug - Upload agency logo
router.post(
  "/api/pdf/agency-logo/:slug",
  requireRole("TALENT"),
  uploadAgencyLogo.single("logo"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );

      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Logo file required" });
      }

      // Process and optimize logo
      try {
        const processedLogo = await processAgencyLogo(req.file, {
          agencyId: req.session.userId,
          maxWidth: 400,
          maxHeight: 200,
        });
        const logoUrl = processedLogo.publicUrl;

        // Update customizations with logo path
        let customizations = null;
        if (profile.pdf_customizations) {
          try {
            customizations =
              typeof profile.pdf_customizations === "string"
                ? JSON.parse(profile.pdf_customizations)
                : profile.pdf_customizations;
          } catch (err) {
            customizations = {};
          }
        } else {
          customizations = {};
        }

        customizations.agencyLogo = {
          type: "upload",
          path: logoUrl,
          position: customizations.agencyLogo?.position || "bottom-right",
          size: customizations.agencyLogo?.size || "small",
        };

        await knex("profiles")
          .where({ id: profile.id })
          .update({ pdf_customizations: JSON.stringify(customizations) });

        return res.json({
          ok: true,
          logoUrl,
          message: "Logo uploaded successfully",
        });
      } catch (processError) {
        console.error("Error processing logo:", processError);
        return res.status(400).json({ error: "Invalid logo image" });
      }
    } catch (error) {
      // Log database connection errors for debugging
      console.error("[PDF Agency Logo Upload Route] Error:", {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack,
      });

      // Check if it's a database connection error
      if (isDatabaseError(error)) {
        console.error(
          "[PDF Agency Logo Upload Route] Database connection error detected",
        );
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }

      // For other errors, pass to error handler
      return next(error);
    }
  },
);

// POST /api/pdf/agency-logo-url/:slug - Set agency logo from URL
router.post(
  "/api/pdf/agency-logo-url/:slug",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );

      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      const { url, position, size } = req.body;

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "Logo URL required" });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch (err) {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Update customizations with logo URL
      let customizations = null;
      if (profile.pdf_customizations) {
        try {
          customizations =
            typeof profile.pdf_customizations === "string"
              ? JSON.parse(profile.pdf_customizations)
              : profile.pdf_customizations;
        } catch (err) {
          customizations = {};
        }
      } else {
        customizations = {};
      }

      customizations.agencyLogo = {
        type: "url",
        path: url,
        position: position || "bottom-right",
        size: size || "small",
      };

      await knex("profiles")
        .where({ id: profile.id })
        .update({ pdf_customizations: JSON.stringify(customizations) });

      return res.json({
        ok: true,
        message: "Logo URL saved successfully",
      });
    } catch (error) {
      // Log database connection errors for debugging
      console.error("[PDF Agency Logo URL Route] Error:", {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack,
      });

      // Check if it's a database connection error
      if (isDatabaseError(error)) {
        console.error(
          "[PDF Agency Logo URL Route] Database connection error detected",
        );
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }

      // For other errors, pass to error handler
      return next(error);
    }
  },
);

// DELETE /api/pdf/agency-logo/:slug - Remove agency logo
router.delete(
  "/api/pdf/agency-logo/:slug",
  requireRole("TALENT"),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { authorized, profile, error } = await verifyProfileOwnership(
        req,
        slug,
      );

      if (!authorized) {
        return res.status(403).json({ error: error || "Not authorized" });
      }

      // Load customizations
      let customizations = null;
      if (profile.pdf_customizations) {
        try {
          customizations =
            typeof profile.pdf_customizations === "string"
              ? JSON.parse(profile.pdf_customizations)
              : profile.pdf_customizations;
        } catch (err) {
          customizations = {};
        }
      }

      if (customizations && customizations.agencyLogo) {
        // Delete uploaded logo file if it exists
        if (
          customizations.agencyLogo.type === "upload" &&
          customizations.agencyLogo.path
        ) {
          const logoPath = path.join(
            __dirname,
            "..",
            "..",
            "public",
            customizations.agencyLogo.path,
          );
          try {
            if (fs.existsSync(logoPath)) {
              fs.unlinkSync(logoPath);
            }
          } catch (err) {
            console.error("Error deleting logo file:", err);
          }
        }

        // Remove logo from customizations
        delete customizations.agencyLogo;

        // Update profile
        await knex("profiles")
          .where({ id: profile.id })
          .update({ pdf_customizations: JSON.stringify(customizations) });
      }

      return res.json({
        ok: true,
        message: "Logo removed successfully",
      });
    } catch (error) {
      // Log database connection errors for debugging
      console.error("[PDF Agency Logo Delete Route] Error:", {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack,
      });

      // Check if it's a database connection error
      if (isDatabaseError(error)) {
        console.error(
          "[PDF Agency Logo Delete Route] Database connection error detected",
        );
        return res.status(500).json({
          error: "Database connection error",
          message:
            "Unable to connect to the database. Please check your database configuration.",
          code: error.code,
          details:
            process.env.NODE_ENV !== "production" ? error.message : undefined,
        });
      }

      // For other errors, pass to error handler
      return next(error);
    }
  },
);

// Short portfolio link — the URL encoded on comp card NFC tags / QR codes
// and annotated onto digital PDFs (see composition/portfolio-link.js).
// Public, no auth: a casting director tapping a card must land instantly.
router.get("/p/:slug", async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) return res.redirect(302, "/");
  try {
    const profile = await knex("profiles")
      .where({ slug })
      // user_id + date_of_birth so capture can resolve self/minor correctly.
      .select("id", "slug", "user_id", "date_of_birth")
      .first();
    if (!profile) return res.redirect(302, "/");

    // Best-effort analytics — never allowed to affect the redirect.
    try {
      const { randomUUID } = require("crypto");
      await knex("analytics").insert({
        id: randomUUID(),
        profile_id: profile.id,
        event_type: "compcard_link_open",
        event_source: "compcard",
        metadata: JSON.stringify({ via: "short-link" }),
      });
    } catch {
      /* analytics is observability, not behavior */
    }
    recordProfileEvent({
      profile,
      action: "link_open",
      req,
      metadata: { via: "card_short_link" },
    });
    return res.redirect(302, `/portfolio/${encodeURIComponent(profile.slug)}`);
  } catch (error) {
    console.warn("[compcard-link] lookup failed:", error.message);
    return res.redirect(302, "/");
  }
});

module.exports = router;
