"use strict";

const { randomUUID } = require("crypto");
const knex = require("../db/knex");
const {
  resolveAgencyContextForMemberUser,
} = require("../../domains/agency/services/context");
const { ensureUniqueSlug } = require("./slugify");

function isDevSeedAuthEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_PASSTHROUGH_ENABLED === "1"
  );
}

function seedEmailForRole(role) {
  if (role === "AGENCY") {
    return (
      process.env.AUTH_PASSTHROUGH_AGENCY_EMAIL || "agency@example.com"
    ).trim().toLowerCase();
  }
  return (
    process.env.AUTH_PASSTHROUGH_TALENT_EMAIL || "talent@example.com"
  ).trim().toLowerCase();
}

const DONE_ONBOARDING_STATE = {
  version: "v2_casting_call",
  current_step: "done",
  completed_steps: [
    "entry",
    "gender",
    "birthdate",
    "scout",
    "measurements",
    "profile",
  ],
  step_data: {},
  started_at: new Date().toISOString(),
};

const SEED_TALENT_IMAGES = [
  {
    label: "Digital Headshot",
    sort: 1,
    shot_type: "headshot",
    image_type: "digital",
    style_type: "digitals",
    is_primary: true,
    path: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1000&q=80",
  },
  {
    label: "Digital Full-Length",
    sort: 2,
    shot_type: "full_length",
    image_type: "digital",
    style_type: "digitals",
    is_primary: false,
    path: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1000&q=80",
  },
];

/**
 * Ensure talent@example.com has a completed dashboard-ready profile.
 * Local DBs often keep the user row after a wipe/partial seed without the profile.
 */
async function ensureSeedTalentProfile(userId) {
  let profile = await knex("profiles").where({ user_id: userId }).first();
  const now = new Date();

  if (!profile) {
    const slug = await ensureUniqueSlug(knex, "profiles", "mia-voss");
    const profileId = randomUUID();
    const row = {
      id: profileId,
      user_id: userId,
      slug,
      first_name: "Mia",
      last_name: "Voss",
      city: "Los Angeles, CA",
      height_cm: 178,
      weight_kg: 57,
      bust_cm: 81,
      waist_cm: 61,
      hips_cm: 88,
      dress_size: "4",
      shoe_size: "8 US",
      hair_color: "Dark Brown",
      hair_length: "Long",
      eye_color: "Hazel",
      skin_tone: "Medium",
      gender: "Female",
      date_of_birth: "1997-04-12",
      experience_level: "Experienced",
      specialties: JSON.stringify(["Editorial", "Commercial", "Runway"]),
      languages: JSON.stringify(["English", "French"]),
      bio_raw:
        "LA-based editorial and commercial model with six years of campaign and runway experience.",
      bio_curated:
        "Mia Voss is a Los Angeles-based editorial and commercial model with over six years of campaign and runway experience.",
      phone: "+1 (310) 555-0144",
      is_pro: true,
      onboarding_completed_at: now,
      created_at: now,
      updated_at: now,
    };

    // Optional columns vary by migration state — only set when present.
    const columns = await knex("profiles").columnInfo();
    if (columns.discipline) row.discipline = "model";
    if (columns.is_public) row.is_public = true;
    if (columns.is_discoverable) row.is_discoverable = true;
    if (columns.visibility_mode) row.visibility_mode = "public";
    if (columns.profile_status) row.profile_status = "active";
    if (columns.work_status) row.work_status = "available";
    if (columns.services_locked) row.services_locked = false;
    if (columns.onboarding_state_json) {
      row.onboarding_state_json = JSON.stringify(DONE_ONBOARDING_STATE);
    }
    if (columns.unlock_celebrated_at) row.unlock_celebrated_at = now;

    await knex("profiles").insert(row);
    profile = await knex("profiles").where({ id: profileId }).first();

    const imageCount = await knex("images")
      .where({ profile_id: profileId })
      .count("* as c")
      .first();
    if (Number(imageCount?.c || 0) === 0) {
      const capturedAt = new Date(Date.now() - 14 * 86400000);
      for (const img of SEED_TALENT_IMAGES) {
        await knex("images").insert({
          id: randomUUID(),
          profile_id: profileId,
          label: img.label,
          sort: img.sort,
          shot_type: img.shot_type,
          image_type: img.image_type,
          style_type: img.style_type,
          is_primary: Boolean(img.is_primary),
          path: img.path,
          public_url: img.path,
          captured_at: capturedAt,
          moderation_status: "approved",
          created_at: now,
        });
      }
    }

    console.log(
      `[DevSeed] Created completed talent profile ${slug} for user ${userId}`,
    );
    return profile;
  }

  const patch = {};
  if (!profile.onboarding_completed_at) {
    patch.onboarding_completed_at = now;
  }
  const columns = await knex("profiles").columnInfo();
  if (columns.onboarding_state_json && !profile.onboarding_state_json) {
    patch.onboarding_state_json = JSON.stringify(DONE_ONBOARDING_STATE);
  }
  if (columns.profile_status && !profile.profile_status) {
    patch.profile_status = "active";
  }
  if (columns.services_locked && profile.services_locked) {
    patch.services_locked = false;
  }
  if (Object.keys(patch).length) {
    patch.updated_at = now;
    await knex("profiles").where({ id: profile.id }).update(patch);
    profile = { ...profile, ...patch };
  }

  return profile;
}

