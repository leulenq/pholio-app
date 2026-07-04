"use strict";

const { v4: uuidv4 } = require("uuid");

/**
 * Materialize historical talent-selected divisions in the relational board
 * model consumed by the agency boards UI.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const requiredTables = [
    "applications",
    "application_submission_boards",
    "boards",
    "board_applications",
  ];
  for (const tableName of requiredTables) {
    if (!(await knex.schema.hasTable(tableName))) return;
  }

  const selections = await knex("application_submission_boards as selected")
    .join(
      "applications as application",
      "application.id",
      "selected.application_id",
    )
    .whereColumn("application.agency_id", "selected.agency_id")
    .select(
      "selected.application_id",
      "selected.agency_id",
      "selected.board_name",
    )
    .orderBy("selected.created_at", "asc");
  const boardsByAgency = new Map();

  for (const selection of selections) {
    const boardName = String(selection.board_name || "").trim();
    const key = boardNameKey(boardName);
    if (!key) continue;

    let boardsByName = boardsByAgency.get(selection.agency_id);
    if (!boardsByName) {
      const activeBoards = await knex("boards")
        .where({ agency_id: selection.agency_id, is_active: true })
        .select("id", "name")
        .orderBy("created_at", "asc")
        .orderBy("id", "asc");
      boardsByName = new Map();
      for (const board of activeBoards) {
        const existingKey = boardNameKey(board.name);
        if (existingKey && !boardsByName.has(existingKey)) {
          boardsByName.set(existingKey, board);
        }
      }
      boardsByAgency.set(selection.agency_id, boardsByName);
    }

    let board = boardsByName.get(key);
    if (!board) {
      board = { id: uuidv4(), name: boardName };
      await knex("boards").insert({
        id: board.id,
        agency_id: selection.agency_id,
        name: board.name,
        is_active: true,
        sort_order: 0,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
      boardsByName.set(key, board);
    }

    const existingAssignment = await knex("board_applications")
      .where({
        board_id: board.id,
        application_id: selection.application_id,
      })
      .first("id");
    if (!existingAssignment) {
      await knex("board_applications").insert({
        id: uuidv4(),
        board_id: board.id,
        application_id: selection.application_id,
        match_score: null,
        match_details: null,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }
  }
};

// Backfilled rows are retained because they are indistinguishable from valid
// assignments written by application submission after this migration runs.
exports.down = async function down() {};

function boardNameKey(value) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}
