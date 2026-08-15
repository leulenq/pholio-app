const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const knex = require("../../shared/db/knex");
const config = require("../../config");
const {
  getAllThemes,
  getFreeThemes,
  getProThemes,
} = require("../../domains/pdf/themes");
const {
  listReferenceLanguages,
} = require("../../shared/lib/language-reference");
const {
  ensureModerationColumnChecked,
} = require("../../shared/lib/content-moderation");
const {
  AUDIENCE,
  buildPublicCardDTO,
  buildPublicImageDTO,
} = require("../../shared/lib/audience-dto");
const {
  selectColumnsForAudience,
  applyImageVisibility,
  isPubliclyExposable,
} = require("../../shared/lib/profile-visibility");


const AGENCY_ACCESS_STATUSES = Object.freeze({
  SUBMITTED: "submitted",
});

const AGENCY_ACCESS_RECEIVED_MESSAGE =
  "Your request has been received. Pholio reviews agency access manually and will email next steps if there is a fit.";

const AGENCY_ACCESS_REQUIRED_FIELDS = [
  "agencyName",
  "websiteUrl",
  "primaryMarketCity",
  "agencyType",
  "primaryBoards",
  "rosterSizeRange",
  "teamSizeRange",
  "firstUseCases",
  "contactName",
  "contactEmail",
  "contactRole",
];

function normalizeString(value, max = 512) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, max);
}

function normalizeEmail(value) {
  const email = normalizeString(value, 254);
  return email ? email.toLowerCase() : null;
}

function normalizeArray(value, maxItems = 20, maxLength = 120) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source
    .map((item) => normalizeString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeUrl(value) {
  const raw = normalizeString(value, 512);
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.toString().slice(0, 512);
  } catch (_error) {
    return null;
  }
}

function jsonForDb(value) {
  const isPostgres =
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql";
  return isPostgres ? value : JSON.stringify(value ?? null);
}

function hashIp(ip) {
  const source = ip || "unknown";
  return crypto
    .createHash("sha256")
    .update(`${process.env.SESSION_SECRET || "pholio"}:${source}`)
    .digest("hex");
}

function validateAgencyAccessPayload(body = {}) {
  const values = {
    agencyName: normalizeString(body.agencyName || body.agency_name, 180),
    websiteUrl: normalizeUrl(body.websiteUrl || body.website_url),
    primaryMarketCity: normalizeString(
      body.primaryMarketCity || body.primary_market_city,
      120,
    ),
    primaryMarketCountry: normalizeString(
      body.primaryMarketCountry || body.primary_market_country,
      120,
    ),
    additionalLocations: normalizeArray(
      body.additionalLocations || body.additional_locations,
      12,
      160,
    ),
    agencyType: normalizeString(body.agencyType || body.agency_type, 80),
    primaryBoards: normalizeArray(
      body.primaryBoards || body.primary_boards,
      20,
      80,
    ),
    rosterSizeRange: normalizeString(
      body.rosterSizeRange || body.roster_size_range,
      40,
    ),
    teamSizeRange: normalizeString(
      body.teamSizeRange || body.team_size_range,
      40,
    ),
    currentSystem: normalizeString(body.currentSystem || body.current_system, 120),
    firstUseCases: normalizeArray(
      body.firstUseCases || body.first_use_cases,
      12,
      120,
    ),
    migrationInterest: normalizeString(
      body.migrationInterest || body.migration_interest,
      20,
    ),
    contactName: normalizeString(body.contactName || body.contact_name, 160),
    contactEmail: normalizeEmail(body.contactEmail || body.contact_email),
    contactRole: normalizeString(body.contactRole || body.contact_role, 120),
    contactPhone: normalizeString(body.contactPhone || body.contact_phone, 80),
    timezone: normalizeString(body.timezone, 80),
    heardFrom: normalizeString(body.heardFrom || body.heard_from, 160),
    notes: normalizeString(body.notes, 500),
  };

  const errors = {};
  for (const key of AGENCY_ACCESS_REQUIRED_FIELDS) {
    const value = values[key];
    if (Array.isArray(value) ? value.length === 0 : !value) {
      errors[key] = "Required";
    }
  }

  if (values.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) {
    errors.contactEmail = "Enter a valid work email.";
  }

  if (!values.websiteUrl) {
    errors.websiteUrl = "Enter a valid agency website.";
  }

  return { values, errors };
}

function dashboardPathForRole(role) {
  if (role === "TALENT") return "/dashboard/talent";
  if (role === "AGENCY") return "/dashboard/agency";
  return "/";
}


