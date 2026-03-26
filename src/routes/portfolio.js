const express = require("express");
const knex = require("../shared/db/knex");
const { toFeetInches } = require("../domains/talent/services/stats");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

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

    await knex("analytics").insert({
      id: uuidv4(),
      profile_id: profileId,
      event_type: eventType,
      event_source: "web",
      metadata: JSON.stringify(extendedMetadata),
      ip_address:
        req?.ip ||
        req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
        null,
      user_agent: req?.headers?.["user-agent"] || null,
      created_at: knex.fn.now(),
    });
  } catch (error) {
    console.error("[Portfolio] Error logging analytics:", error);
    // Don't throw - analytics logging is non-critical
  }
}

/**
 * Helper function to track visitor sessions
 */
async function trackVisitorSession(profileId, req, res) {
  if (!profileId || profileId === "demo-elara-k") return null;

  try {
    const visitorId = req.cookies.pholio_visitor_id || uuidv4();
    const sessionId = req.cookies.pholio_session_id;

    // Set visitor cookie (1 year)
    res.cookie("pholio_visitor_id", visitorId, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    });

    if (sessionId) {
      // Check if session exists in DB and update last activity
      const existingSession = await knex("visitor_sessions")
        .where({ id: sessionId })
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
    res.cookie("pholio_session_id", newSessionId, {
      maxAge: 30 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
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

    // Render portfolio page
    res.locals.currentPage = "portfolio";
    // Use pro layout for pro portfolios (no header/footer), regular layout for free
    const layoutType = profile.is_pro ? "portfolio-pro" : "layout";

    // Track portfolio view (non-blocking)
    logAnalyticsEvent(
      profile.id,
      "view",
      { source: "web", slug: profile.slug },
      req,
    );

    // Track visitor session (Tier 2)
    trackVisitorSession(profile.id, req, res);

    return res.render("portfolio/show", {
      title: `${profile.first_name} ${profile.last_name}`,
      profile,
      images,
      heightFeet: toFeetInches(profile.height_cm),
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
  const { eventType, metadata } = req.body;

  try {
    const profile = await knex("profiles").where({ slug: slug }).first();
    if (profile) {
      // Log event using the existing helper
      await logAnalyticsEvent(profile.id, eventType, metadata, req);
      return res.json({ success: true });
    }
    return res.status(404).json({ error: "Profile not found" });
  } catch (error) {
    console.error("[Portfolio Event] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
