process.env.NODE_ENV = "test";

const { v4: uuid } = require("uuid");
const knex = require("../../src/shared/db/knex");
const {
  listUserDevices,
  pruneDuplicateDeviceSessions,
  purgeExpiredSessions,
  registerSession,
  revokeOtherSessions,
  revokeSession,
} = require("../../src/shared/lib/session-registry");
const { deviceFingerprint, describeDevice } = require("../../src/shared/lib/session-device");

jest.setTimeout(60000);

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const WEEK_MS = 1000 * 60 * 60 * 24 * 7;

let userId;
let otherUserId;

// Jest runs suites in parallel against one SQLite file, so this suite must never
// touch a row it didn't create — a blanket `sessions` delete would sign out every
// other suite's fixture user mid-test.
let seeded = [];

/** Rows this suite created, and nothing else. */
const ownRows = () => knex("sessions").whereIn("sid", seeded);

beforeAll(async () => {
  await knex.migrate.latest();

  userId = uuid();
  otherUserId = uuid();
  await knex("users").insert([
    { id: userId, email: `sess-${userId}@example.com`, password_hash: "x", role: "TALENT" },
    { id: otherUserId, email: `sess-${otherUserId}@example.com`, password_hash: "x", role: "TALENT" },
  ]);
});

afterAll(async () => {
  await ownRows().del();
  await knex("users").whereIn("id", [userId, otherUserId]).del();
  await knex.destroy();
});

beforeEach(async () => {
  await ownRows().del();
  seeded = [];
});

/**
 * Write a session row the way connect-session-knex actually writes one.
 *
 * `expired` must be an ISO 8601 *string*: that is what the store's `dateAsISO`
 * produces, and comparisons against it are dialect-sensitive. Seeding a native
 * Date here would test a representation production never stores.
 */
async function seedSession({
  sid = uuid(),
  owner = userId,
  userAgent = IPHONE,
  lastSeenMinutesAgo = 0,
  expiredAt,
  withDevice = true,
} = {}) {
  const expiresAt =
    expiredAt !== undefined
      ? expiredAt
      : new Date(Date.now() + WEEK_MS - lastSeenMinutesAgo * 60000).toISOString();

  const sess = {
    cookie: { originalMaxAge: WEEK_MS },
    userId: owner,
    role: "TALENT",
  };
  if (withDevice) {
    sess.device = {
      ...describeDevice(userAgent),
      fingerprint: deviceFingerprint(userAgent),
      ip: "203.0.113.9",
      signedInAt: new Date(Date.now() - lastSeenMinutesAgo * 60000).toISOString(),
    };
  }

  await knex("sessions").insert({
    sid,
    sess: JSON.stringify(sess),
    expired: expiresAt,
  });
  seeded.push(sid);
  return sid;
}

describe("listUserDevices", () => {
  test("returns only the requesting user's sessions", async () => {
    const mine = await seedSession({ owner: userId });
    await seedSession({ owner: otherUserId, userAgent: MAC });

    const devices = await listUserDevices(knex, userId, mine);

    expect(devices).toHaveLength(1);
    expect(devices[0].id).toBe(mine);
  });

  test("excludes expired rows — they are history, not devices", async () => {
    const live = await seedSession({ userAgent: IPHONE });
    await seedSession({
      userAgent: MAC,
      expiredAt: new Date(Date.now() - 60000).toISOString(),
    });

    const devices = await listUserDevices(knex, userId, live);

    expect(devices.map((d) => d.id)).toEqual([live]);
  });

  test("reports an iPhone as a phone, not a desktop", async () => {
    const sid = await seedSession({ userAgent: IPHONE });

    const [device] = await listUserDevices(knex, userId, sid);

    expect(device.type).toBe("phone");
    expect(device.label).toBe("Safari on iOS");
    expect(device.os).toBe("iOS");
  });

  test("collapses many rows for one device into a single entry", async () => {
    // Exactly the reported symptom: one phone, dozens of orphaned rows from
    // repeated re-auth. The list must show one device.
    const current = await seedSession({ userAgent: IPHONE, lastSeenMinutesAgo: 0 });
    for (let i = 1; i <= 40; i++) {
      await seedSession({ userAgent: IPHONE, lastSeenMinutesAgo: i * 10 });
    }

    const devices = await listUserDevices(knex, userId, current);

    expect(devices).toHaveLength(1);
    expect(devices[0].id).toBe(current);
    expect(devices[0].isCurrent).toBe(true);
  });

  test("keeps genuinely distinct devices separate", async () => {
    const phone = await seedSession({ userAgent: IPHONE });
    await seedSession({ userAgent: MAC, lastSeenMinutesAgo: 30 });

    const devices = await listUserDevices(knex, userId, phone);

    expect(devices).toHaveLength(2);
    expect(devices.map((d) => d.type).sort()).toEqual(["desktop", "phone"]);
  });

  test("the current device sorts first and is flagged", async () => {
    await seedSession({ userAgent: MAC, lastSeenMinutesAgo: 5 });
    const current = await seedSession({ userAgent: IPHONE, lastSeenMinutesAgo: 90 });

    const devices = await listUserDevices(knex, userId, current);

    expect(devices[0].isCurrent).toBe(true);
    expect(devices[0].id).toBe(current);
    expect(devices.filter((d) => d.isCurrent)).toHaveLength(1);
  });

  test("derives last-active from the store's touched expiry", async () => {
    const sid = await seedSession({ lastSeenMinutesAgo: 120 });

    const [device] = await listUserDevices(knex, userId, sid);

    const minutesAgo = (Date.now() - Date.parse(device.lastSeenAt)) / 60000;
    expect(minutesAgo).toBeGreaterThan(115);
    expect(minutesAgo).toBeLessThan(125);
  });

  test("sessions predating device capture are unrecognised, not faked as desktop", async () => {
    const sid = await seedSession({ withDevice: false });

    const [device] = await listUserDevices(knex, userId, sid);

    expect(device.type).toBe("unknown");
    expect(device.label).toBe("Unrecognised device");
  });

  test("reading the list reclaims the user's expired rows", async () => {
    const live = await seedSession();
    await seedSession({ expiredAt: new Date(Date.now() - 5000).toISOString() });
    await seedSession({ expiredAt: new Date(Date.now() - 5000).toISOString() });

    await listUserDevices(knex, userId, live);

    const remaining = await ownRows().count({ n: "*" }).first();
    expect(Number(remaining.n)).toBe(1);
  });
});