// POST /api/public/agency-access-requests
// Public intake endpoint for the pholio-landing agency request form. This route
// stores only agency/request metadata — no roster files, talent data, contracts,
// billing data, or minor-specific records are accepted here.
router.post("/agency-access-requests", async (req, res) => {
  try {
    const { values, errors } = validateAgencyAccessPayload(req.body || {});
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        errors,
      });
    }

    const existingRecent = await knex("agency_access_requests")
      .where({ contact_email: values.contactEmail })
      .whereIn("status", [
        "submitted",
        "triage",
        "needs_info",
        "qualification_call",
        "approved_pending_provisioning",
      ])
      .orderBy("created_at", "desc")
      .first();

    if (existingRecent) {
      return res.status(202).json({
        success: true,
        data: {
          message: AGENCY_ACCESS_RECEIVED_MESSAGE,
        },
      });
    }

    const { v4: uuidv4 } = require("uuid");
    const requestId = uuidv4();
    const eventId = uuidv4();
    const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || null;
    const userAgent = normalizeString(req.get("user-agent"), 512);

    await knex.transaction(async (trx) => {
      await trx("agency_access_requests").insert({
        id: requestId,
        agency_name: values.agencyName,
        website_url: values.websiteUrl,
        primary_market_city: values.primaryMarketCity,
        primary_market_country: values.primaryMarketCountry,
        additional_locations: jsonForDb(values.additionalLocations),
        agency_type: values.agencyType,
        primary_boards: jsonForDb(values.primaryBoards),
        roster_size_range: values.rosterSizeRange,
        team_size_range: values.teamSizeRange,
        current_system: values.currentSystem,
        first_use_cases: jsonForDb(values.firstUseCases),
        migration_interest: values.migrationInterest,
        contact_name: values.contactName,
        contact_email: values.contactEmail,
        contact_role: values.contactRole,
        contact_phone: values.contactPhone,
        timezone: values.timezone,
        heard_from: values.heardFrom,
        notes: values.notes,
        status: AGENCY_ACCESS_STATUSES.SUBMITTED,
        ip_hash: hashIp(ip),
        user_agent: userAgent,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      await trx("agency_access_request_events").insert({
        id: eventId,
        request_id: requestId,
        event_type: "submitted",
        previous_status: null,
        next_status: AGENCY_ACCESS_STATUSES.SUBMITTED,
        source_ip: null,
        metadata: jsonForDb({ source: "pholio-landing", ipHash: hashIp(ip) }),
        created_at: trx.fn.now(),
      });
    });

    return res.status(201).json({
      success: true,
      data: {
        message: AGENCY_ACCESS_RECEIVED_MESSAGE,
      },
    });
  } catch (error) {
    console.error("[Public API] Error in /agency-access-requests:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to submit agency access request",
    });
  }
});

// GET /api/public/languages — canonical language list for profile forms
router.get("/languages", async (req, res) => {
  try {
    const languages = await listReferenceLanguages();
    res.json({
      success: true,
      data: languages.map(({ code, name }) => ({ code, name })),
    });
  } catch (error) {
    console.error("[Public API] Error in /languages:", error);
    res.status(500).json({
      success: false,
      error: "Failed to load languages",
    });
  }
});

