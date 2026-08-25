"use strict";

/**
 * Production-readiness audit finding #3
 * (src/shared/services/agency-notifications.js: notifyAgencyEventSlotResponse).
 *
 * The slot-response email fan-out used to be
 * `Promise.all(recipients.map(send))` — every member of an agency emailed at
 * once through the same unpooled SMTP transport. Resend rate-limits at
 * roughly 2 requests/second, so a large agency roster trips it. The fix caps
 * how many sends are in flight together; this test proves the bound holds
 * for a roster large enough to have tripped the old behaviour, and that
 * every member still gets attempted (bounding concurrency must not drop
 * anyone), and that one member's failed send does not stop the others.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("agency-notifications-email-fanout");

const { v4: uuidv4 } = require("uuid");

// jest.mock's factory may only close over variables prefixed `mock` (its
// hoisting guard against uninitialized-variable bugs) — so the shared
// counters live on a `mockState` object instead of bare module-scope lets.
const mockState = { inFlight: 0, maxInFlight: 0, attempted: [] };

jest.mock("../../src/shared/lib/email", () => ({
  ...jest.requireActual("../../src/shared/lib/email"),
  sendEventSlotConfirmedEmail: jest.fn(async ({ to }) => {
    mockState.inFlight += 1;
    mockState.maxInFlight = Math.max(mockState.maxInFlight, mockState.inFlight);
    mockState.attempted.push(to);
    try {
      // Simulate real network latency so overlapping calls are observable —
      // a synchronous mock would never actually overlap even with no bound.
      await new Promise((resolve) => setTimeout(resolve, 25));
      // Every 3rd recipient's send fails, to prove one failure doesn't stall
      // or drop the rest of the pool.
      if (mockState.attempted.length % 3 === 0) {
        throw new Error("simulated Resend 429");
      }
      return { messageId: "evt-" + to };
    } finally {
      mockState.inFlight -= 1;
    }
  }),
  sendEventSlotDeclinedEmail: jest.fn(async () => ({ messageId: "evt-decline" })),
}));

const knex = require("../../src/shared/db/knex");
const {
  sendEventSlotConfirmedEmail,
} = require("../../src/shared/lib/email");
const {
  notifyAgencyEventSlotResponse,
} = require("../../src/shared/services/agency-notifications");

const AGENCY_ID = uuidv4();
const APPLICATION_ID = uuidv4();
const MEMBER_COUNT = 7;
const memberUserIds = Array.from({ length: MEMBER_COUNT }, () => uuidv4());

beforeAll(async () => {
  await migrate(knex);

  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Bound & Fanout Casting",
    status: "ACTIVE",
  });

  await knex("users").insert(
    memberUserIds.map((id, i) => ({
      id,
      email: `fanout-member-${i}-${id}@example.com`,
      password_hash: "x",
      role: "AGENCY",
      first_name: `Member${i}`,
    })),
  );

  await knex("agency_memberships").insert(
    memberUserIds.map((userId, i) => ({
      id: uuidv4(),
      agency_id: AGENCY_ID,
      user_id: userId,
      membership_role: i === 0 ? "OWNER" : "MEMBER",
      status: "ACTIVE",
    })),
  );
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

test("never exceeds a small bounded concurrency, still reaches every member, and survives per-recipient failures", async () => {
  const ids = await notifyAgencyEventSlotResponse({
    agencyId: AGENCY_ID,
    applicationId: APPLICATION_ID,
    talentName: "Priya Chandrasekaran",
    eventName: "Fall Casting Call",
    confirmed: true,
  });

  // In-app notification writes are unaffected by the email fan-out change.
  expect(ids).toHaveLength(MEMBER_COUNT);

  expect(sendEventSlotConfirmedEmail).toHaveBeenCalledTimes(MEMBER_COUNT);
  expect(mockState.attempted).toHaveLength(MEMBER_COUNT);
  expect(new Set(mockState.attempted).size).toBe(MEMBER_COUNT); // every member, no duplicates

  // The old code (Promise.all over every recipient) would have hit
  // MEMBER_COUNT (7) simultaneous in-flight sends. The bound must be small
  // and strictly less than the full roster.
  expect(mockState.maxInFlight).toBeLessThanOrEqual(2);
  expect(mockState.maxInFlight).toBeGreaterThan(0);
});
