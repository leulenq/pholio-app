const express = require("express");
const knex = require("../shared/db/knex");
const { toFeetInches } = require("../domains/talent/services/stats");
const {
  minorPublicExposureAllowed,
  computeAge,
  isMinorProfile,
} = require("../shared/lib/talent-age");
const { buildCanonicalStats } = require("../shared/lib/stats-formatter");
const {
  applyViewerVisibilityFilter,
  ensureModerationColumnChecked,
} = require("../shared/lib/content-moderation");
const { v4: uuidv4 } = require("uuid");
const { analyticsAllowed } = require("../shared/lib/consent");
const { baseCookieOptions } = require("../shared/lib/cookie-domain");

const { injectSocialFields } = require("../shared/lib/social-helpers");
const {
  loadFieldVisibility,
  isFieldGroupVisible,
} = require("../shared/lib/field-visibility");

const {
  recordProfileEvent,
  resolveViewerClass,
  resolveShareToken,
} = require("../domains/talent/services/intel/capture");

const router = express.Router();
const TRACKED_PORTFOLIO_EVENTS = new Set([
  "bio_read",
  "social_click",
  "portfolio_click",
  "scroll_depth",
]);
// Capture v2 (intel) events accepted by the beacon in addition to the legacy
// set. Image events carry imageId (+ dwellMs) for image-level attention.
const INTEL_PORTFOLIO_EVENTS = new Set([
  "image_impression",
  "image_open",
  "image_dwell",
  "contact_click",
]);

function isLikelyBot(userAgent = "") {
  return /bot|crawler|spider|slurp|facebookexternalhit|linkedinbot|preview/i.test(
    String(userAgent),
  );
}

function shouldExcludeFromAnalytics(profile, req) {
  const isOwner =
    Boolean(req?.session?.userId) &&
    req.session.userId === profile?.user_id;
  return isOwner || isLikelyBot(req?.headers?.["user-agent"]);
}

function portfolioSessionCookieName(profileId) {
  return `pholio_session_${String(profileId).replace(/[^a-z0-9]/gi, "")}`;
}

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

    const extendedMetadata = {
      ...metadata,
      referrer: req?.headers?.["referer"] || req?.headers?.["referrer"] || null,
    };

    // The event itself is aggregate product data the Talent needs (view counts),
    // so it is still counted without consent — but IP and user agent are
    // directly-identifying and are only stored when the visitor allowed
    // analytics. Without consent the row is recorded with those fields null and
    // no visitor/session linkage (trackVisitorSession returns null too).
    const consented = req ? analyticsAllowed(req) : false;

    await knex("analytics").insert({
      id: uuidv4(),
      profile_id: profileId,
      event_type: eventType,
      event_source: "web",
      metadata: JSON.stringify(extendedMetadata),
      ip_address: consented
        ? req?.ip ||
          req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
          null
        : null,
      user_agent: consented ? req?.headers?.["user-agent"] || null : null,
      created_at: knex.fn.now(),
    });
  } catch (error) {
    console.error("[Portfolio] Error logging analytics:", error);
    // Don't throw - analytics logging is non-critical
  }
}

/**
 * Helper function to track visitor sessions.
 *
 * Gated on the shared consent cookie. `pholio_visitor_id` is a persistent
 * one-year identifier and `visitor_sessions` stores IP + user agent — exactly
 * the non-essential analytics the consent banner offers to decline. Before
 * this gate existed the banner's answer was never consulted here, so declining
 * changed nothing. Fails closed: no recorded choice means no tracking.
 */