// GET /api/public/home
router.get("/home", async (req, res) => {
  try {
    // Warm the moderation-column cache once per request so that all
    // applyViewerVisibilityFilter calls below are safe no-ops when the
    // column doesn't exist yet (deploy-before-migrate window).
    await ensureModerationColumnChecked(knex);

    // Load Elara Keats data for homepage demo (main featured talent)
    // Use fallback data if database query fails
    let elaraProfile = null;
    let elaraImages = [];

    try {
      elaraProfile = await knex("profiles")
        .select(selectColumnsForAudience(AUDIENCE.PUBLIC))
        .where({ slug: "elara-k" })
        .first();
      // Gate through the canonical public-exposure rule (is_public flag AND
      // minor/guardian-consent check) before this row is allowed any further.
      if (!isPubliclyExposable(elaraProfile)) {
        elaraProfile = null;
      }

      if (elaraProfile) {
        elaraImages = await knex("images")
          .where({ profile_id: elaraProfile.id })
          .modify((qb) => applyImageVisibility(qb, AUDIENCE.PUBLIC))
          .orderBy("sort", "asc");
      }
    } catch (dbError) {
      console.error(
        "[Public API] Database error loading Elara profile:",
        dbError.message,
      );
      // Continue with fallback data below
    }

    // Load additional talent profiles for floating cards (limit to 4)
    // Use database-agnostic random ordering
    let floatingTalents = [];
    let floatingTalentsWithImages = [];

    try {
      // Shared filter builder: only profiles that are public and have a shareable
      // primary image. Selects the public allowlist + the age-gating columns
      // (date_of_birth, guardian_consent_at, is_public) so isPubliclyExposable
      // has what it needs; no other column is fetched.
      function applyFloatingTalentFilters(query) {
        return query
          .select(selectColumnsForAudience(AUDIENCE.PUBLIC))
          .whereNot({ slug: "elara-k" })
          // Profile must be publicly visible (NULL treated as true per column
          // default). This is a query-efficiency prefilter only — the
          // authoritative gate is isPubliclyExposable() applied below.
          .where(function profileIsPublic() {
            this.whereNull("is_public").orWhere("is_public", true);
          })
          .whereExists(function publicPrimaryImageExists() {
            this.select("*")
              .from("images")
              .whereRaw("images.profile_id = profiles.id")
              .andWhere("images.is_primary", true)
              .modify((qb) =>
                applyImageVisibility(qb, AUDIENCE.PUBLIC, { table: "images" }),
              );
          });
      }

      // Fetch extra candidates so we still have 4 after the minor post-filter
      const CARD_LIMIT = 4;
      const FETCH_LIMIT = CARD_LIMIT * 4; // generous overselect

      if (config.dbClient === "pg") {
        const candidates = await applyFloatingTalentFilters(
          knex("profiles"),
        )
          .limit(FETCH_LIMIT)
          .orderByRaw("RANDOM()");
        floatingTalents = candidates
          .filter((t) => isPubliclyExposable(t))
          .slice(0, CARD_LIMIT);
      } else {
        // SQLite: shuffle in JS then apply minor post-filter
        const candidates = await applyFloatingTalentFilters(
          knex("profiles"),
        )
          .limit(FETCH_LIMIT)
          .orderBy("created_at", "desc");
        floatingTalents = candidates
          .sort(() => Math.random() - 0.5)
          .filter((t) => isPubliclyExposable(t))
          .slice(0, CARD_LIMIT);
      }

      // For each floating talent, get their first image and shape the whole
      // card through the public DTO allowlist — never spread the raw row.
      floatingTalentsWithImages = await Promise.all(
        floatingTalents.map(async (talent) => {
          try {
            const primaryImage = await knex("images")
              .where({ profile_id: talent.id, is_primary: true })
              .modify((qb) => applyImageVisibility(qb, AUDIENCE.PUBLIC))
              .first();
            return {
              ...buildPublicCardDTO(talent, { image: primaryImage }),
              hero_image: primaryImage
                ? primaryImage.public_url || primaryImage.path
                : null,
            };
          } catch (imgError) {
            console.warn(
              `[Public API] Error loading images for talent ${talent.id}:`,
              imgError.message,
            );
            return {
              ...buildPublicCardDTO(talent, { image: null }),
              hero_image: null,
            };
          }
        }),
      );
    } catch (err) {
      console.warn("[Public API] Error loading floating talents:", err.message);
      // Will use fallback data below
      floatingTalentsWithImages = [];
    }

    // Ensure elaraProfile has all required fields for transformation hero.
    // When a real (gated) profile was loaded, shape it through the public DTO
    // allowlist — the row carries date_of_birth/guardian_consent_at/is_public
    // for gating only and must never reach the client raw. The literal
    // fallback below is static developer-authored copy, not a DB row.
    const elaraProfileForHero = elaraProfile
      ? buildPublicCardDTO(elaraProfile, { image: elaraImages[0] || null })
      : {
          first_name: "Elara",
          last_name: "Keats",
          city: "Los Angeles, CA",
          slug: "elara-k",
          bio_raw:
            "hi!!!\n\ni saw on insta you guys are looking for new faces?? im elara keats and im a model based in LA (but i can travel anywhere, i have a passport!!) im really looking to get into more editorial and runway work.\n\na bit about me:\n\nim 5'11\"\nmy measurements are 32-25-35\nmy shoe is a 9\ni have brown hair/green eyes.\n\nMy insta is @elara.k -- i post most of my new work there. im a super hard worker and everyone says im professional, i have a background in some smaller campaigns. i was with [Agency Name] last year but left, it wasnt a good fit.\n\nI put my best photos (some are digitals my friend took, some are from real shoots but they are not edited yet) in this google drive. hope you can see them?\n\nhere is the link:\n\nhttps://www.google.com/search?q=https://drive.google.com/drive/folders/1aBcD-THIS-IS-A-MESSY-LINK-xyz\n\nI also have a portfolio on a wix site i made, i think this is the link:\n\nhttps://www.google.com/search?q=elara-portfolio.wixsite.com/mysite\n\nLet me know what you think! Thx so much!! 🙏 I'm free for a meeting basically any time next week.\n\n-Elara K.",
          bio_curated:
            "Elara Keats is an emerging model based in Los Angeles with a strong foundation in editorial and runway work. Standing at 5'11\" with measurements of 32-25-35, she brings a commanding presence to both high-fashion editorials and commercial campaigns. With brown hair and green eyes, Elara's versatile look has made her a sought-after talent for diverse creative projects. Her professional approach and extensive experience in smaller campaigns demonstrate her commitment to excellence. Elara is available for travel and actively seeking opportunities in editorial and runway work, bringing dedication and professionalism to every project.",
          // hero_image_path removed from Elara fallback
          height_cm: 180,
          measurements: "32-25-35",
        };

    const fallbackFloatingTalents = [
      {
        first_name: "Aiko",
        last_name: "Ren",
        city: "Tokyo / New York",
        hero_image:
          "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80",
        slug: "aiko-ren",
      },
      {
        first_name: "Bianca",
        last_name: "Cole",
        city: "Los Angeles",
        hero_image:
          "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
        slug: "bianca-cole",
      },
      {
        first_name: "Cruz",
        last_name: "Vega",
        city: "Mexico City",
        hero_image:
          "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
        slug: "cruz-vega",
      },
      {
        first_name: "Daphne",
        last_name: "Noor",
        city: "Amsterdam",
        hero_image:
          "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=80",
        slug: "daphne-noor",
      },
    ];

    res.json({
      elaraProfile: elaraProfileForHero,
      elaraImages: elaraImages.map(buildPublicImageDTO).filter(Boolean),
      floatingTalents:
        floatingTalentsWithImages.length > 0
          ? floatingTalentsWithImages
          : fallbackFloatingTalents,
    });
  } catch (error) {
    console.error("[Public API] Error in /home:", error);
    res.status(500).json({ error: "Failed to load homepage data" });
  }
});