describe("purgeExpiredSessions", () => {
  test("never touches another user's rows", async () => {
    await seedSession({ owner: userId, expiredAt: new Date(Date.now() - 1000).toISOString() });
    const theirs = await seedSession({
      owner: otherUserId,
      expiredAt: new Date(Date.now() - 1000).toISOString(),
    });

    await purgeExpiredSessions(knex, userId);

    const rows = await ownRows().select("sid");
    expect(rows.map((r) => r.sid)).toEqual([theirs]);
  });

  test("leaves live rows alone", async () => {
    const live = await seedSession();
    await purgeExpiredSessions(knex, userId);
    expect(await knex("sessions").where({ sid: live }).first()).toBeTruthy();
  });
});

describe("pruneDuplicateDeviceSessions", () => {
  test("keeps the current row and drops same-device leftovers", async () => {
    const keep = await seedSession({ userAgent: IPHONE });
    const stale1 = await seedSession({ userAgent: IPHONE, lastSeenMinutesAgo: 20 });
    const stale2 = await seedSession({ userAgent: IPHONE, lastSeenMinutesAgo: 40 });
    const otherDevice = await seedSession({ userAgent: MAC });

    const removed = await pruneDuplicateDeviceSessions(
      knex,
      userId,
      keep,
      deviceFingerprint(IPHONE),
    );

    expect(removed).toBe(2);
    const sids = (await ownRows().select("sid")).map((r) => r.sid).sort();
    expect(sids).toEqual([keep, otherDevice].sort());
    expect(sids).not.toContain(stale1);
    expect(sids).not.toContain(stale2);
  });

  test("does not prune another user's session on the same device", async () => {
    const keep = await seedSession({ owner: userId, userAgent: IPHONE });
    const theirs = await seedSession({ owner: otherUserId, userAgent: IPHONE });

    await pruneDuplicateDeviceSessions(knex, userId, keep, deviceFingerprint(IPHONE));

    expect(await knex("sessions").where({ sid: theirs }).first()).toBeTruthy();
  });
});

describe("registerSession", () => {
  test("re-authenticating on one device does not grow the table", async () => {
    // Simulates PholioAuthBridge re-syncing repeatedly without presenting a
    // cookie: each pass writes a new row, and each pass must collapse back to one.
    const fingerprint = deviceFingerprint(IPHONE);

    for (let i = 0; i < 25; i++) {
      const sid = await seedSession({ userAgent: IPHONE });
      await registerSession(knex, { userId, sid, fingerprint });
    }

    const rows = await ownRows().count({ n: "*" }).first();
    expect(Number(rows.n)).toBe(1);
  });

  test("a second real device still registers", async () => {
    const phone = await seedSession({ userAgent: IPHONE });
    await registerSession(knex, { userId, sid: phone, fingerprint: deviceFingerprint(IPHONE) });

    const mac = await seedSession({ userAgent: MAC });
    await registerSession(knex, { userId, sid: mac, fingerprint: deviceFingerprint(MAC) });

    const devices = await listUserDevices(knex, userId, mac);
    expect(devices).toHaveLength(2);
  });
});

describe("revokeSession", () => {
  test("revokes the caller's own session", async () => {
    const sid = await seedSession();
    await expect(revokeSession(knex, userId, sid)).resolves.toEqual({ revoked: true });
    expect(await knex("sessions").where({ sid }).first()).toBeUndefined();
  });

  test("cannot revoke another user's session, and says 'not found' rather than 'forbidden'", async () => {
    const theirs = await seedSession({ owner: otherUserId });

    await expect(revokeSession(knex, userId, theirs)).resolves.toEqual({
      revoked: false,
      notFound: true,
    });
    expect(await knex("sessions").where({ sid: theirs }).first()).toBeTruthy();
  });

  test("an unknown sid is not found", async () => {
    await expect(revokeSession(knex, userId, "no-such-sid")).resolves.toEqual({
      revoked: false,
      notFound: true,
    });
  });
});

describe("revokeOtherSessions", () => {
  test("ends every other device and keeps the caller signed in", async () => {
    const current = await seedSession({ userAgent: IPHONE });
    await seedSession({ userAgent: MAC });
    await seedSession({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    });
    const theirs = await seedSession({ owner: otherUserId });

    const result = await revokeOtherSessions(knex, userId, current);

    expect(result.revoked).toBe(2);
    const sids = (await ownRows().select("sid")).map((r) => r.sid).sort();
    expect(sids).toEqual([current, theirs].sort());
  });

  test("no other devices is a no-op, not an error", async () => {
    const current = await seedSession();
    await expect(revokeOtherSessions(knex, userId, current)).resolves.toEqual({
      revoked: 0,
    });
  });
});
