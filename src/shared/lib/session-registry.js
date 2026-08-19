/**
 * Signed-in session registry.
 *
 * Backs the talent settings "signed-in devices" list. It exists because the
 * previous implementation could not be trusted:
 *
 *  - it `SELECT`ed *every* session row in the database and filtered in JS;
 *  - it listed expired rows as if they were live devices, so the panel was a
 *    history log rather than a set of active sessions;
 *  - in serverless the store's own sweeper is disabled (`cleanupInterval = 0` in
 *    `src/app.js`), so expired rows are never reclaimed and pile up forever;
 *  - `POST /login` calls `req.session.regenerate()`, which destroys only the
 *    *current* sid. When the browser doesn't present its cookie (iOS Safari
 *    across `.pholio.studio` subdomains is the common case) the current session
 *    is a fresh empty one, so the previously authenticated row is orphaned and a
 *    new one is written. `PholioAuthBridge` re-checks on every focus and
 *    visibility change, so a single phone could mint hundreds of rows.
 *
 * The fix is a device-scoped registry: one live row per device per user, expired
 * rows reclaimed on the paths that touch them, and every field rendered from
 * recorded data instead of a literal.
 */

const { describeDevice, deviceFingerprint } = require("./session-device");

const SESSIONS_TABLE = "sessions";
const DEFAULT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function parseSess(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function sessionsTableExists(knex) {
  return knex.schema.hasTable(SESSIONS_TABLE);
}

function isPostgres(knex) {
  const client = knex.client?.config?.client;
  return client === "pg" || client === "postgresql";
}

function isSqlite(knex) {
  const client = knex.client?.config?.client;
  return client === "sqlite3" || client === "better-sqlite3";
}

/**
 * Expiry comparisons have to use the same semantics `connect-session-knex` uses
 * when it writes the column, because it stores `expired` as an ISO 8601 *string*
 * (`dateAsISO` → `date.toISOString()`), not as a native date.
 *
 * On SQLite that means a plain `where("expired", ">", someDate)` compares a
 * knex-serialised integer against ISO text and silently matches nothing — so the
 * device list would come back empty and the expiry purge would delete nothing.
 * Mirror the store's own `expiredCondition` instead of inventing a comparison.
 *
 * @param {import('knex')} knex
 * @param {"live"|"expired"} which
 * @returns {{sql: string, binding: string}}
 */
function expiryCondition(knex, which) {
  const binding = new Date().toISOString();

  if (isSqlite(knex)) {
    return {
      sql:
        which === "live"
          ? "datetime(expired) > datetime(?)"
          : "datetime(expired) <= datetime(?)",
      binding,
    };
  }

  if (isPostgres(knex)) {
    return {
      sql:
        which === "live"
          ? "expired > CAST(? as timestamp with time zone)"
          : "expired <= CAST(? as timestamp with time zone)",
      binding,
    };
  }

  return {
    sql: which === "live" ? "expired > ?" : "expired <= ?",
    binding,
  };
}

/**
 * Narrow to this user's rows in SQL where the dialect can read into the session
 * JSON. Returns null when it can't, so the caller falls back to filtering in JS
 * over the (already expiry-filtered) candidate set rather than failing.
 */
function applyUserIdFilter(query, knex, userId) {
  try {
    if (isPostgres(knex)) {
      return query.whereRaw("sess::jsonb->>'userId' = ?", [userId]);
    }
    return query.whereRaw("json_extract(sess, '$.userId') = ?", [userId]);
  } catch {
    return null;
  }
}

/**
 * Live rows belonging to one user. Expired rows are excluded in SQL — they are
 * not devices, and including them is what made the panel look like it had
 * hundreds of entries.
 */
async function selectUserSessionRows(knex, userId) {
  const live = expiryCondition(knex, "live");

  const build = () =>
    knex(SESSIONS_TABLE)
      .select("sid", "sess", "expired")
      .where((builder) =>
        builder.whereRaw(live.sql, [live.binding]).orWhereNull("expired"),
      );

  let rows;
  const filtered = applyUserIdFilter(build(), knex, userId);
  if (filtered) {
    try {
      rows = await filtered;
    } catch {
      rows = null;
    }
  }
  if (!rows) rows = await build();

  return rows
    .map((row) => ({ ...row, parsed: parseSess(row.sess) }))
    .filter((row) => row.parsed && row.parsed.userId === userId);
}

/**
 * The store touches `expired` forward on each request, so `expired - maxAge` is
 * when the session was last actually used. Derived rather than written on every
 * request so tracking activity costs no extra writes.
 */
function deriveLastSeenAt(row) {
  if (!row.expired) return null;
  const expiresAt = new Date(row.expired);
  if (Number.isNaN(expiresAt.getTime())) return null;

  const maxAge = Number(row.parsed?.cookie?.originalMaxAge) || DEFAULT_MAX_AGE_MS;
  return new Date(expiresAt.getTime() - maxAge);
}

/**
 * Reclaim this user's expired rows. Necessary because the store's background
 * sweeper is switched off in serverless, so without this the table only ever
 * grows.
 *
 * @returns {Promise<number>} rows removed
 */
async function purgeExpiredSessions(knex, userId) {
  if (!(await sessionsTableExists(knex))) return 0;

  const stale = expiryCondition(knex, "expired");
  const build = () => knex(SESSIONS_TABLE).whereRaw(stale.sql, [stale.binding]);

  const filtered = applyUserIdFilter(build(), knex, userId);
  if (filtered) {
    try {
      return await filtered.del();
    } catch {
      /* fall through to the scoped JS path */
    }
  }

  // No JSON support: only delete rows we've positively identified as this
  // user's, never a blanket delete of everyone's expired rows.
  const rows = await knex(SESSIONS_TABLE)
    .select("sid", "sess")
    .whereRaw(stale.sql, [stale.binding]);
  const sids = rows
    .filter((row) => parseSess(row.sess)?.userId === userId)
    .map((row) => row.sid);
  if (!sids.length) return 0;
  return knex(SESSIONS_TABLE).whereIn("sid", sids).del();
}

/**
 * Collapse a user's sessions onto one row per device.
 *
 * Called right after a session is established. Any other live row for the same
 * user on the same device is a leftover from a re-auth that couldn't present its
 * cookie, and keeping it would show the talent a "device" they cannot recognise
 * and cannot meaningfully end.
 *
 * @param {import('knex')} knex
 * @param {string} userId
 * @param {string} keepSid   the session id to preserve (the current one)
 * @param {string} fingerprint
 * @returns {Promise<number>} rows removed
 */
async function pruneDuplicateDeviceSessions(knex, userId, keepSid, fingerprint) {
  if (!userId || !keepSid || !fingerprint) return 0;
  if (!(await sessionsTableExists(knex))) return 0;

  const rows = await selectUserSessionRows(knex, userId);
  const stale = rows
    .filter(
      (row) => row.sid !== keepSid && row.parsed?.device?.fingerprint === fingerprint,
    )
    .map((row) => row.sid);

  if (!stale.length) return 0;
  return knex(SESSIONS_TABLE).whereIn("sid", stale).del();
}

/**
 * Housekeeping for a freshly established session: reclaim expired rows and drop
 * duplicates for this device. Failures are logged and swallowed — a signed-in
 * user must never be blocked from reaching the app by session bookkeeping.
 *
 * @param {import('knex')} knex
 * @param {{userId: string, sid: string, fingerprint: string}} params
 */
async function registerSession(knex, { userId, sid, fingerprint }) {
  try {
    await purgeExpiredSessions(knex, userId);
    await pruneDuplicateDeviceSessions(knex, userId, sid, fingerprint);
  } catch (error) {
    console.warn("[SessionRegistry] Housekeeping failed:", error?.message);
  }
}

/**
 * The devices to show in settings: live sessions only, one per device, described
 * from what was actually recorded.
 *
 * @param {import('knex')} knex
 * @param {string} userId
 * @param {string|null} currentSid
 */
async function listUserDevices(knex, userId, currentSid = null) {
  if (!(await sessionsTableExists(knex))) return [];

  await purgeExpiredSessions(knex, userId).catch(() => {});

  const rows = await selectUserSessionRows(knex, userId);

  const devices = rows.map((row) => {
    const recorded = row.parsed?.device || null;
    // Sessions created before device capture existed have nothing recorded.
    // They are reported as unrecognised rather than dressed up as a desktop.
    const described = recorded
      ? {
          type: recorded.type || "unknown",
          label: recorded.label || describeDevice(null).label,
          browser: recorded.browser || null,
          os: recorded.os || null,
        }
      : describeDevice(null);

    const lastSeenAt = deriveLastSeenAt(row);

    return {
      id: row.sid,
      type: described.type,
      label: described.label,
      browser: described.browser,
      os: described.os,
      fingerprint: recorded?.fingerprint || null,
      signedInAt: recorded?.signedInAt || null,
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
      expiresAt: row.expired ? new Date(row.expired).toISOString() : null,
      isCurrent: currentSid ? row.sid === currentSid : false,
    };
  });

  // One entry per device. Historic rows may still collide on a fingerprint (they
  // predate pruning), so keep the most recently used and always keep the row the
  // caller is currently using.
  const byFingerprint = new Map();
  const collapsed = [];
  for (const device of devices) {
    if (!device.fingerprint) {
      collapsed.push(device);
      continue;
    }
    const existing = byFingerprint.get(device.fingerprint);
    if (!existing) {
      byFingerprint.set(device.fingerprint, device);
      continue;
    }
    const keepIncoming =
      device.isCurrent ||
      (!existing.isCurrent &&
        String(device.lastSeenAt || "") > String(existing.lastSeenAt || ""));
    if (keepIncoming) byFingerprint.set(device.fingerprint, device);
  }

  return [...byFingerprint.values(), ...collapsed].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""));
  });
}