// GET /api/public/pro
router.get("/pro", async (req, res) => {
  try {
    const allThemes = getAllThemes();
    const freeThemes = getFreeThemes();
    const proThemes = getProThemes();
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    res.json({
      allThemes,
      freeThemes,
      proThemes,
      baseUrl,
      demoSlug: "elara-k",
    });
  } catch (error) {
    console.error("[Public API] Error in /pro:", error);
    res.status(500).json({
      allThemes: {},
      freeThemes: [],
      proThemes: [],
      baseUrl: `${req.protocol}://${req.get("host")}`,
      demoSlug: "elara-k",
      error: "Failed to load themes",
    });
  }
});

const {
  hasOpenCallSchema,
  findActiveLinkByCode,
  recordArrival,
  mintClaim,
  CLAIM_STATUSES,
} = require("../../domains/talent/services/open-call-claims");
const {
  briefDTO,
  isClosedByDeadline,
} = require("../../domains/agency/services/open-call-brief");

// How long an anonymous arrival context survives in the session while the
// visitor signs up. A later re-visit of the link simply records a new arrival.
const OPEN_CALL_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function parseOpenBoardsList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function sessionTalentProfile(req) {
  if (!req.session?.userId || req.session.role !== "TALENT") return null;
  return knex("profiles")
    .where({ user_id: req.session.userId })
    .first("id");
}

function openCallAgencyDTO(link) {
  return {
    id: link.agency_id,
    name: link.agency_name,
    location: link.agency_location,
    logo: link.agency_logo,
    website: link.agency_website,
    openBoards: parseOpenBoardsList(link.agency_open_boards),
  };
}

// GET /api/public/open-call/:code — arrival-screen data. Safe agency fields
// only; never confirms whether an unknown code maps to a real agency.
router.get("/open-call/:code", async (req, res) => {
  try {
    if (!(await hasOpenCallSchema(knex))) {
      return res.json({ success: true, data: { valid: false } });
    }
    const link = await findActiveLinkByCode(knex, req.params.code);
    if (!link) {
      return res.json({ success: true, data: { valid: false } });
    }
    let alreadyApplied = false;
    const profile = await sessionTalentProfile(req);
    if (profile) {
      const existing = await knex("applications")
        .where({ profile_id: profile.id, agency_id: link.agency_id })
        .whereNot("status", "withdrawn")
        .first("id");
      alreadyApplied = Boolean(existing);
    }
    return res.json({
      success: true,
      data: {
        valid: true,
        agency: openCallAgencyDTO(link),
        brief: briefDTO(link),
        // A call past its published closing date says so, rather than taking
        // submissions the agency has stopped reading.
        closed: isClosedByDeadline(link),
        alreadyApplied,
        authenticated: Boolean(profile),
      },
    });
  } catch (error) {
    console.error("[Public API] Error in /open-call/:code:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to load open call" });
  }
});

