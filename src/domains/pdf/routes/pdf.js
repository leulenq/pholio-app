const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const sharp = require("sharp");
const { renderCompCard, loadProfile, toFeetInches } = require("../generator");
const {
  getTheme,
  isProTheme,
  getDefaultTheme,
  mergeThemeWithCustomization,
  generateThemeFontsUrl,
  validateCustomization,
} = require("../themes");
const { selectCompCardImages } = require("../comp-card-selector");
const { getFontFamilyCSS } = require("../fonts");
const {
  generateLayoutClasses,
  getImageGridCSS,
  validateLayout,
} = require("../layouts");
const { requireRole } = require("../../auth/middleware/require-auth");
const knex = require("../../../shared/db/knex");
const QRCode = require("qrcode");
const config = require("../../../config");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

// Absolute paths to EJS templates (moved from views/pdf/ to src/domains/pdf/templates/)
const TEMPLATE_STANDARD = path.join(
  __dirname,
  "..",
  "templates",
  "compcard-standard.ejs",
);
const TEMPLATE_LEGACY = path.join(__dirname, "..", "templates", "compcard.ejs");

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

  const profile = await knex("profiles").where({ slug: profileSlug }).first();
  if (!profile) {
    return { authorized: false, error: "Profile not found" };
  }

  if (profile.user_id !== req.session.userId) {
    return { authorized: false, error: "Not authorized" };
  }

  return { authorized: true, profile };
}

// Multer configuration for agency logo uploads
const agencyLogoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.session.userId;
    const logoDir = path.join(
      __dirname,
      "..",
      "..",
      "public",
      "uploads",
      "agency-logos",
      userId,
    );
    try {
      fs.mkdirSync(logoDir, { recursive: true });
    } catch (err) {
      if (err.code !== "EEXIST") {
        return cb(err);
      }
    }
    cb(null, logoDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "logo.png").toLowerCase();
    cb(null, `logo${ext}`);
  },
});

const agencyLogoUpload = multer({
  storage: agencyLogoStorage,
  fileFilter: (req, file, cb) => {
    const allowedExt = [".jpg", ".jpeg", ".png", ".svg", ".webp"];
    const allowedMime = [
      "image/jpeg",
      "image/png",
      "image/svg+xml",
      "image/webp",
    ];
    const ext = path.extname((file.originalname || "").toLowerCase());
    const ok = allowedExt.includes(ext) || allowedMime.includes(file.mimetype);
    cb(
      ok
        ? null
        : new Error("Unsupported file type — only JPG/PNG/SVG/WEBP allowed"),
      ok,
    );
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit for logos
});

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

// Helper function to render the new 2-page standard comp card
async function renderStandardView(req, res, data, isDemo) {
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
  const rawSeed = req.query.seed;
  const seed =
    rawSeed == null || rawSeed === ""
      ? undefined
      : Array.isArray(rawSeed)
        ? rawSeed[0]
        : rawSeed;
  const { heroImage, gridImages } = selectCompCardImages(
    images,
    seed != null && seed !== "" ? { seed } : undefined,
  );

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

  try {
    res.render(TEMPLATE_STANDARD, {
      layout: false,
      title: `${profile.first_name} ${profile.last_name} - Comp Card`,
      profile,
      heroImage,
      gridImages,
      theme: mergedTheme,
      themeKey,
      archetype,
      isPro: profile.is_pro,
      qrCode,
      heightFeet: toFeetInches(profile.height_cm),
      baseUrl,
      watermark: !profile.is_pro,
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
      watermark: !profile.is_pro,
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

    console.log("[PDF Download] Generating PDF:", {
      slug: slug,
      themeKey: themeKey,
      pdfBaseUrl: config.pdfBaseUrl,
      targetUrl: url.toString(),
      isDemo: isDemo,
    });

    const buffer = await renderCompCard(req.params.slug, themeKey, {
      seed: req.query.seed,
    });

    // Check if PDF is too large for Netlify Functions response (6MB limit)
    const maxResponseSize = 5.5 * 1024 * 1024; // 5.5MB safety limit (Netlify has ~6MB limit)
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
        maxSize: "6MB",
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
  agencyLogoUpload.single("logo"),
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

      if (!req.file) {
        return res.status(400).json({ error: "Logo file required" });
      }

      const userId = req.session.userId;
      const logoDir = path.join(
        __dirname,
        "..",
        "..",
        "public",
        "uploads",
        "agency-logos",
        userId,
      );
      const logoPath = path.join(logoDir, req.file.filename);

      // Process and optimize logo
      try {
        const fileExt = path.extname(req.file.filename).toLowerCase();
        const isSvg = fileExt === ".svg";

        let logoUrl;

        if (isSvg) {
          // For SVG, keep as-is (no processing with Sharp)
          logoUrl = `/uploads/agency-logos/${userId}/logo.svg`;
        } else {
          // For raster images, convert to WebP and optimize
          const optimizedPath = logoPath.replace(/\.[^.]+$/, ".webp");
          await sharp(logoPath)
            .resize({
              width: 400,
              height: 200,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 90 })
            .toFile(optimizedPath);

          // Delete original if it's not webp
          if (!logoPath.endsWith(".webp")) {
            fs.unlinkSync(logoPath);
          }

          logoUrl = `/uploads/agency-logos/${userId}/logo.webp`;
        }

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
        // Clean up uploaded file
        if (fs.existsSync(logoPath)) {
          try {
            fs.unlinkSync(logoPath);
          } catch (unlinkError) {
            console.error("Error deleting logo file:", unlinkError);
          }
        }
        return res.status(500).json({ error: "Error processing logo" });
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

      if (!profile.is_pro) {
        return res.status(403).json({ error: "Studio+ account required" });
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

      if (!profile.is_pro) {
        return res.status(403).json({ error: "Studio+ account required" });
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

module.exports = router;
