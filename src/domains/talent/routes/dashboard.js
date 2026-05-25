const express = require("express");

function formatActivity(activity) {
  const metadata =
    activity.metadata && typeof activity.metadata === "string"
      ? (() => {
          try {
            return JSON.parse(activity.metadata);
          } catch {
            return {};
          }
        })()
      : activity.metadata || {};

  let message = "Activity recorded";
  let icon = "📝";

  switch (activity.activity_type) {
    case "profile_updated":
      message = "Profile updated";
      icon = "✏️";
      break;
    case "image_uploaded": {
      const n = metadata.imageCount || 1;
      message = `${n} image${n > 1 ? "s" : ""} uploaded`;
      icon = "📷";
      break;
    }
    case "pdf_downloaded": {
      const theme = metadata.theme || "default";
      message = `PDF downloaded (${theme} theme)`;
      icon = "📄";
      break;
    }
    case "portfolio_viewed":
      message = "Portfolio viewed";
      icon = "👁️";
      break;
    case "submission_package_created": {
      const n = metadata.imageCount ?? 0;
      message =
        n > 0
          ? `Submission package saved (${n} image${n !== 1 ? "s" : ""})`
          : "Submission package saved";
      icon = "📦";
      break;
    }
  }

  const now = new Date();
  const then = new Date(activity.created_at);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  let timeAgo;
  if (diffMins < 1) timeAgo = "Just now";
  else if (diffMins < 60)
    timeAgo = `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  else if (diffHours < 24)
    timeAgo = `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  else if (diffDays < 7)
    timeAgo = `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  else timeAgo = then.toLocaleDateString();

  return {
    id: activity.id,
    type: activity.activity_type,
    message,
    icon,
    metadata,
    createdAt: activity.created_at,
    timeAgo,
  };
}

const router = express.Router();
const knex = require("../../../shared/db/knex");
const { requireRole } = require("../../auth/middleware/require-auth");
const { asyncHandler } = require("../../../shared/middleware/error-handler");

const { calculateProfileCompleteness } = require("../services/completeness");

// Helper: Get Strength Status UI (matching frontend logic if needed by templates, though here we send raw data)
const getStrengthLabel = (percentage) => {
  if (percentage < 70) return "Beginner";
  if (percentage < 90) return "Intermediate";
  if (percentage < 100) return "Advanced";
  return "Expert";
};

/**
 * GET /api/talent/overview
 * Powers the main dashboard overview
 */
router.get(
  "/overview",
  requireRole("TALENT"),
  asyncHandler(async (req, res) => {
    const userId = req.session.userId;

    // 1. Fetch Profile & Images
    const profile = await knex("profiles").where({ user_id: userId }).first();

    // Guard: If no profile yet
    if (!profile) {
      return res.json({
        profileStrength: { label: "Beginner", score: 0 },
        nextPriority: {
          title: "Welcome",
          action: "Create Profile",
          link: "/onboarding",
        },
        activityStream: [],
      });
    }

    const images = await knex("images")
      .where({ profile_id: profile.id })
      .orderBy("sort", "asc");

    // 2. Calculate Strength & Priority
    const completeness = calculateProfileCompleteness(profile, images);
    const profileStrength = {
      score: completeness.percentage,
      label: getStrengthLabel(completeness.percentage),
    };

    // Use the unified Next Steps from the completeness calculator
    // Get the top priority item, or default if none
    const topPriority = completeness.nextSteps?.[0] || {
      title: "Growth",
      action: "Optimize Profile",
      link: "/dashboard/talent/profile",
    };

    const nextPriority = {
      title:
        topPriority.impact === "Critical"
          ? "First Impression"
          : topPriority.title,
      action: topPriority.action,
      link: topPriority.link,
    };

    // 3. Fetch recent activity stream
    let activityStream = [];
    try {
      const rows = await knex("activities")
        .where({ user_id: userId })
        .orderBy("created_at", "desc")
        .limit(5);
      activityStream = rows.map(formatActivity);
    } catch (error) {
      console.warn("Failed to fetch activity stream", error);
    }

    // 4. Recommended Agencies (Mock data from legacy EJS)
    const recommendedAgencies = [
      {
        id: 1,
        name: "Elite Models",
        logo: "E",
        match: 95,
        tags: ["Fashion", "Runway"],
        location: "LA-based",
        lookingFor: "Female, 5'9\"+",
        type: "high",
      },
      {
        id: 2,
        name: "IMG Models",
        logo: "I",
        match: 87,
        tags: ["Commercial", "Print"],
        location: "Nationwide",
        lookingFor: "All heights",
        type: "standard",
      },
      {
        id: 3,
        name: "Next Management",
        logo: "N",
        match: 82,
        tags: ["Editorial", "Diversity"],
        location: "NYC-based",
        lookingFor: "NYC-based talent",
        type: "standard",
      },
    ];

    return res.json({
      profileStrength,
      nextPriority,
      activityStream,
      recommendedAgencies,
    });
  }),
);

module.exports = router;