// POST /api/public/open-call/:code/arrival — record the arrival and either
// mint a claim (authenticated talent) or park the context in the session so
// signup can convert it later. The claim itself is the only entitlement;
// this endpoint never exempts anything by itself.
router.post("/open-call/:code/arrival", async (req, res) => {
  try {
    if (!(await hasOpenCallSchema(knex))) {
      return res.json({ success: true, data: { valid: false } });
    }
    const link = await findActiveLinkByCode(knex, req.params.code);
    if (!link) {
      return res.json({ success: true, data: { valid: false } });
    }
    // Past its published closing date the call mints nothing. The invitation
    // was time-bound and the agency said so; honouring it afterwards would
    // hand out an entitlement into a call nobody is reading.
    if (isClosedByDeadline(link)) {
      return res.json({ success: true, data: { valid: true, closed: true, claimed: false } });
    }

    const arrivalId = await recordArrival(knex, {
      linkId: link.id,
      agencyId: link.agency_id,
      ip:
        req.ip ||
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        null,
      userAgent: req.get("user-agent"),
    });

    const profile = await sessionTalentProfile(req);
    if (profile) {
      const { claim } = await mintClaim(knex, {
        linkId: link.id,
        arrivalId,
        agencyId: link.agency_id,
        profileId: profile.id,
      });
      return res.json({
        success: true,
        data: {
          valid: true,
          claimed: Boolean(claim && claim.status === CLAIM_STATUSES.ACTIVE),
          claimExpiresAt: claim?.expires_at || null,
          agency: openCallAgencyDTO(link),
        },
      });
    }

    req.session.openCallContext = {
      linkId: link.id,
      arrivalId,
      agencyId: link.agency_id,
      exp: new Date(Date.now() + OPEN_CALL_SESSION_TTL_MS).toISOString(),
    };
    return res.json({
      success: true,
      data: {
        valid: true,
        claimed: false,
        pendingSignup: true,
        agency: openCallAgencyDTO(link),
      },
    });
  } catch (error) {
    console.error("[Public API] Error in /open-call/:code/arrival:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to record arrival" });
  }
});

// GET /api/public/session
//
// Session-scoped PII (email, name, slug, plan). This response crosses a CDN and
// the marketing site's Next.js rewrite proxy, so it must never be stored by a
// shared cache — the sibling /api/talent|agency|internal mounts get this from
// middleware in src/app.js, but /api/public is deliberately not under it.
router.get("/session", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Cookie");

  try {
    if (req.session && req.session.userId) {
      const user = await knex("users")
        .where({ id: req.session.userId })
        .first();

      if (!user) {
        return res.json({ authenticated: false });
      }

      const responseData = {
        authenticated: true,
        role: user.role,
        user: { email: user.email },
        dashboardPath: dashboardPathForRole(user.role),
      };

      if (user.role === "AGENCY") {
        responseData.onboardingComplete = true;
      }

      if (user.role === "TALENT") {
        const profile = await knex("profiles")
          .where({ user_id: user.id })
          .first();
        if (profile) {
          responseData.onboardingComplete = !!profile.onboarding_completed_at;
          responseData.profile = {
            first_name: profile.first_name,
            last_name: profile.last_name,
            profile_image: profile.profile_image,
            slug: profile.slug,
          };

          responseData.subscription = {
            isPro: profile.is_pro || false,
          };

          // Try to lazily calculate completeness (safely ignored if helpers fail)
          try {
            const {
              calculateProfileCompleteness,
            } = require("../../domains/talent/services/completeness");
            const images = await knex("images")
              .where({ profile_id: profile.id })
              .orderBy("sort", "asc")
              .limit(10);

            const profileForCompleteness = {
              ...profile,
              email: profile.email || user.email || null,
            };
            responseData.completeness = calculateProfileCompleteness(
              profileForCompleteness,
              images,
            );
          } catch (e) {
            console.warn(
              "[Public API] Error calculating completeness for /session:",
              e.message,
            );
            responseData.completeness = { percentage: 0 };
          }
        }
      }

      return res.json(responseData);
    }

    return res.json({ authenticated: false });
  } catch (error) {
    console.error("[Public API] Error in /session:", error);
    res
      .status(500)
      .json({ authenticated: false, error: "Failed to verify session" });
  }
});

module.exports = router;
