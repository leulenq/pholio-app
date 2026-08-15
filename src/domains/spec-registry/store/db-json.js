"use strict";

function isPostgres(db) {
  const client = String(db.client.config.client || "").toLowerCase();
  return client === "pg" || client === "postgresql";
}

function jsonForDb(db, value) {
  return isPostgres(db) ? value : JSON.stringify(value);
}

function parseJsonColumn(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

module.exports = {
  isPostgres,
  jsonForDb,
  parseJsonColumn,
};