async function trackVisitorSession(profileId, req, res) {
  if (!profileId || profileId === "demo-elara-k") return null;
  if (!analyticsAllowed(req)) return null;

  try {
    const visitorId = req.cookies.pholio_visitor_id || uuidv4();
    const sessionCookieName = portfolioSessionCookieName(profileId);
    const sessionId = req.cookies[sessionCookieName];

    // Set visitor cookie (1 year)
    res.cookie("pholio_visitor_id", visitorId, {
      ...baseCookieOptions(),
      // Host-only: portfolio analytics must not ride the shared subdomain scope.
      domain: undefined,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
    });

    if (sessionId) {
      // Check if session exists in DB and update last activity
      const existingSession = await knex("visitor_sessions")
        .where({ id: sessionId, profile_id: profileId })
        .first();
      if (existingSession) {
        await knex("visitor_sessions")
          .where({ id: sessionId })
          .update({ last_activity_at: knex.fn.now() });
        return sessionId;
      }
    }

    // New session needed
    const newSessionId = uuidv4();
    const isReturning = !!req.cookies.pholio_visitor_id;

    await knex("visitor_sessions").insert({
      id: newSessionId,
      profile_id: profileId,
      visitor_id: visitorId,
      started_at: knex.fn.now(),
      last_activity_at: knex.fn.now(),
      ip_address:
        req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null,
      user_agent: req.headers["user-agent"] || null,
      referrer: req.headers.referer || req.headers.referrer || null,
      is_returning: isReturning,
    });

    // Set session cookie (30 mins)
    res.cookie(sessionCookieName, newSessionId, {
      ...baseCookieOptions(),
      domain: undefined,
      maxAge: 30 * 60 * 1000,
      httpOnly: true,
    });

    return newSessionId;
  } catch (error) {
    console.error("[Portfolio] Session tracking error:", error);
    return null;
  }
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
      is_pro: true,
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
        path: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=75",
        label: "Headshot",
        sort: 1,
        created_at: new Date(),
      },
      {
        id: "demo-img-2",
        profile_id: "demo-elara-k",
        path: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=75",
        label: "Editorial",
        sort: 2,
        created_at: new Date(),
      },
      {
        id: "demo-img-3",
        profile_id: "demo-elara-k",
        path: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=600&q=75",
        label: "Runway",
        sort: 3,
        created_at: new Date(),
      },
      {
        id: "demo-img-4",
        profile_id: "demo-elara-k",
        path: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=600&q=75",
        label: "Portfolio",
        sort: 4,
        created_at: new Date(),
      },
    ],
  };
}

// Helper function to detect database connection errors
/**
 * Public portfolio stats visibility (Wave 2C + Wave 2B).
 *
 * Stats/measurements default to AGENCY-visible, NOT public (design decision 3;
 * `profile_field_visibility` seeds field_key='stats', audience='public',
 * visible=false). The public portfolio therefore renders measurements ONLY when
 * the profile has explicitly opted stats into the public audience.
 *
 * Delegates to the canonical `field-visibility` helper (single source of truth
 * shared with the read/write API), which is itself fail-closed on any DB error
 * (e.g. a deploy-before-migrate with no table yet) — "not public" is the safe
 * default. The synthetic demo profile is a marketing showcase, so it keeps its
 * full stat block.
 */
async function isStatsPublic(profileId, { isDemo } = {}) {
  if (isDemo) return true;
  if (!profileId) return false;
  const visibility = await loadFieldVisibility(profileId);
  return isFieldGroupVisible(visibility, "stats", "public");
}

/**
 * Public age exposure: an audience-safe band, never the exact age
 * (audit "Public controls are not field-granular"). "18+" / "Under 18" / null.
 */
function publicAgeBand(profile) {
  const age = computeAge(profile?.date_of_birth ?? profile?.dob);
  if (age == null) return null;
  return isMinorProfile(profile) ? "Under 18" : "18+";
}