/**
 * Establish an Express session for a seeded local principal.
 * Used by /api/dev/bootstrap and the path-based auto-auth middleware.
 *
 * @returns {{ ok: true, email: string, role: string } | { ok: false, error: string, status?: number }}
 */
async function establishDevSeedSession(req, role) {
  if (!isDevSeedAuthEnabled()) {
    return { ok: false, status: 404, error: "Not found" };
  }

  const targetRole = role === "AGENCY" ? "AGENCY" : "TALENT";
  const targetEmail = seedEmailForRole(targetRole);
  const user = await knex("users")
    .whereRaw("LOWER(email) = ?", [targetEmail])
    .first();

  if (!user) {
    return {
      ok: false,
      status: 404,
      error: `Seeded ${targetRole.toLowerCase()} account ${targetEmail} was not found. Run npm run seed.`,
    };
  }

  if (user.role !== targetRole) {
    return {
      ok: false,
      status: 409,
      error: `Seeded account ${targetEmail} has role ${user.role}, expected ${targetRole}.`,
    };
  }

  if (targetRole === "AGENCY") {
    const agencyContext = await resolveAgencyContextForMemberUser(user.id);
    if (!agencyContext?.agency) {
      return {
        ok: false,
        status: 403,
        error: "No agency workspace is linked to the seeded agency account.",
      };
    }

    // Keep local agency dashboards usable even if onboarding timestamps lag.
    let onboardingCompletedAt = agencyContext.agency.onboarding_completed_at;
    if (!onboardingCompletedAt) {
      onboardingCompletedAt = new Date();
      await knex("agencies")
        .where({ id: agencyContext.agency.id })
        .update({
          onboarding_completed_at: onboardingCompletedAt,
          onboarding_completed_by_user_id: user.id,
          updated_at: new Date(),
        });
    }

    req.session.userId = agencyContext.agency.id;
    req.session.memberUserId = user.id;
    req.session.agencyId = agencyContext.agency.id;
    req.session.agencyMembershipId = agencyContext.membership?.id || null;
    req.session.agencyMembershipRole =
      agencyContext.membership?.membership_role || "OWNER";
    req.session.agencyOnboardingCompletedAt = onboardingCompletedAt;
    req.session.role = "AGENCY";
  } else {
    await ensureSeedTalentProfile(user.id);

    req.session.userId = user.id;
    req.session.role = "TALENT";
    delete req.session.memberUserId;
    delete req.session.agencyId;
    delete req.session.agencyMembershipId;
    delete req.session.agencyMembershipRole;
    delete req.session.agencyOnboardingCompletedAt;
  }

  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  return { ok: true, email: targetEmail, role: targetRole };
}

module.exports = {
  isDevSeedAuthEnabled,
  seedEmailForRole,
  ensureSeedTalentProfile,
  establishDevSeedSession,
};
