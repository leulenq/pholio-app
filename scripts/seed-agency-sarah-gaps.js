/**
 * Additive populate for Sarah Chen / Lumen Model Management.
 *
 * Fills newer agency surfaces that classic demo data never touched:
 *   - roster_memberships  (Roster)
 *   - talent_commitments  (Calendar / Booking Desk)
 *   - agency_open_call_links
 *   - agency_setup_steps (completed)
 *
 * Re-runnable: wipes only these gap tables for the agency, then re-seeds.
 * Does not touch applications, boards, interviews, messages, etc.
 *
 *   node scripts/seed-agency-sarah-gaps.js
 */
"use strict";

const { randomUUID } = require("crypto");
const knex = require("../src/shared/db/knex");
const {
  generateOpenCallCode,
} = require("../src/domains/talent/services/open-call-claims");

const AGENCY_EMAIL = "agency@example.com";
const REQUIRED_SETUP_STEPS = [
  "profile",
  "boards",
  "team",
  "roster",
  "open_call",
  "defaults",
  "privacy",
];

const DAY = 86400000;
const isoDate = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => new Date(Date.now() + n * DAY);

async function main() {
  const user = await knex("users").where({ email: AGENCY_EMAIL }).first();
  if (!user) {
    throw new Error(`No user for ${AGENCY_EMAIL}. Run base seed first.`);
  }

  const membership = await knex("agency_memberships")
    .where({ user_id: user.id, status: "ACTIVE" })
    .first();
  const agencyId = membership?.agency_id || user.id;
  const agency = await knex("agencies").where({ id: agencyId }).first();
  if (!agency) {
    throw new Error(`No agency row for ${agencyId}`);
  }

  console.log(`Agency: ${agency.name} (${agencyId})`);
  console.log(`Owner:  ${user.first_name} ${user.last_name} <${user.email}>`);

  // ── Wipe only gap tables for this agency ──────────────────────────────
  await knex("talent_commitments").where({ agency_id: agencyId }).del();
  await knex("roster_memberships").where({ agency_id: agencyId }).del();
  await knex("agency_open_call_links").where({ agency_id: agencyId }).del();
  await knex("agency_setup_steps").where({ agency_id: agencyId }).del();

  // ── Division boards (Women / Men / Runway / Development) if missing ───
  const openBoards = Array.isArray(agency.open_boards)
    ? agency.open_boards
    : ["Women", "Men", "Runway", "Development"];
  const existingBoards = await knex("boards")
    .where({ agency_id: agencyId })
    .select("id", "name");
  const byName = new Map(existingBoards.map((b) => [b.name, b.id]));
  const divisionBoardIds = [];

  for (const name of openBoards) {
    if (byName.has(name)) {
      divisionBoardIds.push(byName.get(name));
      continue;
    }
    const id = randomUUID();
    await knex("boards").insert({
      id,
      agency_id: agencyId,
      name,
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    byName.set(name, id);
    divisionBoardIds.push(id);
    console.log(`  + division board: ${name}`);
  }

  // ── Roster from accepted / represented applications ───────────────────
  const signed = await knex("applications as a")
    .where({ "a.agency_id": agencyId })
    .whereIn("a.status", ["accepted", "represented", "booked"])
    .select(
      "a.id as application_id",
      "a.profile_id",
      "a.status",
      "a.accepted_at",
      "a.created_at",
    )
    .orderBy("a.created_at", "asc");

  // Prefer casting-board link when present; else rotate division boards.
  const boardLinks = await knex("board_applications as ba")
    .join("boards as b", "b.id", "ba.board_id")
    .where("b.agency_id", agencyId)
    .whereIn(
      "ba.application_id",
      signed.map((s) => s.application_id),
    )
    .select("ba.application_id", "ba.board_id");
  const boardByApp = new Map(
    boardLinks.map((r) => [r.application_id, r.board_id]),
  );

  const stages = ["main", "main", "main", "development", "new_face"];
  const rosterRows = [];
  const now = new Date();

  for (let i = 0; i < signed.length; i++) {
    const app = signed[i];
    const stage = stages[i % stages.length];
    // Represented → main division; accepted new faces → development/new_face boards.
    let boardId =
      boardByApp.get(app.application_id) ||
      divisionBoardIds[i % divisionBoardIds.length];
    if (stage === "development" && byName.has("Development")) {
      boardId = byName.get("Development");
    } else if (stage === "new_face" && byName.has("Women")) {
      boardId = byName.get(i % 2 === 0 ? "Women" : "Men");
    } else if (app.status === "represented" && byName.has("Women")) {
      // Keep casting board if linked; otherwise Women/Men by index.
      if (!boardByApp.has(app.application_id)) {
        boardId = byName.get(i % 2 === 0 ? "Women" : "Men");
      }
    }

    const joinedAt = app.accepted_at || app.created_at || now;
    const id = randomUUID();
    rosterRows.push({
      id,
      agency_id: agencyId,
      profile_id: app.profile_id,
      talent_record_id: null,
      board_id: boardId,
      stage,
      status: "active",
      source_application_id: app.application_id,
      joined_at: joinedAt,
      left_at: null,
      notes: null,
      created_at: joinedAt,
      updated_at: now,
      created_by_user_id: user.id,
    });
  }

  if (rosterRows.length) {
    await knex("roster_memberships").insert(rosterRows);
  }
  console.log(`  roster_memberships: ${rosterRows.length}`);

  // ── Calendar commitments over the next ~2 weeks ───────────────────────
  const commitmentSpecs = [
    { kind: "booked", offset: 0, days: 2, market: "New York", client: "Dior SS26", notes: "Campaign fitting + shoot" },
    { kind: "booked", offset: 3, days: 1, market: "New York", client: "Calvin Klein", notes: "Denim e-comm" },
    { kind: "hold", offset: 5, days: 3, market: "Paris", client: "Chanel Beauty", notes: "First hold — beauty day" },
    { kind: "option", offset: 1, days: 4, market: "Milan", client: "Vogue Italia", notes: "1st option editorial", optionTier: 1 },
    { kind: "option", offset: 7, days: 5, market: "New York", client: "NYFW Package", notes: "2nd option runway", optionTier: 2 },
    { kind: "booked", offset: 10, days: 2, market: "Los Angeles", client: "Aritzia Fall", notes: "Lookbook day" },
    { kind: "hold", offset: 12, days: 2, market: "New York", client: "Net-a-Porter", notes: "E-comm hold" },
    { kind: "option", offset: 4, days: 2, market: "London", client: "Zara Lookbook", notes: "3rd option commercial", optionTier: 3 },
  ];

  const commitmentRows = [];
  for (let i = 0; i < Math.min(commitmentSpecs.length, rosterRows.length); i++) {
    const spec = commitmentSpecs[i];
    const membership = rosterRows[i];
    const start = daysFromNow(spec.offset);
    const end = daysFromNow(spec.offset + Math.max(0, spec.days - 1));
    commitmentRows.push({
      id: randomUUID(),
      profile_id: membership.profile_id,
      agency_id: agencyId,
      roster_membership_id: membership.id,
      talent_record_id: null,
      kind: spec.kind,
      option_tier: spec.kind === "option" ? spec.optionTier || 1 : null,
      start_date: isoDate(start),
      end_date: isoDate(end),
      market: spec.market,
      client_ref: spec.client,
      category: null,
      exclusivity: false,
      exclusivity_until: null,
      usage: null,
      notes: spec.notes,
      status: "active",
      created_by_user_id: user.id,
      updated_by_user_id: user.id,
      confirmed_at: spec.kind === "booked" ? now : null,
      confirmed_by_user_id: spec.kind === "booked" ? user.id : null,
      created_at: now,
      updated_at: now,
    });
  }

  if (commitmentRows.length) {
    await knex("talent_commitments").insert(commitmentRows);
  }
  console.log(`  talent_commitments: ${commitmentRows.length}`);

  // ── Open call links ───────────────────────────────────────────────────
  // knex/pg turns JS arrays into Postgres array literals; jsonb needs a
  // JSON string cast so UUID lists stay JSON arrays.
  const isPg =
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql";
  const jsonb = (value) =>
    isPg
      ? knex.raw("?::jsonb", [JSON.stringify(value)])
      : JSON.stringify(value);

  const womenId = byName.get("Women") || divisionBoardIds[0] || existingBoards[0]?.id;
  const menId = byName.get("Men") || divisionBoardIds[1] || existingBoards[1]?.id;
  const openCallRows = [
    {
      id: randomUUID(),
      agency_id: agencyId,
      code: generateOpenCallCode(),
      label: "General open call — Women",
      status: "active",
      created_by_user_id: user.id,
      created_at: now,
      updated_at: now,
      revoked_at: null,
      default_roster_board_id: womenId || null,
      receiving_board_ids: womenId ? jsonb([womenId]) : null,
      instructions_by_board: null,
      accepts_minors: false,
      guardian_consent_required: true,
      notification_recipient_membership_ids: membership?.id
        ? jsonb([membership.id])
        : null,
    },
    {
      id: randomUUID(),
      agency_id: agencyId,
      code: generateOpenCallCode(),
      label: "Scout referral — Men & Runway",
      status: "active",
      created_by_user_id: user.id,
      created_at: now,
      updated_at: now,
      revoked_at: null,
      default_roster_board_id: menId || null,
      receiving_board_ids: jsonb(
        [menId, byName.get("Runway")].filter(Boolean),
      ),
      instructions_by_board: null,
      accepts_minors: false,
      guardian_consent_required: true,
      notification_recipient_membership_ids: membership?.id
        ? jsonb([membership.id])
        : null,
    },
  ];

  await knex("agency_open_call_links").insert(openCallRows);
  console.log(`  agency_open_call_links: ${openCallRows.length}`);

  // ── Setup steps complete ──────────────────────────────────────────────
  const setupRows = REQUIRED_SETUP_STEPS.map((step_key) => ({
    id: randomUUID(),
    agency_id: agencyId,
    step_key,
    status: "complete",
    completed_by_user_id: user.id,
    completed_at: now,
    data: jsonb({}),
    created_at: now,
    updated_at: now,
  }));
  await knex("agency_setup_steps").insert(setupRows);

  if (!agency.onboarding_completed_at) {
    await knex("agencies").where({ id: agencyId }).update({
      onboarding_completed_at: now,
      onboarding_completed_by_user_id: user.id,
    });
  }
  console.log(`  agency_setup_steps: ${setupRows.length} (all complete)`);

  console.log("\nDone. Refresh Roster, Calendar, Setup, and Open Call settings.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await knex.destroy();
  });
