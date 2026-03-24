const express = require("express");
const router = express.Router();
const knex = require("../../shared/db/knex");
const config = require("../../config");
const {
  getAllThemes,
  getFreeThemes,
  getProThemes,
} = require("../../domains/pdf/themes");

// GET /api/public/home
router.get("/home", async (req, res) => {
  try {
    // Load Elara Keats data for homepage demo (main featured talent)
    // Use fallback data if database query fails
    let elaraProfile = null;
    let elaraImages = [];

    try {
      elaraProfile = await knex("profiles").where({ slug: "elara-k" }).first();

      // Alias legacy measurement fields
      if (elaraProfile) {
        if (elaraProfile.bust_cm) elaraProfile.bust = elaraProfile.bust_cm;
        if (elaraProfile.waist_cm) elaraProfile.waist = elaraProfile.waist_cm;
        if (elaraProfile.hips_cm) elaraProfile.hips = elaraProfile.hips_cm;
      }

      if (elaraProfile) {
        elaraImages = await knex("images")
          .where({ profile_id: elaraProfile.id })
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
      if (config.dbClient === "pg") {
        floatingTalents = await knex("profiles")
          .whereNot({ slug: "elara-k" })
          .whereExists(function () {
            this.select("*")
              .from("images")
              .whereRaw("images.profile_id = profiles.id")
              .andWhere("is_primary", true);
          })
          .limit(4)
          .orderByRaw("RANDOM()");
      } else {
        // SQLite: use a simple approach - get all and shuffle in JS, or just order by id
        floatingTalents = await knex("profiles")
          .whereNot({ slug: "elara-k" })
          .whereExists(function () {
            this.select("*")
              .from("images")
              .whereRaw("images.profile_id = profiles.id")
              .andWhere("is_primary", true);
          })
          .limit(10)
          .orderBy("created_at", "desc");
        // Shuffle and take first 4
        floatingTalents = floatingTalents
          .sort(() => Math.random() - 0.5)
          .slice(0, 4);
      }

      // For each floating talent, get their first image
      floatingTalentsWithImages = await Promise.all(
        floatingTalents.map(async (talent) => {
          try {
            const primaryImage = await knex("images")
              .where({ profile_id: talent.id, is_primary: true })
              .first();
            return {
              ...talent,
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
              ...talent,
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

    // Ensure elaraProfile has all required fields for transformation hero
    const elaraProfileForHero = elaraProfile || {
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
      elaraImages: elaraImages.length > 0 ? elaraImages : [],
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

// GET /api/public/session
router.get("/session", async (req, res) => {
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
      };

      if (user.role === "TALENT") {
        const profile = await knex("profiles")
          .where({ user_id: user.id })
          .first();
        if (profile) {
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
            } = require("../../lib/dashboard/completeness");
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
