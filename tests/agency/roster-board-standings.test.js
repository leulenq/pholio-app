"use strict";

const { v4: uuidv4 } = require("uuid");
const knex = require("../../src/shared/db/knex");

/**
 * Data invariants for roster_board_standings — the table that lets a talent
 * sit on more than one board.
 *
 * These are the guarantees the API relies on. The PUT handler validates the
 * same things in application code, but a constraint that only exists in a
 * request handler is one direct DB write away from being violated, and roster
 * data is the agency's record of who they represent.
 */
describe("roster_board_standings invariants", () => {
  let agencyId;
  let membershipId;
  let boardA;
  let boardB;
  let talentRecordId;

  beforeAll(async () => {
    await knex.migrate.latest();
    // Foreign keys are off by default in SQLite; the cascade test needs them.
    if (knex.client.config.client.includes("sqlite")) {
      await knex.raw("PRAGMA foreign_keys = ON");
    }

    agencyId = uuidv4();
    await knex("agencies").insert({ id: agencyId, name: "Test Agency" });

    boardA = uuidv4();
    boardB = uuidv4();
    await knex("boards").insert([
      { id: boardA, agency_id: agencyId, name: "Women" },
      { id: boardB, agency_id: agencyId, name: "Editorial" },
    ]);

    /* A membership needs a subject: either a platform profile or an
       agency-private talent record. The schema enforces it. */
    talentRecordId = uuidv4();
    await knex("talent_records").insert({
      id: talentRecordId,
      agency_id: agencyId,
      first_name: "Ana",
      last_name: "Beloussova",
    });

    membershipId = uuidv4();
    await knex("roster_memberships").insert({
      id: membershipId,
      agency_id: agencyId,
      talent_record_id: talentRecordId,
      board_id: boardA,
      stage: "main",
      status: "active",
    });
  });

  afterEach(async () => {
    await knex("roster_board_standings").where({ membership_id: membershipId }).del();
  });

  afterAll(async () => {
    await knex.destroy();
  });

  const insert = (overrides = {}) =>
    knex("roster_board_standings").insert({
      id: uuidv4(),
      membership_id: membershipId,
      board_id: boardA,
      standing: "represented",
      is_primary: true,
      ...overrides,
    });

  it("lets one talent sit on several boards at once", async () => {
    await insert({ board_id: boardA, standing: "represented", is_primary: true });
    await insert({ board_id: boardB, standing: "shortlisted", is_primary: false });

    const rows = await knex("roster_board_standings")
      .where({ membership_id: membershipId })
      .orderBy("standing");

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.standing).sort()).toEqual(["represented", "shortlisted"]);
  });

  it("rejects the same board twice for one membership", async () => {
    await insert({ board_id: boardA });
    await expect(insert({ board_id: boardA, standing: "active" })).rejects.toThrow();
  });

  it("rejects a standing outside the vocabulary", async () => {
    // Guards against a client sending a status from a different lifecycle —
    // e.g. an availability value like "on_booking" — into the standing column.
    await expect(insert({ standing: "on_booking" })).rejects.toThrow();
    await expect(insert({ standing: "totally_made_up" })).rejects.toThrow();
  });

  it("accepts every standing the UI can produce", async () => {
    const vocabulary = [
      "represented",
      "active",
      "developing",
      "shortlisted",
      "onfile",
      "inactive",
      "ended",
      "passed",
      "unknown",
    ];
    for (const standing of vocabulary) {
      // eslint-disable-next-line no-await-in-loop
      await knex("roster_board_standings").insert({
        id: uuidv4(),
        membership_id: membershipId,
        board_id: boardA,
        standing,
        is_primary: false,
      });
      // eslint-disable-next-line no-await-in-loop
      await knex("roster_board_standings").where({ membership_id: membershipId }).del();
    }
    expect(true).toBe(true);
  });

  it("defaults an unspecified standing to unknown, never to a positive claim", async () => {
    await knex("roster_board_standings").insert({
      id: uuidv4(),
      membership_id: membershipId,
      board_id: boardA,
    });
    const row = await knex("roster_board_standings")
      .where({ membership_id: membershipId })
      .first();
    expect(row.standing).toBe("unknown");
  });

  it("removes standings when the membership is deleted", async () => {
    /* roster_memberships is UNIQUE on (agency_id, talent_record_id) — one
       membership per talent per agency. That constraint is exactly why
       multi-board representation needs a join table rather than more
       membership rows. This scratch row therefore needs its own talent. */
    const scratchTalent = uuidv4();
    await knex("talent_records").insert({
      id: scratchTalent,
      agency_id: agencyId,
      first_name: "Scratch",
      last_name: "Record",
    });

    const scratchMembership = uuidv4();
    await knex("roster_memberships").insert({
      id: scratchMembership,
      agency_id: agencyId,
      talent_record_id: scratchTalent,
      board_id: boardA,
      stage: "main",
      status: "active",
    });
    await knex("roster_board_standings").insert({
      id: uuidv4(),
      membership_id: scratchMembership,
      board_id: boardB,
      standing: "active",
    });

    await knex("roster_memberships").where({ id: scratchMembership }).del();

    const orphans = await knex("roster_board_standings").where({
      membership_id: scratchMembership,
    });
    expect(orphans).toHaveLength(0);
  });
});
