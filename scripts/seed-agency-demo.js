// Realistic demo dataset for the agency Overview, scoped to the seed agency only.
// Re-runnable: wipes prior demo data for this agency before re-seeding.
//   node scripts/seed-agency-demo.js
"use strict";

const { randomUUID } = require("crypto");
const {
  syncRosterMembershipForApplication,
} = require("../src/domains/agency/services/roster-memberships");

const AGENCY_EMAIL = "agency@example.com";
const DEMO_DOMAIN = "@seed.pholio.studio";
const TEAM_DOMAIN = "@team.pholio.studio";
const AGENCY_NAME = "Lumen Model Management";
const AGENCY_LOCATION = "New York, NY";
const AGENCY_SLUG = "lumen-models";
const AGENCY_WEBSITE = "https://lumenmodels.com";
const AGENCY_DESCRIPTION =
  "Lumen Model Management is a boutique New York agency focused on editorial, runway, commercial, and development talent. The team scouts selective new faces and builds polished books for luxury campaigns, fashion week packages, and brand lookbooks.";
const AGENCY_LOGO = "/agency-logos/lumen-model-management.svg";
const AGENCY_OPEN_BOARDS = ["Women", "Men", "Runway", "Development"];
const OWNER_FIRST = "Sarah";
const OWNER_LAST = "Chen";
const OWNER_AVATAR =
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=240&h=240&q=80";

// Unsplash portrait set (content-backed headshots for demo talent).
const PORTRAITS = [
  "1534528741775-53994a69daeb",
  "1506794778202-cad84cf45f1d",
  "1517841905240-472988babdf9",
  "1438761681033-6461ffad8d80",
  "1500648767791-00dcc994a43e",
  "1494790108377-be9c29b29330",
  "1507003211169-0a1dd7228f2d",
  "1531746020798-e6953c6e8e04",
  "1524504388940-b1c1722653e1",
  "1488426862026-3ee34a7d66df",
  "1492562080023-ab3db95bfbce",
  "1463453091185-61582044d556",
  "1521119989659-a83eee488004",
  "1502823403499-6ccfcf4fb453",
  "1489424731084-a5d8b219a5bb",
  "1496439786094-e22e5f0d9f88",
  "1508214751196-bcfd4ca60f91",
  "1463453091185-61582044d556",
];
const portraitUrl = (i) =>
  `https://images.unsplash.com/photo-${PORTRAITS[i % PORTRAITS.length]}?auto=format&fit=crop&w=400&h=520&q=80`;