function isDatabaseError(error) {
  if (!error) return false;

  // Check for database connection error codes
  const dbErrorCodes = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"];
  if (dbErrorCodes.includes(error.code)) {
    return true;
  }

  // Check for PostgreSQL error codes
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

router.get("/portfolio/:slug", async (req, res, next) => {
  const slug = req.params.slug;
  let profile = null;
  let images = [];
  let isDemo = false;

  try {
    console.log("[Portfolio] Loading profile for slug:", slug);

    // For demo slug, ALWAYS use demo data first (works even if database is empty)
    if (slug === "elara-k") {
      const demoData = getDemoProfile(slug);
      if (demoData) {
        console.log("[Portfolio] Using demo profile data for demo slug:", slug);
        profile = demoData.profile;
        images = demoData.images;
        isDemo = true;
      }
    }

    // Try to load from database (only if not already using demo data)
    if (!profile) {
      try {
        profile = await knex("profiles").where({ slug: slug }).first();
        if (profile) {
          profile = await injectSocialFields(profile);
          // Warm the moderation-column cache once so applyViewerVisibilityFilter
          // is a safe no-op if the column doesn't exist yet (deploy-before-migrate).
          await ensureModerationColumnChecked(knex);
          // Public portfolio: only shareable images (active status, not excluded from public).
          // NULL status → treat as active; NULL exclude_from_public → treat as not excluded.
          images = await knex("images")
            .where({ profile_id: profile.id })
            .where(function () {
              this.whereNull("status").orWhere("status", "active");
            })
            .where(function () {
              this.whereNull("exclude_from_public").orWhere(
                "exclude_from_public",
                false,
              );
            })
            .modify((qb) => applyViewerVisibilityFilter(qb))
            .orderBy("sort");
          const primaryImage =
            images.find((img) => img.is_primary) || images[0];
          profile.hero_image_path = primaryImage
            ? primaryImage.public_url || primaryImage.path
            : null;
          console.log(
            "[Portfolio] Profile loaded from database:",
            profile.slug,
            "with",
            images.length,
            "images",
          );
        }
      } catch (dbError) {
        // If database error, check if it's a connection error and we have demo data
        if (isDatabaseError(dbError) && slug === "elara-k") {
          console.log(
            "[Portfolio] Database error, using demo fallback for:",
            slug,
          );
          const demoData = getDemoProfile(slug);
          if (demoData) {
            profile = demoData.profile;
            images = demoData.images;
            isDemo = true;
          }
        } else {
          // Re-throw database errors that aren't handled
          throw dbError;
        }
      }
    }

    // If profile not found in database and not using demo, try demo fallback
    if (!profile && slug === "elara-k") {
      console.log(
        "[Portfolio] Profile not found in database, checking demo fallback",
      );
      const demoData = getDemoProfile(slug);
      if (demoData) {
        profile = demoData.profile;
        images = demoData.images;
        isDemo = true;
        console.log("[Portfolio] Using demo profile fallback for slug:", slug);
      }
    }

    // If still no profile, return 404
    if (!profile) {
      console.log("[Portfolio] Profile not found for slug:", slug);
      return res.status(404).render("errors/404", {
        title: "Profile not found",
        layout: "layout",
      });
    }

    if (!isDemo && profile.is_public === false) {
      console.log("[Portfolio] Profile is private for slug:", slug);
      return res.status(404).render("errors/404", {
        title: "Profile not found",
        layout: "layout",
      });
    }

    if (!isDemo && !minorPublicExposureAllowed(profile)) {
      console.log("[Portfolio] Minor profile blocked without guardian consent:", slug);
      return res.status(404).render("errors/404", {
        title: "Profile not found",
        layout: "layout",
      });
    }

    // Render portfolio page
    res.locals.currentPage = "portfolio";
    // Use pro layout for pro portfolios (no header/footer), regular layout for free
    const layoutType = profile.is_pro ? "portfolio-pro" : "layout";

    // Signed-in owner previews and automated crawlers do not represent audience
    // traffic. Await tracking so the session cookie is written before render
    // commits the response headers.
    if (!shouldExcludeFromAnalytics(profile, req)) {
      // Per-recipient share link (?st=...) — marks the open/re-open on the
      // token and classifies this visit as client/casting attention.
      const shareToken = isDemo
        ? null
        : await resolveShareToken(profile, req.query.st, req);
      const [, visitorSessionId] = await Promise.all([
        logAnalyticsEvent(
          profile.id,
          "view",
          { source: "web", slug: profile.slug },
          req,
        ),
        trackVisitorSession(profile.id, req, res),
      ]);
      if (!isDemo) {
        // Capture v2 write path — non-blocking; geo/market resolves inside.
        recordProfileEvent({
          profile,
          action: "view",
          req,
          sessionId: visitorSessionId,
          shareToken,
        });
        if (shareToken) {
          recordProfileEvent({
            profile,
            action: "link_open",
            req,
            sessionId: visitorSessionId,
            shareToken,
            metadata: { reopen: Boolean(shareToken.first_opened_at) },
          });
        }
      }
    }

    const statsPublic = await isStatsPublic(profile.id, { isDemo });
    return res.render("portfolio/show", {
      title: `${profile.first_name} ${profile.last_name}`,
      profile,
      images,
      heightFeet: toFeetInches(profile.height_cm),
      // Stats render only when explicitly opted public (default: agency-only).
      stats: statsPublic ? buildCanonicalStats(profile) : null,
      // Public sees an age BAND, never the exact age.
      ageBand: publicAgeBand(profile),
      layout: layoutType,
      currentPage: "portfolio",
    });
  } catch (error) {
    console.error("[Portfolio Route] Error:", {
      message: error.message,
      code: error.code,
      name: error.name,
      slug: slug,
      stack: error.stack,
    });

    // If it's a database error and we haven't tried demo fallback yet, try it
    if (isDatabaseError(error) && slug === "elara-k" && !isDemo) {
      const demoData = getDemoProfile(slug);
      if (demoData) {
        console.log("[Portfolio Route] Using demo fallback in catch handler");
        res.locals.currentPage = "portfolio";
        const demoLayoutType = demoData.profile.is_pro
          ? "portfolio-pro"
          : "layout";
        return res.render("portfolio/show", {
          title: `${demoData.profile.first_name} ${demoData.profile.last_name}`,
          profile: demoData.profile,
          images: demoData.images,
          heightFeet: toFeetInches(demoData.profile.height_cm),
          // Demo is a marketing showcase — keep the full stat block.
          stats: buildCanonicalStats(demoData.profile),
          ageBand: publicAgeBand(demoData.profile),
          layout: demoLayoutType,
          currentPage: "portfolio",
        });
      }
    }

    return next(error);
  }
});

router.post("/portfolio/:slug/event", async (req, res) => {
  const slug = req.params.slug;
  const { eventType, metadata, imageId, dwellMs } = req.body || {};

  try {
    let profile = await knex("profiles").where({ slug: slug }).first();
    if (profile) {
      profile = await injectSocialFields(profile);
      const isLegacyEvent = TRACKED_PORTFOLIO_EVENTS.has(eventType);
      const isIntelEvent = INTEL_PORTFOLIO_EVENTS.has(eventType);
      if (!isLegacyEvent && !isIntelEvent) {
        return res.status(400).json({ error: "Unsupported analytics event" });
      }

      const safeMetadata =
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? metadata
          : {};
      if (JSON.stringify(safeMetadata).length > 2000) {
        return res.status(400).json({ error: "Analytics metadata is too large" });
      }

      if (shouldExcludeFromAnalytics(profile, req)) {
        return res.json({ success: true, recorded: false });
      }

      // Image-level attention events must reference an image on this profile.
      let safeImageId = null;
      if (eventType.startsWith("image_")) {
        if (typeof imageId !== "string" || imageId.length > 64) {
          return res.status(400).json({ error: "imageId required" });
        }
        const image = await knex("images")
          .where({ id: imageId, profile_id: profile.id })
          .select("id")
          .first();
        if (!image) {
          return res.status(400).json({ error: "Unknown image" });
        }
        safeImageId = image.id;
      }

      if (isLegacyEvent) {
        await logAnalyticsEvent(profile.id, eventType, safeMetadata, req);
      }
      // Capture v2 write (all beacon events), non-blocking.
      recordProfileEvent({
        profile,
        action: eventType === "scroll_depth" ? "scroll_depth" : eventType,
        req,
        viewerClass: resolveViewerClass(profile, req),
        sessionId: req.cookies?.[portfolioSessionCookieName(profile.id)] || null,
        imageId: safeImageId,
        dwellMs: Number.isFinite(Number(dwellMs)) ? Number(dwellMs) : null,
        metadata: Object.keys(safeMetadata).length ? safeMetadata : null,
      });
      return res.json({ success: true, recorded: true });
    }
    return res.status(404).json({ error: "Profile not found" });
  } catch (error) {
    console.error("[Portfolio Event] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