/**
 * Revoke a single session, scoped to its owner so one user can never end
 * another's session.
 *
 * @returns {Promise<{revoked: boolean, notFound?: boolean}>}
 */
async function revokeSession(knex, userId, sid) {
  if (!(await sessionsTableExists(knex))) return { revoked: false };

  const row = await knex(SESSIONS_TABLE).where({ sid }).first();
  if (!row) return { revoked: false, notFound: true };

  const parsed = parseSess(row.sess);
  if (!parsed || parsed.userId !== userId) {
    // Deliberately indistinguishable from a missing session: confirming that a
    // sid exists but belongs to someone else is an information leak.
    return { revoked: false, notFound: true };
  }

  await knex(SESSIONS_TABLE).where({ sid }).del();
  return { revoked: true };
}

/**
 * End every session for this user except the one making the request.
 *
 * @returns {Promise<{revoked: number}>}
 */
async function revokeOtherSessions(knex, userId, currentSid) {
  if (!(await sessionsTableExists(knex))) return { revoked: 0 };

  const rows = await selectUserSessionRows(knex, userId);
  const sids = rows.map((row) => row.sid).filter((sid) => sid !== currentSid);
  if (!sids.length) return { revoked: 0 };

  const revoked = await knex(SESSIONS_TABLE).whereIn("sid", sids).del();
  return { revoked };
}

/**
 * End every live session for a user. Provider deauthorization has no caller
 * session to preserve, unlike the settings action above.
 *
 * @returns {Promise<{revoked: number}>}
 */
async function revokeAllSessions(knex, userId) {
  if (!(await sessionsTableExists(knex))) return { revoked: 0 };

  const rows = await selectUserSessionRows(knex, userId);
  const sids = rows.map((row) => row.sid);
  if (!sids.length) return { revoked: 0 };

  const revoked = await knex(SESSIONS_TABLE).whereIn("sid", sids).del();
  return { revoked };
}

module.exports = {
  SESSIONS_TABLE,
  deriveLastSeenAt,
  deviceFingerprint,
  listUserDevices,
  pruneDuplicateDeviceSessions,
  purgeExpiredSessions,
  registerSession,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSession,
};
