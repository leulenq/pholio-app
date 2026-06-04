// Realistic demo dataset for the agency Overview, scoped to the seed agency only.
// Re-runnable: wipes prior demo data for this agency before re-seeding.
//   node scripts/seed-agency-demo.js
"use strict";

const knex = require("knex")(require("../knexfile.js"));
const { randomUUID } = require("crypto");

const AGENCY_EMAIL = "agency@example.com";
const DEMO_DOMAIN = "@seed.pholio.studio";
const TEAM_DOMAIN = "@team.pholio.studio";
const AGENCY_NAME = "Lumen Model Management";
const AGENCY_LOCATION = "New York";

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

const TEAM = [
  { first: "Marcus", last: "Vance", role: "ADMIN" },
  { first: "Priya", last: "Anand", role: "MEMBER" },
  { first: "Theo", last: "Laurent", role: "MEMBER" },
];

const now = Date.now();
const DAY = 86400000;
const daysAgo = (d) => new Date(now - d * DAY);
const hoursAgo = (h) => new Date(now - h * 3600000);
const daysAhead = (d) => new Date(now + d * DAY);
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

const BOARDS = [
  {
    name: "Vogue Italia · Editorial",
    client: "Condé Nast",
    closes: daysAhead(0),
    slots: 6,
  },
  {
    name: "Dior SS26 Campaign",
    client: "Dior",
    closes: daysAhead(2),
    slots: 4,
  },
  {
    name: "Calvin Klein Denim",
    client: "Calvin Klein",
    closes: daysAhead(3),
    slots: 8,
  },
  {
    name: "NYFW Runway Package",
    client: "IMG Productions",
    closes: daysAhead(5),
    slots: 12,
  },
  {
    name: "Zara Commercial Lookbook",
    client: "Inditex",
    closes: daysAhead(12),
    slots: 10,
  },
  { name: "Chanel Beauty", client: "Chanel", closes: daysAhead(25), slots: 5 },
  {
    name: "Net-a-Porter E-comm",
    client: "Net-a-Porter",
    closes: daysAhead(40),
    slots: 15,
  },
  { name: "Aritzia Fall", client: "Aritzia", closes: null, slots: 9 },
];

async function main() {
  const agency = await knex("users")
    .where({ email: AGENCY_EMAIL, role: "AGENCY" })
    .first();
  if (!agency) throw new Error(`Agency user ${AGENCY_EMAIL} not found`);
  const aid = agency.id;

  // Give the workspace a real name/location for the co-brand + masthead.
  await knex("agencies").where({ id: aid }).update({
    name: AGENCY_NAME,
    location: AGENCY_LOCATION,
    updated_at: new Date(),
  });
  await knex("users")
    .where({ id: aid })
    .update({ agency_name: AGENCY_NAME, agency_location: AGENCY_LOCATION });

  // ---- wipe prior demo (this agency only) ----
  await knex("application_activities").where({ agency_id: aid }).del();
  const oldBoards = (
    await knex("boards").where({ agency_id: aid }).select("id")
  ).map((b) => b.id);
  if (oldBoards.length)
    await knex("board_applications").whereIn("board_id", oldBoards).del();
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

  await knex("profiles").insert(
    profiles.map((p, i) => ({
      id: p.pid,
      user_id: p.uid,
      slug: `${p.first}-${p.last}-${p.pid.slice(0, 6)}`.toLowerCase(),
      first_name: p.first,
      last_name: p.last,
      city: p.city,
      height_cm: ri(172, 188),
      bio_raw: "Demo talent profile.",
      bio_curated: "Demo talent profile.",
      archetype: p.archetype,
      gender: pick(["female", "male", "non-binary"]),
      date_of_birth: daysAgo(ri(18, 30) * 365),
      is_discoverable: p.discoverable,
      is_public: true,
      created_at: p.created,
    })),
  );

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
        status: "ready",
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
    addApp("booked", daysAgo(ri(5, 45)), { accepted_at: daysAgo(ri(3, 40)) });
  for (let i = 0; i < 5; i++)
    addApp("declined", daysAgo(ri(3, 30)), { declined_at: daysAgo(ri(1, 25)) });
  for (let i = 0; i < 9; i++)
    addApp("accepted", daysAgo(ri(5, 120)), {
      accepted_at: i < 3 ? daysAgo(ri(2, 12)) : daysAgo(ri(40, 300)),
    });
  await knex("applications").insert(apps);

  // ---- board_applications: link review/booked + 5 accepted to boards ----
  const boardRows = BOARDS.map((b, i) => ({
    id: randomUUID(),
    agency_id: aid,
    name: b.name,
    client_name: b.client,
    closes_at: b.closes,
    target_slots: b.slots,
    is_active: true,
    sort_order: i,
    created_at: daysAgo(ri(10, 60)),
    updated_at: new Date(),
  }));
  await knex("boards").insert(boardRows);

  const linkable = apps.filter((a) =>
    ["submitted", "shortlisted", "booked"].includes(a.status),
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

  // ---- report ----
  console.log(`\nSeeded for ${AGENCY_NAME} (${aid}):`);
  console.log(
    `  talent profiles: ${profiles.length} (${applicants.length} applied, ${profiles.length - applicants.length} scoutable)`,
  );
  console.log(
    `  boards: ${boardRows.length}  ·  applications: ${apps.length}  ·  board links: ${bapps.length}  ·  activity: ${activities.length}`,
  );
  console.log(
    "  statuses: 14 submitted (4 stale 15d+, ~6 today), 6 shortlisted, 6 booked, 5 declined, 9 accepted (4 idle)",
  );
}

main()
  .then(() => knex.destroy())
  .catch((e) => {
    console.error("SEED ERROR:", e.message);
    knex.destroy();
    process.exit(1);
  });