const teamAvatarUrl = (photoId) =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=240&h=240&q=80`;

const TEAM = [
  {
    first: "Marcus",
    last: "Vance",
    role: "ADMIN",
    avatar: teamAvatarUrl("1507003211169-0a1dd7228f2d"),
  },
  {
    first: "Priya",
    last: "Anand",
    role: "SCOUT",
    avatar: teamAvatarUrl("1573497019940-1c28c88b4f3e"),
  },
  {
    first: "Theo",
    last: "Laurent",
    role: "SCOUT",
    avatar: teamAvatarUrl("1500648767791-00dcc994a43e"),
  },
];

const now = Date.now();
const DAY = 86400000;
// ISO strings, not Date instances: the sqlite3 driver stores Date objects as
// epoch-ms numbers, which silently never match the ISO-string comparisons the
// app's queries use (e.g. boards closing today). PostgreSQL accepts ISO too.
const daysAgo = (d) => new Date(now - d * DAY).toISOString();
const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();
const daysAhead = (d) => new Date(now + d * DAY).toISOString();
const ri = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const FIRST = [
  "Amara",
  "Sofia",
  "Zara",
  "Elena",
  "Mia",
  "Noah",
  "Liam",
  "Aria",
  "Kai",
  "Luca",
  "Ines",
  "Yuki",
  "Nadia",
  "Omar",
  "Priya",
  "Hana",
  "Theo",
  "Lena",
  "Marcus",
  "Chloe",
  "Idris",
  "Sven",
  "Anaïs",
  "Dario",
  "Freya",
  "Jin",
  "Maya",
  "Ravi",
  "Esme",
  "Bo",
  "Cleo",
  "Tariq",
  "Vera",
  "Leo",
  "Nina",
  "Otto",
  "Sade",
  "Remy",
  "Ada",
  "Kofi",
];
const LAST = [
  "Johnson",
  "Chen",
  "Williams",
  "Marcus",
  "Thompson",
  "Okafor",
  "Petrova",
  "Sato",
  "Rossi",
  "Dubois",
  "Khan",
  "Andersson",
  "Reyes",
  "Haddad",
  "Nguyen",
  "Bauer",
  "Costa",
  "Mbeki",
  "Larsen",
  "Romano",
  "Flores",
  "Park",
  "Moreau",
  "Singh",
  "Kone",
  "Ito",
  "Vance",
  "Ahmed",
  "Bianchi",
  "Novak",
];
const CITIES = [
  "New York",
  "Los Angeles",
  "Paris",
  "Milan",
  "London",
  "Miami",
  "Chicago",
  "Berlin",
];
// Editorial-heavy mix with a thin Fitness tail (drives a "scout" recommendation).
const ARCHETYPES = [
  "Editorial",
  "Editorial",
  "Editorial",
  "Runway",
  "Runway",
  "Commercial",
  "Commercial",
  "Lifestyle",
  "Beauty",
  "Fitness",
];

const DISCOVER_BIOS = [
  "Paris-based editorial new face with sharp cheekbones and luminous skin. Strong runway walk, versatile for avant-garde and luxury campaigns.",
  "Milan runway specialist — tall, angular, and commanding on the catwalk. Experienced with FW and SS show packages.",
  "Commercial talent with warm, approachable energy. Natural smile reads effortlessly on camera for lifestyle and beauty brands.",
  "London editorial icon with striking bone structure and an intense gaze. Photographs exceptionally in high-contrast lighting.",
  "New York new face — androgynous features, refined energy, ideal for gender-fluid editorial spreads.",
  "Short-stature editorial talent with sharp jawline and porcelain skin. Perfect for beauty close-ups and intimate portraiture.",
  "Athletic fitness model with toned build and confident presence. Activewear and sport lifestyle specialist.",
  "Tokyo-based commercial lead with soft, natural beauty and girl-next-door relatability for mass-market campaigns.",
  "Berlin avant-garde presence — edgy, raw, rebellious energy with unconventional features that stop the scroll.",
  "Miami lifestyle ambassador with sun-kissed glow, healthy skin, and effortless beach-to-studio versatility.",
  "Copenhagen classic beauty — timeless elegance, refined posture, luxury campaign ready.",
  "Seoul beauty specialist with delicate features, luminous skin, and precise editorial expression control.",
  "Los Angeles commercial talent — tall, lean, with warm California energy for denim and e-commerce lookbooks.",
  "Chicago runway proportions — 180cm, long limbs, geometric bone structure built for couture presentations.",
  "Mixed-heritage editorial face with high cheekbones, deep-set eyes, and a striking editorial register.",
  "Established commercial veteran with seasoned on-set professionalism and versatile casting range.",
];

/** Heritage-aware copy overrides (discoverIdx 0–15) */
const DISCOVER_BIO_OVERRIDES = {
  1: "Black Caribbean male model with deep skin tone, angular bone structure, and commanding runway walk. Strong for Milan shows and luxury menswear.",
  8: "Black female editorial talent with rich skin tone, high cheekbones, and striking presence. Beauty and luxury campaign specialist.",
};

const DISCOVER_SKIN_TONE = [
  "Fair",
  "Deep brown",
  "Light",
  "Medium",
  "Olive",
  "Tan",
  "Medium-dark",
  "Fair",
  "Rich ebony",
  "Light",
  "Medium",
  "Tan",
  "Fair",
  "Medium",
  "Olive",
  "Light",
];

const BOARDS = [
  {
    name: "Vogue Italia · Editorial",
    client: "Condé Nast",
    closes: daysAhead(0),
    slots: 6,
    description:
      "Seeking 6 editorial faces for a Milan studio shoot — strong bone structure, luminous skin, and comfort with avant-garde styling.",
  },
  {
    name: "Dior SS26 Campaign",
    client: "Dior",
    closes: daysAhead(2),
    slots: 4,
    description:
      "Luxury campaign casting for Dior SS26. Tall runway proportions preferred; experience with couture presentations is a plus.",
  },
  {
    name: "Calvin Klein Denim",
    client: "Calvin Klein",
    closes: daysAhead(3),
    slots: 8,
    description:
      "Denim lookbook for CK — clean, approachable energy with strong commercial presence. Ages 18–28.",
  },
  {
    name: "NYFW Runway Package",
    client: "IMG Productions",
    closes: daysAhead(5),
    slots: 12,
    description:
      "Runway package for NYFW — minimum 175cm, confident walk, availability for fittings and show week.",
  },
  {
    name: "Zara Commercial Lookbook",
    client: "Inditex",
    closes: daysAhead(12),
    slots: 10,
    description:
      "Fast-turn e-comm lookbook. Versatile commercial talent who photograph well in natural light.",
  },
  {
    name: "Chanel Beauty",
    client: "Chanel",
    closes: daysAhead(25),
    slots: 5,
    description:
      "Beauty close-up casting — porcelain skin, expressive eyes, comfort with macro lens work.",
  },
  {
    name: "Net-a-Porter E-comm",
    client: "Net-a-Porter",
    closes: daysAhead(40),
    slots: 15,
    description:
      "High-volume e-comm package for luxury e-tail. Reliable on-set professionalism required.",
  },
  {
    name: "Aritzia Fall",
    client: "Aritzia",
    closes: null,
    slots: 9,
    description:
      "Fall lifestyle campaign — warm, relatable energy for Canadian and US markets.",
  },
];

const TAG_POOL = [
  { tag: "Editorial", color: "#B8956A" },
  { tag: "NYFW", color: "#1A1815" },
  { tag: "Priority", color: "#C0392B" },
  { tag: "Callback", color: "#3B82F6" },
  { tag: "Runway", color: "#6B6560" },
  { tag: "Commercial", color: "#16A34A" },
  { tag: "Paris Exp.", color: "#9333EA" },
  { tag: "New Face", color: "#0891B2" },
];

const FILTER_PRESETS = [
  {
    name: "New Submissions",
    filters: { status: "submitted", sort: "newest" },
    is_default: true,
  },
  {
    name: "Runway Ready",
    filters: { min_height: 175, archetype: "Runway" },
    is_default: false,
  },
  {
    name: "Shortlisted",
    filters: { status: "shortlisted" },
    is_default: false,
  },
  {
    name: "High Match",
    filters: { min_match: 90 },
    is_default: false,
  },
];

async function seedAgencyDemo(knex) {
  const agency = await knex("users")
    .where({ email: AGENCY_EMAIL, role: "AGENCY" })
    .first();
  if (!agency) throw new Error(`Agency user ${AGENCY_EMAIL} not found`);

  const membership = await knex("agency_memberships")
    .where({ user_id: agency.id, status: "ACTIVE" })
    .orderBy("created_at", "asc")
    .first();
  const aid = membership?.agency_id || agency.id;

  // Give the workspace a real name/location for the co-brand + masthead.
  await knex("agencies").where({ id: aid }).update({
    name: AGENCY_NAME,
    slug: AGENCY_SLUG,
    location: AGENCY_LOCATION,
    website: AGENCY_WEBSITE,
    description: AGENCY_DESCRIPTION,
    logo_path: AGENCY_LOGO,
    brand_color: null,
    open_boards: JSON.stringify(AGENCY_OPEN_BOARDS),
    notify_new_applications: true,
    notify_status_changes: true,
    default_view: "overview",
    onboarding_started_at: daysAgo(90),
    onboarding_completed_at: daysAgo(85),
    onboarding_completed_by_user_id: agency.id,
    updated_at: new Date(),
  });
  await knex("users").where({ id: agency.id }).update({
    first_name: OWNER_FIRST,
    last_name: OWNER_LAST,
    avatar_url: OWNER_AVATAR,
    agency_name: AGENCY_NAME,
    agency_location: AGENCY_LOCATION,
    agency_slug: AGENCY_SLUG,
    agency_website: AGENCY_WEBSITE,
    agency_description: AGENCY_DESCRIPTION,
    agency_logo_path: AGENCY_LOGO,
    agency_brand_color: null,
  });

  // ---- wipe prior demo (this agency only) ----
  await knex("application_activities").where({ agency_id: aid }).del();
  await knex("interviews").where({ agency_id: aid }).del();
  await knex("reminders").where({ agency_id: aid }).del();
  await knex("filter_presets").where({ agency_id: aid }).del();
  await knex("application_tags").where({ agency_id: aid }).del();
  if (await knex.schema.hasTable("roster_memberships")) {
    await knex("roster_memberships").where({ agency_id: aid }).del();
  }
  if (await knex.schema.hasTable("notifications")) {
    await knex("notifications").where({ user_id: agency.id }).del();
  }
  const oldApps = (
    await knex("applications").where({ agency_id: aid }).select("id")
  ).map((a) => a.id);
  if (oldApps.length) {
    await knex("messages").whereIn("application_id", oldApps).del();
    await knex("application_notes").whereIn("application_id", oldApps).del();
  }
  const oldBoards = (
    await knex("boards").where({ agency_id: aid }).select("id")
  ).map((b) => b.id);
  if (oldBoards.length) {
    await knex("board_scoring_weights").whereIn("board_id", oldBoards).del();
    await knex("board_requirements").whereIn("board_id", oldBoards).del();
    await knex("board_applications").whereIn("board_id", oldBoards).del();
  }
  await knex("applications").where({ agency_id: aid }).del();
  await knex("boards").where({ agency_id: aid }).del();
  const demoUserIds = (
    await knex("users").where("email", "like", `%${DEMO_DOMAIN}`).select("id")
  ).map((u) => u.id);
  if (demoUserIds.length) {
    const demoProfileIds = (
      await knex("profiles").whereIn("user_id", demoUserIds).select("id")
    ).map((p) => p.id);
    if (demoProfileIds.length)
      await knex("images").whereIn("profile_id", demoProfileIds).del();
    await knex("profiles").whereIn("user_id", demoUserIds).del();
    await knex("users").whereIn("id", demoUserIds).del();
  }
  // demo team members (extra agency logins)
  const teamUserIds = (
    await knex("users").where("email", "like", `%${TEAM_DOMAIN}`).select("id")
  ).map((u) => u.id);
  if (teamUserIds.length) {
    await knex("agency_memberships").whereIn("user_id", teamUserIds).del();
    await knex("users").whereIn("id", teamUserIds).del();
  }

  // ---- talent (users + profiles) ----
  const TALENT_COUNT = 56;
  const profiles = [];
  for (let i = 0; i < TALENT_COUNT; i++) {
    const uid = randomUUID();
    const pid = randomUUID();
    const first = FIRST[i % FIRST.length];
    const last = pick(LAST);
    const discoverableNoApp = i >= 40; // 40..55 are scoutable, no application
    const createdRecent = i >= 52; // last few joined this week
    profiles.push({
      pid,
      uid,
      first,
      last,
      archetype: pick(ARCHETYPES),
      city: pick(CITIES),
      hasApp: i < 40,
      discoverable: discoverableNoApp,
      created: createdRecent ? daysAgo(ri(1, 5)) : daysAgo(ri(20, 400)),
    });
  }

  await knex("users").insert(
    profiles.map((p) => ({
      id: p.uid,
      email:
        `${p.first}.${p.last}.${p.pid.slice(0, 6)}${DEMO_DOMAIN}`.toLowerCase(),
      role: "TALENT",
      first_name: p.first,
      last_name: p.last,
      created_at: p.created,
    })),
  );

  const profileRows = profiles.map((p, i) => {
    const discoverIdx = i - 40;
    const isDiscoverable = p.discoverable;
    const row = {
      id: p.pid,
      user_id: p.uid,
      slug: `${p.first}-${p.last}-${p.pid.slice(0, 6)}`.toLowerCase(),
      first_name: p.first,
      last_name: p.last,
      city: p.city,
      height_cm: isDiscoverable
        ? [157, 162, 168, 175, 178, 180, 183, 188][discoverIdx % 8]
        : ri(172, 188),
      bio_raw: isDiscoverable
        ? DISCOVER_BIO_OVERRIDES[discoverIdx] ||
          DISCOVER_BIOS[discoverIdx % DISCOVER_BIOS.length]
        : "Demo talent profile.",
      bio_curated: isDiscoverable
        ? DISCOVER_BIO_OVERRIDES[discoverIdx] ||
          DISCOVER_BIOS[discoverIdx % DISCOVER_BIOS.length]
        : "Demo talent profile.",
      archetype: p.archetype,
      gender: isDiscoverable
        ? ["Female", "Male", "Female", "Female", "Male", "Non-binary"][
            discoverIdx % 6
          ]
        : pick(["Female", "Male", "Non-binary"]),
      experience_level: isDiscoverable
        ? ["New face", "Experienced", "Established", "New face"][
            discoverIdx % 4
          ]
        : null,
      ethnicity: isDiscoverable
        ? JSON.stringify(
            [
              ["East Asian"],
              ["Black", "Caribbean"],
              ["White", "European"],
              ["South Asian"],
              ["Latino"],
              ["Middle Eastern"],
              ["Mixed"],
            ][discoverIdx % 7],
          )
        : null,
      skin_tone: isDiscoverable ? DISCOVER_SKIN_TONE[discoverIdx] : null,
      date_of_birth: daysAgo(ri(18, 30) * 365),
      is_discoverable: p.discoverable,
      profile_status: isDiscoverable ? "active" : "draft",
      is_public: true,
      is_pro: true,
      created_at: p.created,
      ...(p.hasApp
        ? {
            bust_cm: ri(81, 102),
            waist_cm: ri(58, 68),
            hips_cm: ri(86, 98),
            weight_kg: ri(52, 65),
            dress_size: String(ri(2, 8)),
            shoe_size: `${ri(7, 10)} US`,
            hair_color: pick(["Brown", "Blonde", "Black", "Auburn"]),
            eye_color: pick(["Brown", "Blue", "Green", "Hazel"]),
          }
        : {}),
    };
    return row;
  });

  await knex("profiles").insert(profileRows);

  // ---- primary headshot per talent ----
  await knex("images").insert(
    profiles.map((p, i) => {
      const u = portraitUrl(i);
      return {
        id: randomUUID(),
        profile_id: p.pid,
        path: u,
        public_url: u,
        is_primary: true,
        sort: 0,
        // Must be "active": applyImageVisibility only passes NULL/'active',
        // so 'ready' left every demo submission photo-less on agency surfaces.
        status: "active",
        image_type: "headshot",
        created_at: p.created,
      };
    }),
  );

  // ---- applications (one per applying profile) ----
  const applicants = profiles.filter((p) => p.hasApp);
  // status plan: 14 submitted (4 stale, 6 today, 4 recent), 6 shortlisted, 6 booked, 5 declined, 9 accepted
  const apps = [];
  let k = 0;
  const addApp = (status, created, extra = {}) => {
    const p = applicants[k++];
    apps.push({
      id: randomUUID(),
      profile_id: p.pid,
      agency_id: aid,
      status,
      match_score: ri(72, 98),
      created_at: created,
      updated_at: created,
      ...extra,
    });
  };
  for (let i = 0; i < 14; i++)
    addApp(
      "submitted",
      i < 4
        ? daysAgo(ri(15, 21))
        : i < 10
          ? hoursAgo(ri(1, 8))
          : daysAgo(ri(1, 9)),
    );
  for (let i = 0; i < 6; i++) addApp("shortlisted", daysAgo(ri(2, 14)));
  for (let i = 0; i < 6; i++)
    addApp("represented", daysAgo(ri(5, 45)), { accepted_at: daysAgo(ri(3, 40)) });
  for (let i = 0; i < 5; i++)
    addApp("declined", daysAgo(ri(3, 30)), { declined_at: daysAgo(ri(1, 25)) });
  for (let i = 0; i < 9; i++)
    addApp("accepted", daysAgo(ri(5, 120)), {
      accepted_at: i < 3 ? daysAgo(ri(2, 12)) : daysAgo(ri(40, 300)),
    });
  await knex("applications").insert(apps);

  // Signed talent must exist on the Roster too: production signs go through
  // syncRosterMembershipForApplication, so the seed uses the same service
  // instead of leaving represented/accepted applications roster-less.
  for (const app of apps) {
    await syncRosterMembershipForApplication(knex, app, app.status);
  }

  // ---- board_applications: link review/booked + 5 accepted to boards ----
  const boardRows = BOARDS.map((b, i) => ({
    id: randomUUID(),
    agency_id: aid,
    name: b.name,
    client_name: b.client,
    description: b.description,
    closes_at: b.closes,
    target_slots: b.slots,
    is_active: true,
    sort_order: i,
    created_at: daysAgo(ri(10, 60)),
    updated_at: new Date(),
  }));
  await knex("boards").insert(boardRows);

  // Brief requirements + scoring for flagship boards (Dior + NYFW).
  const flagshipBoards = [boardRows[1], boardRows[3]];
  await knex("board_requirements").insert(
    flagshipBoards.map((board, i) => ({
      id: randomUUID(),
      board_id: board.id,
      min_age: 18,
      max_age: 28,
      min_height_cm: i === 0 ? 178 : 175,
      max_height_cm: 190,
      genders: JSON.stringify(["Female", "Male", "Non-binary"]),
      experience_levels: JSON.stringify(["New face", "Experienced", "Established"]),
      locations: JSON.stringify(["New York", "Paris", "Milan", "London"]),
      created_at: new Date(),
      updated_at: new Date(),
    })),
  );
  await knex("board_scoring_weights").insert(
    flagshipBoards.map((board) => ({
      id: randomUUID(),
      board_id: board.id,
      age_weight: 2.0,
      height_weight: 4.0,
      measurements_weight: 2.5,
      body_type_weight: 1.5,
      comfort_weight: 1.0,
      experience_weight: 3.0,
      skills_weight: 1.0,
      location_weight: 2.0,
      social_reach_weight: 0.5,
      created_at: new Date(),
      updated_at: new Date(),
    })),
  );

  const linkable = apps.filter((a) =>
    ["submitted", "shortlisted", "represented"].includes(a.status),
  );
  const accepted = apps.filter((a) => a.status === "accepted");
  const toLink = [...linkable, ...accepted.slice(0, 5)]; // leave 4 accepted idle
  const bapps = toLink.map((a) => ({
    id: randomUUID(),
    board_id: pick(boardRows).id,
    application_id: a.id,
    match_score: a.match_score,
    created_at: a.created_at,
    updated_at: a.created_at,
  }));
  await knex("board_applications").insert(bapps);

  // ---- recent activity feed ----
  const linkedBoardByApp = Object.fromEntries(
    bapps.map((ba) => [
      ba.application_id,
      boardRows.find((b) => b.id === ba.board_id),
    ]),
  );
  const ACTS = [
    { type: "submitted", desc: "submitted for review" },
    { type: "status_change", desc: "moved to Shortlisted" },
    { type: "booked", desc: "was booked" },
    { type: "accepted", desc: "was signed to the roster" },
    { type: "declined", desc: "was passed on" },
    { type: "note_added", desc: "received a new team note" },
  ];
  const actPool = [...linkable].sort(() => Math.random() - 0.5).slice(0, 14);
  const activities = actPool.map((a, i) => {
    const act = ACTS[i % ACTS.length];
    return {
      id: randomUUID(),
      application_id: a.id,
      agency_id: aid,
      user_id: aid,
      activity_type: act.type,
      description: act.desc,
      metadata: JSON.stringify({ board: linkedBoardByApp[a.id]?.name || null }),
      created_at: hoursAgo(ri(1, 44)),
    };
  });
  await knex("application_activities").insert(activities);

  // ---- demo team members (extra agency logins for this workspace) ----
  const teamUsers = TEAM.map((t) => ({ id: randomUUID(), ...t }));
  await knex("users").insert(
    teamUsers.map((t) => ({
      id: t.id,
      email: `${t.first}.${t.last}${TEAM_DOMAIN}`.toLowerCase(),
      role: "AGENCY",
      first_name: t.first,
      last_name: t.last,
      avatar_url: t.avatar || null,
      agency_name: AGENCY_NAME,
      created_at: daysAgo(ri(40, 300)),
    })),
  );
  await knex("agency_memberships").insert(
    teamUsers.map((t) => ({
      id: randomUUID(),
      agency_id: aid,
      user_id: t.id,
      membership_role: t.role,
      status: "ACTIVE",
      joined_at: daysAgo(ri(40, 300)),
      created_at: daysAgo(ri(40, 300)),
      updated_at: new Date(),
    })),
  );

  const profileUserMap = Object.fromEntries(
    profiles.map((p) => [p.pid, p.uid]),
  );

  // ---- interviews (pipeline conversations) ----
  const interviewPlan = [
    {
      app: apps[14],
      status: "pending",
      type: "video_call",
      when: daysAhead(1),
      notes: "Intro call — review portfolio and runway experience.",
    },
    {
      app: apps[15],
      status: "accepted",
      type: "video_call",
      when: daysAhead(3),
      notes: "Second round with booking director.",
      meeting_url: "https://meet.google.com/lumen-interview-2",
    },
    {
      app: apps[16],
      status: "pending",
      type: "in_person",
      when: daysAhead(5),
      location: "Lumen Studio, 450 West 14th St, New York",
      notes: "In-person casting for Dior SS26.",
    },
    {
      app: apps[0],
      status: "pending",
      type: "video_call",
      when: hoursAgo(-4),
      notes: "Follow-up on submitted application.",
      meeting_url: "https://meet.google.com/lumen-intro-1",
    },
    {
      app: apps[17],
      status: "completed",
      type: "video_call",
      when: daysAgo(4),
      notes: "Completed intro — strong editorial presence.",
    },
    {
      app: apps[18],
      status: "completed",
      type: "phone_call",
      when: daysAgo(12),
      notes: "Phone screen for commercial lookbook.",
    },
    {
      app: apps[19],
      status: "declined",
      type: "video_call",
      when: daysAgo(2),
      response_message: "Schedule conflict — unavailable that week.",
      responded_at: daysAgo(3),
    },
    {
      app: apps[20],
      status: "cancelled",
      type: "in_person",
      when: daysAgo(1),
      notes: "Client postponed casting.",
    },
    {
      app: apps[1],
      status: "accepted",
      type: "video_call",
      when: daysAhead(7),
      meeting_url: "https://meet.google.com/lumen-callback",
      notes: "Callback for Vogue Italia editorial board.",
    },
    {
      app: apps[21],
      status: "pending",
      type: "video_call",
      when: daysAhead(2),
      notes: "Booked talent check-in before campaign.",
      meeting_url: "https://meet.google.com/lumen-booking-check",
    },
  ];
  const interviews = interviewPlan.map((plan) => ({
    id: randomUUID(),
    application_id: plan.app.id,
    agency_id: aid,
    talent_id: profileUserMap[plan.app.profile_id],
    proposed_datetime: plan.when,
    duration_minutes: plan.type === "phone_call" ? 20 : 30,
    interview_type: plan.type,
    location: plan.location || null,
    meeting_url: plan.meeting_url || null,
    notes: plan.notes || null,
    status: plan.status,
    response_message: plan.response_message || null,
    responded_at: plan.responded_at || null,
    created_at: daysAgo(ri(1, 14)),
    updated_at: new Date(),
  }));
  await knex("interviews").insert(interviews);

  // ---- reminders (docket + follow-ups) ----
  const reminderPlan = [
    {
      app: apps[0],
      type: "follow_up",
      when: hoursAgo(-2),
      title: "Follow up on submission",
      priority: "high",
    },
    {
      app: apps[2],
      type: "review",
      when: hoursAgo(-6),
      title: "Review portfolio update",
      priority: "normal",
    },
    {
      app: apps[14],
      type: "interview_prep",
      when: daysAhead(1),
      title: "Prep interview brief",
      priority: "high",
    },
    {
      app: apps[15],
      type: "callback",
      when: daysAhead(2),
      title: "Send callback materials",
      priority: "normal",
    },
    {
      app: apps[20],
      type: "follow_up",
      when: daysAgo(1),
      title: "Confirm booking details",
      priority: "high",
      status: "completed",
      completed_at: hoursAgo(3),
    },
    {
      app: apps[21],
      type: "review",
      when: daysAgo(3),
      title: "Review comp card",
      priority: "low",
      status: "completed",
      completed_at: daysAgo(2),
    },
    {
      app: apps[5],
      type: "follow_up",
      when: daysAhead(3),
      title: "Check in on stale submission",
      priority: "normal",
    },
    {
      app: apps[31],
      type: "custom",
      when: daysAhead(5),
      title: "Quarterly roster check-in",
      priority: "low",
    },
  ];
  await knex("reminders").insert(
    reminderPlan.map((plan) => ({
      id: randomUUID(),
      application_id: plan.app.id,
      agency_id: aid,
      reminder_type: plan.type,
      reminder_date: plan.when,
      title: plan.title,
      notes: plan.notes || null,
      status: plan.status || "pending",
      completed_at: plan.completed_at || null,
      priority: plan.priority || "normal",
      created_at: daysAgo(ri(1, 10)),
      updated_at: new Date(),
    })),
  );

  // ---- messages (talent panel threads) ----
  const messageThreads = [
    {
      app: apps[0],
      msgs: [
        {
          from: "AGENCY",
          text: "Hi! We loved your submission for our editorial board. Are you available for a brief intro call this week?",
        },
        {
          from: "TALENT",
          text: "Thank you! Yes — I'm free Tuesday or Thursday afternoon.",
        },
        {
          from: "AGENCY",
          text: "Perfect. I'll send a calendar invite for Thursday at 2pm ET.",
        },
      ],
    },
    {
      app: apps[14],
      msgs: [
        {
          from: "AGENCY",
          text: "Congratulations on making our shortlist for Dior SS26. We'd like to schedule a callback.",
        },
        { from: "TALENT", text: "That's wonderful news — I'm available next week." },
      ],
    },
    {
      app: apps[20],
      msgs: [
        {
          from: "AGENCY",
          text: "You're confirmed for the Calvin Klein denim lookbook. Call time is 8am.",
        },
        { from: "TALENT", text: "Confirmed. I'll bring both look options we discussed." },
        { from: "AGENCY", text: "Great — see you on set.", is_read: true },
      ],
    },
    {
      app: apps[3],
      msgs: [
        {
          from: "AGENCY",
          text: "Thanks for applying. Could you share your most recent runway footage?",
        },
      ],
    },
    {
      app: apps[31],
      msgs: [
        {
          from: "AGENCY",
          text: "Welcome to the Lumen roster! Let's schedule your onboarding session.",
        },
        {
          from: "TALENT",
          text: "Excited to be signed. I'm available anytime this week.",
        },
      ],
    },
  ];
  const messages = [];
  for (const thread of messageThreads) {
    thread.msgs.forEach((msg, i) => {
      const isAgency = msg.from === "AGENCY";
      messages.push({
        id: randomUUID(),
        application_id: thread.app.id,
        sender_id: isAgency ? agency.id : profileUserMap[thread.app.profile_id],
        sender_type: msg.from,
        message: msg.text,
        is_read: msg.is_read ?? isAgency,
        created_at: new Date(now - (ri(2, 48) + i) * 3600000),
        updated_at: new Date(),
      });
    });
  }
  await knex("messages").insert(messages);

  // ---- tags + private notes ----
  const tagRows = [];
  const noteRows = [];
  const noteTexts = [
    "Strong editorial register — prioritize for luxury boards.",
    "Callback scheduled; client loved the test shots.",
    "Measurements confirmed. Ready for runway package.",
    "Consider for NYFW — tall proportions, confident walk.",
    "Re-engage if no response by Friday.",
    "Signed talent — quarterly check-in due.",
  ];
  apps.slice(0, 20).forEach((app, i) => {
    const tagCount = ri(1, 3);
    for (let t = 0; t < tagCount; t++) {
      const tag = TAG_POOL[(i + t) % TAG_POOL.length];
      tagRows.push({
        id: randomUUID(),
        application_id: app.id,
        agency_id: aid,
        tag: tag.tag,
        color: tag.color,
        created_at: daysAgo(ri(1, 30)),
      });
    }
    if (i < 6) {
      noteRows.push({
        id: randomUUID(),
        application_id: app.id,
        note: noteTexts[i % noteTexts.length],
        created_at: daysAgo(ri(1, 20)),
        updated_at: new Date(),
      });
    }
  });
  await knex("application_tags").insert(tagRows);
  await knex("application_notes").insert(noteRows);

  // ---- saved filter presets ----
  await knex("filter_presets").insert(
    FILTER_PRESETS.map((preset) => ({
      id: randomUUID(),
      agency_id: aid,
      name: preset.name,
      filters: JSON.stringify(preset.filters),
      is_default: preset.is_default,
      created_at: daysAgo(ri(10, 60)),
      updated_at: new Date(),
    })),
  );

  // ---- bell notifications ----
  const hasNotifications = await knex.schema.hasTable("notifications");
  if (hasNotifications) {
    await knex("notifications").insert([
      {
        id: randomUUID(),
        user_id: agency.id,
        type: "new_application",
        title: "3 new submissions today",
        body: "Fresh applicants are waiting in your inbox.",
        route_target: "/dashboard/agency/applicants",
        priority: "normal",
        group_key: "demo-new-apps",
        read_at: null,
        last_occurred_at: hoursAgo(2),
        created_at: hoursAgo(2),
        updated_at: hoursAgo(2),
      },
      {
        id: randomUUID(),
        user_id: agency.id,
        type: "interview_scheduled",
        title: "Interview tomorrow",
        body: "You have a video call with a shortlisted candidate.",
        route_target: "/dashboard/agency/interviews",
        priority: "high",
        group_key: "demo-interview-tomorrow",
        read_at: null,
        last_occurred_at: hoursAgo(5),
        created_at: hoursAgo(5),
        updated_at: hoursAgo(5),
      },
      {
        id: randomUUID(),
        user_id: agency.id,
        type: "message_received",
        title: "New message from talent",
        body: "A candidate replied to your outreach.",
        route_target: "/dashboard/agency/applicants",
        priority: "normal",
        group_key: "demo-message",
        read_at: daysAgo(1),
        last_occurred_at: daysAgo(1),
        created_at: daysAgo(1),
        updated_at: daysAgo(1),
      },
    ]);
  }

  // Mark a few stale submissions as viewed.
  await knex("applications")
    .whereIn(
      "id",
      apps.slice(4, 10).map((a) => a.id),
    )
    .update({ viewed_at: daysAgo(ri(1, 3)) });

  // ---- report ----
  console.log(`\nSeeded for ${AGENCY_NAME} (${aid}):`);
  console.log(
    `  talent profiles: ${profiles.length} (${applicants.length} applied, ${profiles.length - applicants.length} scoutable)`,
  );
  console.log(
    `  boards: ${boardRows.length}  ·  applications: ${apps.length}  ·  board links: ${bapps.length}  ·  activity: ${activities.length}`,
  );
  console.log(
    `  interviews: ${interviews.length}  ·  reminders: ${reminderPlan.length}  ·  messages: ${messages.length}`,
  );
  console.log(
    `  tags: ${tagRows.length}  ·  notes: ${noteRows.length}`,
  );
  console.log(
    "  statuses: 14 submitted (4 stale 15d+, ~6 today), 6 shortlisted, 6 booked, 5 declined, 9 accepted (4 idle)",
  );
}

if (require.main === module) {
  const runEmbed = process.argv.includes("--embed");
  const knex = require("knex")(require("../knexfile.js"));

  seedAgencyDemo(knex)
    .then(async () => {
      if (runEmbed) {
        const {
          backfillDiscoverEmbeddings,
        } = require("./backfill-discover-embeddings");
        await backfillDiscoverEmbeddings(knex);
      }
    })
    .then(() => knex.destroy())
    .catch((e) => {
      console.error("SEED ERROR:", e.message);
      knex.destroy();
      process.exit(1);
    });
}

module.exports = { seedAgencyDemo };
