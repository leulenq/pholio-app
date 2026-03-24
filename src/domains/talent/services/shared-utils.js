/**
 * Shared Utilities for Dashboard Routes
 *
 * Common functions used across multiple dashboard route files.
 */

const knex = require("../../../shared/db/knex");
const { calculateProfileCompleteness } = require("./completeness");
const {
  getAllThemes,
  getFreeThemes,
  getProThemes,
  getDefaultTheme,
} = require("../../pdf/themes");
const { toFeetInches } = require("./stats");

/**
 * Loads dashboard data for rendering the talent dashboard
 * Used by both GET and POST routes
 */
async function loadDashboardData(req, profile = null) {
  // If profile not provided, load it
  if (!profile) {
    profile = await knex("profiles")
      .where({ user_id: req.session.userId })
      .first();
  }

  const currentUser = await knex("users")
    .where({ id: req.session.userId })
    .first();

  // Load images
  const images = profile
    ? await knex("images")
        .where({ profile_id: profile.id })
        .orderBy("sort", "asc")
    : [];

  // Calculate completeness - ensure email is included
  const profileForCompleteness = profile
    ? {
        ...profile,
        email: profile.email || currentUser?.email || null,
      }
    : null;

  const completeness = calculateProfileCompleteness(
    profileForCompleteness,
    images,
  );

  // Build share URL
  const shareUrl = profile
    ? `${req.protocol}://${req.get("host")}/portfolio/${profile.slug}`
    : null;

  // Get themes
  const allThemes = getAllThemes();
  const freeThemes = getFreeThemes();
  const proThemes = getProThemes();
  const currentTheme = profile?.pdf_theme || getDefaultTheme();
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  // Build stats
  const stats = profile?.height_cm
    ? { heightFeet: toFeetInches(profile.height_cm) }
    : null;

  return {
    profile,
    images,
    completeness,
    shareUrl,
    user: currentUser,
    currentUser,
    stats,
    allThemes,
    freeThemes,
    proThemes,
    currentTheme,
    baseUrl,
  };
}

/**
 * Renders the dashboard template with the provided data
 */
function renderDashboard(res, data, options = {}) {
  const { formErrors = null, values = null, showProfileForm = false } = options;

  return res.render("dashboard/talent", {
    title: "Talent Dashboard",
    profile: data.profile,
    images: data.images,
    completeness: data.completeness,
    stats: data.stats,
    shareUrl: data.shareUrl,
    user: data.user,
    currentUser: data.currentUser,
    isDashboard: true,
    layout: "layouts/dashboard",
    allThemes: data.allThemes,
    freeThemes: data.freeThemes,
    proThemes: data.proThemes,
    currentTheme: data.currentTheme,
    baseUrl: data.baseUrl,
    formErrors,
    values,
    showProfileForm,
  });
}

/**
 * Logs activity to the activities table (non-blocking)
 */
async function logActivity(userId, activityType, metadata = {}) {
  try {
    const { v4: uuidv4 } = require("uuid");
    await knex("activities").insert({
      id: uuidv4(),
      user_id: userId,
      activity_type: activityType,
      metadata: JSON.stringify(metadata),
      created_at: knex.fn.now(),
    });
  } catch (error) {
    console.error("[Dashboard] Error logging activity:", error);
    // Don't throw - activity logging is non-critical
  }
}

module.exports = {
  loadDashboardData,
  renderDashboard,
  logActivity,
};
