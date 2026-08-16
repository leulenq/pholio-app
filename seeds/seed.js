const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { seedAgencyDemo } = require("../scripts/seed-agency-demo");
const { validateRegistry } = require("../scripts/validate-spec-registry");
const {
  publishRegistry,
} = require("../src/domains/spec-registry/store/publisher");

/* Legal acceptance must track the live constant. This file used to hardcode
   "2026-06-25"; CURRENT_LEGAL_VERSION has since moved to a later date, so every
   seeded account failed requireTalentLegalAcceptance() and got a 403 on every
   API route. That silently broke the demo accounts for developers and made two
   whole test suites unpassable. Deriving it here means a future version bump
   cannot reintroduce the drift. */
const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} = require("../src/shared/lib/legal-acceptance");

async function seedDemoData(knex, talentId, profileId) {
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

  // ─── Agencies ────────────────────────────────────────────────────────────
  // Invented houses, and they have to stay invented.
  //
  // This file used to seed Wilhelmina, IMG, Elite, Ford, DNA, The Society, Next
  // and Marilyn as live `ACTIVE` agencies and wire five of them into
  // `spec_registry_agency_routes`. Deliverability is derived from exactly that
  // pair (`preflight-service.js` `deliverableSeriesIds()`), so every developer
  // database, every screenshot and every demo said Pholio could deliver an
  // application to IMG. It cannot. Ruling R5 (design §9.2 "Remove") makes those
  // eight reference entries; migration 20260815103000 converts any database
  // that already has them.
  //
  // Real agencies now live in exactly two places — the Spec Registry pack, as
  // researched published requirements, and the Trust Registry pack, as
  // registry-verified reference entries. Neither is an inbox. With no seeded
  // route mapping, every pack agency correctly renders as a reference entry in
  // development, which is the same thing production shows.
  const agencyList = [
    {
      name: "Meridian Talent Collective",
      location: "New York, NY",
      website: "https://example.com/meridian-talent-collective",
      description:
        "A fictional agency used only for Pholio demo data. Meridian stands in for a mid-size New York house running women's, men's and new-faces boards.",
      openBoards: ["Women", "Men", "New Faces"],
      minHeightFemale: 173,
      maxHeightFemale: 183,
      minHeightMale: 183,
      maxHeightMale: 193,
      minAge: 16,
      maxAge: 30,
    },
    {
      name: "Harbor Model Management",
      location: "Los Angeles, CA",
      website: "https://example.com/harbor-model-management",
      description:
        "A fictional agency used only for Pholio demo data. Harbor stands in for a West Coast commercial and development board.",
      openBoards: ["Women", "Men", "Commercial", "Development"],
      minHeightFemale: 168,
      maxHeightFemale: 180,
      minHeightMale: 178,
      maxHeightMale: 190,
      minAge: 18,
      maxAge: 35,
    },
  ];

  const agencyIds = [];
  for (const ag of agencyList) {
    const id = uuidv4();
    agencyIds.push(id);
    await knex("agencies").insert({
      id,
      name: ag.name,
      location: ag.location,
      website: ag.website,
      description: ag.description || null,
      logo_path: ag.logoPath || null,
      brand_color: ag.brandColor || null,
      open_boards: JSON.stringify(ag.openBoards),
      status: "ACTIVE",
      // Set here rather than left to 20260701110000's backfill: that migration
      // matches on the old real names and, on a fresh database, runs before this
      // seed exists to be backfilled.
      min_height_female: ag.minHeightFemale,
      max_height_female: ag.maxHeightFemale,
      min_height_male: ag.minHeightMale,
      max_height_male: ag.maxHeightMale,
      min_age: ag.minAge,
      max_age: ag.maxAge,
    });
  }

  // ─── Applications ─────────────────────────────────────────────────────────
  // Valid statuses: submitted, shortlisted, booked, passed, accepted, declined, archived
  // One per agency: `applications` is unique on (profile_id, agency_id) for
  // direct applications, so the demo ledger is as long as the demo directory.
  // One live lane and one closed lane, which is the whole shape the merged
  // submission ledger has to render.
  const apps = [
    { agencyIdx: 0, status: "shortlisted", days: 3 }, // Meridian
    { agencyIdx: 1, status: "declined", days: 45 }, // Harbor
  ];

  for (const app of apps) {
    await knex("applications").insert({
      id: uuidv4(),
      profile_id: profileId,
      agency_id: agencyIds[app.agencyIdx],
      status: app.status,
      created_at: daysAgo(app.days),
    });
  }

  // ─── Analytics + Visitor Sessions (90 days) ──────────────────────────────
  const VISITOR_IDS = Array.from({ length: 18 }, () => uuidv4());
  const REFERRERS = [
    "https://instagram.com",
    "https://instagram.com",
    "https://instagram.com",
    null,
    null,
    "https://google.com",
    "https://google.com",
    "https://tiktok.com",
  ];
  const THEMES = ["editorial", "minimal", "bold"];
  const AGENTS = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  ];

  for (let daysBack = 90; daysBack >= 1; daysBack--) {
    // Build a UTC midnight base so DATE(created_at) in PostgreSQL always matches
    // the intended calendar day regardless of server timezone offset.
    const utcMidnight =
      Math.floor(now.getTime() / 86400000) * 86400000 - daysBack * 86400000;
    const day = new Date(utcMidnight);
    const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const recencyFactor = 1 + ((90 - daysBack) / 90) * 1.8;
    const base = isWeekend ? 5 : 3;
    const dailyViews = Math.round((base + Math.random() * 4) * recencyFactor);

    for (let v = 0; v < dailyViews; v++) {
      // Use millisecond arithmetic to stay in UTC — setHours() uses local time
      const viewTime = new Date(
        utcMidnight +
          (8 + Math.floor(Math.random() * 14)) * 3600000 +
          Math.floor(Math.random() * 60) * 60000,
      );

      const isReturning = Math.random() < 0.65;
      const visitorId = isReturning
        ? VISITOR_IDS[Math.floor(Math.random() * 12)]
        : VISITOR_IDS[12 + Math.floor(Math.random() * 6)];

      const referrer = REFERRERS[Math.floor(Math.random() * REFERRERS.length)];
      const userAgent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      const ip = `${100 + Math.floor(Math.random() * 155)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      await knex("visitor_sessions").insert({
        id: uuidv4(),
        profile_id: profileId,
        visitor_id: visitorId,
        started_at: viewTime,
        last_activity_at: viewTime,
        ip_address: ip,
        user_agent: userAgent,
        referrer,
        is_returning: isReturning,
      });

      await knex("analytics").insert({
        id: uuidv4(),
        profile_id: profileId,
        event_type: "view",
        event_source: "web",
        metadata: JSON.stringify({ referrer, slug: "mia-voss" }),
        ip_address: ip,
        user_agent: userAgent,
        created_at: viewTime,
      });

      if (Math.random() < 0.65) {
        await knex("analytics").insert({
          id: uuidv4(),
          profile_id: profileId,
          event_type: "bio_read",
          event_source: "web",
          metadata: JSON.stringify({
            duration: 10 + Math.floor(Math.random() * 40),
          }),
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 15000),
        });
      }

      if (Math.random() < 0.25) {
        await knex("analytics").insert({
          id: uuidv4(),
          profile_id: profileId,
          event_type: "social_click",
          event_source: "web",
          metadata: JSON.stringify({ platform: "instagram" }),
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 30000),
        });
      }

      if (Math.random() < 0.2) {
        await knex("analytics").insert({
          id: uuidv4(),
          profile_id: profileId,
          event_type: "portfolio_click",
          event_source: "web",
          metadata: JSON.stringify({ target: "editorial" }),
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 45000),
        });
      }

      if (Math.random() < 0.5) {
        await knex("analytics").insert({
          id: uuidv4(),
          profile_id: profileId,
          event_type: "scroll_depth",
          event_source: "web",
          metadata: JSON.stringify({ depth: Math.random() < 0.6 ? 75 : 100 }),
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 60000),
        });
      }

      if (Math.random() < 0.12) {
        await knex("analytics").insert({
          id: uuidv4(),
          profile_id: profileId,
          event_type: "download",
          event_source: "web",
          metadata: JSON.stringify({
            theme: THEMES[Math.floor(Math.random() * THEMES.length)],
          }),
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 90000),
        });
      }
    }
  }

  // ─── Activities (30 days, 25 entries) ────────────────────────────────────
  const activityTemplates = [
    {
      type: "image_uploaded",
      meta: () => ({ imageCount: 1 + Math.floor(Math.random() * 3) }),
    },
    { type: "image_uploaded", meta: () => ({ imageCount: 2 }) },
    {
      type: "profile_updated",
      meta: () => ({
        fields: [
          ["bio", "measurements", "city", "training"][
            Math.floor(Math.random() * 4)
          ],
        ],
      }),
    },
    {
      type: "profile_updated",
      meta: () => ({ fields: ["height_cm", "weight_kg"] }),
    },
    {
      type: "pdf_downloaded",
      meta: () => ({
        theme: THEMES[Math.floor(Math.random() * THEMES.length)],
      }),
    },
    { type: "pdf_downloaded", meta: () => ({ theme: "editorial" }) },
    {
      type: "portfolio_viewed",
      meta: () => ({
        source: ["direct", "instagram", "google"][
          Math.floor(Math.random() * 3)
        ],
      }),
    },
    {
      type: "submission_package_created",
      meta: () => ({ imageCount: 4 + Math.floor(Math.random() * 3) }),
    },
  ];

  const activityDays = [];
  for (let i = 0; i < 25; i++) {
    const bias =
      Math.random() < 0.7
        ? Math.floor(Math.random() * 14)
        : 14 + Math.floor(Math.random() * 16);
    activityDays.push(bias);
  }
  activityDays.sort((a, b) => b - a);

  for (const dayOffset of activityDays) {
    const t = new Date(now.getTime() - dayOffset * 86400000);
    t.setHours(9 + Math.floor(Math.random() * 10));
    t.setMinutes(Math.floor(Math.random() * 60));
    const tmpl =
      activityTemplates[Math.floor(Math.random() * activityTemplates.length)];
    await knex("activities").insert({
      id: uuidv4(),
      user_id: talentId,
      activity_type: tmpl.type,
      metadata: JSON.stringify(tmpl.meta()),
      created_at: t.toISOString(),
    });
  }

  return { agencyIds, now };
}

exports.seed = async function seed(knex) {
  // Delete existing data (optional - comment out if you want to keep existing data)
  await knex("applications")
    .del()
    .catch(() => {});
  await knex("analytics")
    .del()
    .catch(() => {});
  await knex("visitor_sessions")
    .del()
    .catch(() => {});
  await knex("activities")
    .del()
    .catch(() => {});
  await knex("agency_memberships")
    .del()
    .catch(() => {});
  await knex("agencies")
    .del()
    .catch(() => {});
  await knex("images").del();
  await knex("profiles").del();
  await knex("users").del();

  if (await knex.schema.hasTable("spec_registry_datasets")) {
    await publishRegistry(knex, validateRegistry());
  }

  const passwordHash = await bcrypt.hash("password123", 10);

  // Create agency account
  const agencyId = uuidv4();
  await knex("users").insert({
    id: agencyId,
    email: "agency@example.com",
    password_hash: passwordHash,
    // Demo accounts must be usable in a browser — the dashboard gates on this.
    email_verified: true,
    terms_accepted_at: new Date(),
    terms_accepted_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: new Date(),
    privacy_accepted_version: CURRENT_PRIVACY_VERSION,
    role: "AGENCY",
    first_name: "Sarah",
    last_name: "Chen",
  });

  await knex("agencies").insert({
    id: agencyId,
    name: "Pholio Partner Agency",
    status: "ACTIVE",
  });

  await knex("agency_memberships").insert({
    id: uuidv4(),
    agency_id: agencyId,
    user_id: agencyId,
    membership_role: "OWNER",
    status: "ACTIVE",
  });

  // Create talent account (demo: Mia Voss, Studio+)
  const talentId = uuidv4();
  await knex("users").insert({
    id: talentId,
    email: "talent@example.com",
    password_hash: passwordHash,
    // Demo accounts must be usable in a browser — the dashboard gates on this.
    email_verified: true,
    terms_accepted_at: new Date(),
    terms_accepted_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: new Date(),
    privacy_accepted_version: CURRENT_PRIVACY_VERSION,
    role: "TALENT",
  });

  const profileId = uuidv4();
  await knex("profiles").insert({
    id: profileId,
    user_id: talentId,
    slug: "mia-voss",
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
    partner_agency_id: null,
    onboarding_completed_at: new Date().toISOString(),
  });

  const recentDigitalCaptured = new Date(Date.now() - 14 * 86400000).toISOString();

  const miaImages = [
    {
      label: "Digital Headshot",
      sort: 1,
      shot_type: "headshot",
      image_type: "digital",
      style_type: "digitals",
      is_primary: true,
      captured_at: recentDigitalCaptured,
      path: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1000&q=80",
    },
    {
      label: "Digital Full-Length",
      sort: 2,
      shot_type: "full_length",
      image_type: "digital",
      style_type: "digitals",
      captured_at: recentDigitalCaptured,
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
  for (const img of miaImages) {
    await knex("images").insert({
      id: uuidv4(),
      profile_id: profileId,
      ...img,
    });
  }

  // Create Elara Keats placeholder account (for demo)
  const elaraUserId = uuidv4();
  await knex("users").insert({
    id: elaraUserId,
    email: "elara@example.com",
    password_hash: passwordHash,
    // Demo accounts must be usable in a browser — the dashboard gates on this.
    email_verified: true,
    terms_accepted_at: new Date(),
    terms_accepted_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: new Date(),
    privacy_accepted_version: CURRENT_PRIVACY_VERSION,
    role: "TALENT",
  });

  // Create Elara Keats profile (placeholder/demo account)
  const elaraProfileId = uuidv4();
  await knex("profiles").insert({
    id: elaraProfileId,
    user_id: elaraUserId,
    slug: "elara-k",
    first_name: "Elara",
    last_name: "Keats",
    city: "Los Angeles, CA",
    height_cm: 180,
    // measurements column was removed - using individual bust/waist/hips instead
    bio_raw:
      "Elara is a collaborative creative professional with a background in editorial campaigns and on-set leadership. Based in Los Angeles, she balances editorial edge with commercial versatility.",
    bio_curated:
      "Elara Keats brings a polished presence to every production. Based in Los Angeles, she balances editorial edge with commercial versatility. Standing at 5'11\" with measurements of 32-25-35, she brings a commanding presence to both high-fashion editorials and commercial campaigns.",
    is_pro: false,
    pdf_theme: null,
    pdf_customizations: null,
    partner_agency_id: null,
    // New comprehensive fields
    gender: "Female",
    date_of_birth: "1995-06-15",
    weight_kg: 58,
    dress_size: "4",
    hair_length: "Long",
    skin_tone: "Fair",
    languages: JSON.stringify(["English", "Spanish"]),
    availability_travel: true,
    availability_schedule: "Full-time",
    experience_level: "Experienced",
    training: "Formal training in editorial modeling and commercial acting.",
    reference_name: null,
    reference_email: null,
    reference_phone: null,
    // reference_relationship was removed in migration 20250106000000
    emergency_contact_name: "Jane Doe",
    emergency_contact_phone: "+1 (555) 123-4567",
    emergency_contact_relationship: "Parent",
    // nationality was removed in migration 20250106000000
    union_membership: null,
    ethnicity: null,
    tattoos: false,
    piercings: false,
    phone: null,
    bust_cm: 32,
    waist_cm: 25,
    hips_cm: 35,
    shoe_size: "9 US",
    eye_color: "Brown",
    hair_color: "Blonde",
    specialties: JSON.stringify(["Editorial", "Commercial"]),
  });

  // Create Elara Keats images (using Unsplash URLs for demo)
  const elaraImages = [
    {
      id: uuidv4(),
      profile_id: elaraProfileId,
      path: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1000&q=80",
      label: "Headshot",
      sort: 1,
    },
    {
      id: uuidv4(),
      profile_id: elaraProfileId,
      path: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1000&q=80",
      label: "Editorial",
      sort: 2,
    },
    {
      id: uuidv4(),
      profile_id: elaraProfileId,
      path: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=80",
      label: "Runway",
      sort: 3,
    },
    {
      id: uuidv4(),
      profile_id: elaraProfileId,
      path: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1000&q=80",
      label: "Portfolio",
      sort: 4,
    },
  ];

  for (const img of elaraImages) {
    await knex("images").insert(img);
  }

  await seedDemoData(knex, talentId, profileId);
  await seedAgencyDemo(knex);
};

exports.seedDemoData = seedDemoData;
