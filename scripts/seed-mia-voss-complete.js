#!/usr/bin/env node
/**
 * Hydrate Mia Voss (slug: mia-voss) with the full demo profile from seeds/seed.js
 * without wiping other accounts. Safe to re-run.
 *
 * Usage: node scripts/seed-mia-voss-complete.js
 */

require("dotenv").config();

const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const knex = require("../src/shared/db/knex");
const { updateProfileCompleteness } = require("../src/domains/talent/services/profile-completeness");
const { injectSocialFields } = require("../src/shared/lib/social-helpers");
const { calculateProfileStrength } = require("../src/domains/talent/services/profile-strength");
const { seedDemoData } = require("../seeds/seed");

const MIA_SLUG = "mia-voss";
const MIA_EMAIL = "talent@example.com";

const MIA_IMAGES = [
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
    path: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1000&q=80",
  },
  {
    label: "Editorial",
    sort: 3,
    shot_type: "three_quarter",
    image_type: "portfolio",
    style_type: "editorial",
    path: "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1000&q=80",
  },
  {
    label: "Commercial",
    sort: 4,
    shot_type: "three_quarter",
    image_type: "portfolio",
    style_type: "commercial",
    path: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=80",
  },
  {
    label: "Editorial 2",
    sort: 5,
    shot_type: "profile",
    image_type: "portfolio",
    style_type: "editorial",
    path: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=1000&q=80",
  },
  {
    label: "Lifestyle",
    sort: 6,
    shot_type: "three_quarter",
    image_type: "portfolio",
    style_type: "lifestyle",
    path: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1000&q=80",
  },
];

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

async function resolveMia() {
  const profile = await knex("profiles").where({ slug: MIA_SLUG }).first();
  if (!profile) {
    throw new Error(`Profile not found for slug ${MIA_SLUG}`);
  }
  const user = await knex("users").where({ id: profile.user_id }).first();
  if (!user) {
    throw new Error(`User not found for Mia profile ${profile.id}`);
  }
  return { profile, user };
}

async function upsertInstagram(profileId) {
  const handle = "miavoss";
  const url = "https://instagram.com/miavoss";
  const existing = await knex("social_accounts")
    .where({ profile_id: profileId, platform: "instagram" })
    .first();

  const row = {
    handle,
    url,
    follower_count: 12400,
    engagement_rate: 3.8,
    is_oauth_connected: false,
    updated_at: knex.fn.now(),
  };

  if (existing) {
    await knex("social_accounts").where({ id: existing.id }).update(row);
    return existing.id;
  }

  const id = uuidv4();
  await knex("social_accounts").insert({
    id,
    profile_id: profileId,
    platform: "instagram",
    ...row,
    created_at: knex.fn.now(),
  });
  return id;
}

async function replaceImages(profileId) {
  await knex("images").where({ profile_id: profileId }).del();
  const capturedAt = new Date(Date.now() - 14 * 86400000).toISOString();

  for (const img of MIA_IMAGES) {
    await knex("images").insert({
      id: uuidv4(),
      profile_id: profileId,
      label: img.label,
      sort: img.sort,
      shot_type: img.shot_type,
      image_type: img.image_type,
      style_type: img.style_type,
      is_primary: Boolean(img.is_primary),
      path: img.path,
      public_url: img.path,
      captured_at: img.image_type === "digital" ? capturedAt : null,
      moderation_status: "approved",
      created_at: knex.fn.now(),
    });
  }
}

async function ensureDemoData(talentId, profileId) {
  const appCount = await knex("applications")
    .where({ profile_id: profileId })
    .count("* as c")
    .first();
  if (Number(appCount?.c || 0) > 0) {
    console.log(`[seed-mia] Keeping ${appCount.c} existing application(s)`);
    return;
  }

  console.log("[seed-mia] Seeding demo applications, analytics, activities...");
  await seedDemoData(knex, talentId, profileId);
}

async function main() {
  const { profile, user } = await resolveMia();
  const profileId = profile.id;
  const talentId = user.id;

  console.log(`[seed-mia] Hydrating ${profile.first_name} ${profile.last_name} (${profileId})`);

  const passwordHash = await bcrypt.hash("password123", 10);
  await knex("users").where({ id: talentId }).update({
    email: MIA_EMAIL,
    role: "TALENT",
    account_status: "active",
    password_hash: user.password_hash || passwordHash,
  });

  const now = new Date().toISOString();
  await knex("profiles").where({ id: profileId }).update({
    slug: MIA_SLUG,
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
    discipline: "model",
    specialties: JSON.stringify(["Editorial", "Commercial", "Runway"]),
    languages: JSON.stringify(["English", "French"]),
    bio_raw:
      "LA-based editorial and commercial model with six years of campaign and runway experience.",
    bio_curated:
      "Mia Voss is a Los Angeles-based editorial and commercial model with over six years of campaign and runway experience. Known for her ability to shift between high-fashion editorial and warm commercial presence, she is represented across three continents.",
    training:
      "Formal training in editorial modeling and runway technique. Workshops with Elite Model Management NY (2019), IMG Paris (2021).",
    union_membership: null,
    tattoos: false,
    piercings: false,
    availability_travel: true,
    availability_schedule: "Full-time",
    emergency_contact_name: "Sophie Voss",
    emergency_contact_phone: "+1 (310) 555-0182",
    emergency_contact_relationship: "Sister",
    phone: "+1 (310) 555-0144",
    is_pro: true,
    is_public: true,
    is_discoverable: true,
    visibility_mode: "public",
    profile_status: "active",
    work_status: "available",
    onboarding_completed_at: profile.onboarding_completed_at || now,
    onboarding_state_json: JSON.stringify(DONE_ONBOARDING_STATE),
    onboarding_stage: "complete",
    services_locked: false,
    analysis_status: "complete",
    updated_at: knex.fn.now(),
  });

  await replaceImages(profileId);
  await upsertInstagram(profileId);
  await ensureDemoData(talentId, profileId);

  await updateProfileCompleteness(profileId);

  const hydrated = await knex("profiles").where({ id: profileId }).first();
  const images = await knex("images").where({ profile_id: profileId });
  await injectSocialFields(hydrated);
  const strength = calculateProfileStrength({ ...hydrated, images });

  await knex("profiles").where({ id: profileId }).update({
    profile_completeness: strength.score,
    services_locked: !strength.isCoreReady,
    updated_at: knex.fn.now(),
  });

  console.log("[seed-mia] Done.");
  console.log(
    JSON.stringify(
      {
        email: MIA_EMAIL,
        slug: MIA_SLUG,
        userId: talentId,
        profileId,
        imageCount: images.length,
        profileCompleteness: strength.score,
        isCoreReady: strength.isCoreReady,
        servicesLocked: !strength.isCoreReady,
        isPro: true,
      },
      null,
      2,
    ),
  );

  await knex.destroy();
}

main().catch(async (err) => {
  console.error("[seed-mia] Failed:", err);
  try {
    await knex.destroy();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
