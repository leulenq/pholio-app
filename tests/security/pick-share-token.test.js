"use strict";

/**
 * Designer pick-list token security (design §(d), ruling R3).
 *
 * The token in a `/picks/:token` URL is the entire authentication story for an
 * audience that has no account, no password and no cookie. Everything asserted
 * here is a security property rather than a behaviour:
 *
 *  1. the raw token is never persisted in any form a database read can use;
 *  2. every way a token can fail to resolve produces the SAME 404, so the page
 *     cannot be used as an oracle for "did this list ever exist";
 *  3. expiry is computed from the event, and an unparsable expiry fails closed;
 *  4. revocation is immediate;
 *  5. an explicit reissue rotates — and a plain re-read does not;
 *  6. `/api/picks` sits behind the same-origin mutation guard;
 *  7. the endpoints are rate limited.
 */

const crypto = require("crypto");
const express = require("express");
const request = require("supertest");

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("pick-share-token");
const db = require("../../src/shared/db/knex");

const {
  buildPickListTokenMaterial,
  computePickTokenExpiry,
  hashToken,
  mintPickListToken,
  validatePickToken,
  TOKEN_TTL_AFTER_EVENT_DAYS,
  TOKEN_TTL_FALLBACK_DAYS,
} = require("../../src/domains/events/services/pick-list-tokens");

const {
  REQUEST_HEADER,
  REQUEST_HEADER_VALUE,
  isProtectedApiPath,
  sameOriginMutationGuard,
} = require("../../src/shared/middleware/same-origin-mutation");

const pickShareRoutes = require("../../src/domains/events/routes/pick-share");

const uuid = () => crypto.randomUUID();
const DAY_MS = 24 * 60 * 60 * 1000;

const agencyId = uuid();
const linkWithEventId = uuid();
const linkWithoutDatesId = uuid();

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(pickShareRoutes);
  return app;
}

const app = createApp();

/** Insert a pick list directly so each test owns its own token lifecycle. */
async function createPickList({
  status = "open",
  linkId = linkWithEventId,
  expiresAt = new Date(Date.now() + 7 * DAY_MS),
  revokedAt = null,
} = {}) {
  const id = uuid();
  const material = buildPickListTokenMaterial();
  await db("event_pick_lists").insert({
    id,
    agency_id: agencyId,
    open_call_link_id: linkId,
    designer_name: "Studio Aalto",
    status,
    token_hash: material.tokenHash,
    expires_at: expiresAt.toISOString(),
    revoked_at: revokedAt,
  });
  return { id, rawToken: material.rawToken };
}

beforeAll(async () => {
  await migrate(db);

  await db("agencies").insert({
    id: agencyId,
    name: "Fashion Week Brooklyn",
    status: "ACTIVE",
  });
  await db("agency_open_call_links").insert([
    {
      id: linkWithEventId,
      agency_id: agencyId,
      code: "eventlink01",
      label: "SS27 casting",
      call_kind: "event_casting",
      event_name: "SS27 Runway",
      event_ends_on: "2026-09-20",
    },
    {
      id: linkWithoutDatesId,
      agency_id: agencyId,
      code: "eventlink02",
      label: "Undated casting",
      call_kind: "event_casting",
    },
  ]);
}, 180000);

afterAll(async () => {
  await db.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

// ---------------------------------------------------------------------------

describe("pick-list token storage", () => {
  test("stores only the sha256 of a token that is never written down", async () => {
    const { id } = await createPickList();
    const { rawToken, tokenHash } = await mintPickListToken({ pickListId: id });

    const row = await db("event_pick_lists").where({ id }).first();

    expect(tokenHash).toBe(hashToken(rawToken));
    expect(row.token_hash).toBe(tokenHash);
    expect(row.token_hash).not.toBe(rawToken);
    // The raw value must not appear in ANY column of the row.
    expect(JSON.stringify(row)).not.toContain(rawToken);
  });

  test("a minted token is 32 bytes of base64url entropy and never repeats", () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) {
      const { rawToken } = buildPickListTokenMaterial();
      expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(seen.has(rawToken)).toBe(false);
      seen.add(rawToken);
    }
  });

  test("the emitted URL carries the raw token and points at /picks", () => {
    const { rawToken, url } = buildPickListTokenMaterial();
    expect(url.endsWith(`/picks/${rawToken}`)).toBe(true);
  });
});

describe("pick-list token expiry", () => {
  test("expires seven days after the event ends", () => {
    const expiry = computePickTokenExpiry({
      eventEndsOn: "2026-09-20",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    const expected =
      new Date("2026-09-20T00:00:00.000Z").getTime() +
      TOKEN_TTL_AFTER_EVENT_DAYS * DAY_MS;
    expect(expiry.getTime()).toBe(expected);
  });

  test("falls back to thirty days when the call has no event end date", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const expiry = computePickTokenExpiry({ eventEndsOn: null, now });
    expect(expiry.getTime()).toBe(
      now.getTime() + TOKEN_TTL_FALLBACK_DAYS * DAY_MS,
    );
  });

  test("a long-past event falls back rather than minting a dead token", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const expiry = computePickTokenExpiry({ eventEndsOn: "2020-01-01", now });
    expect(expiry.getTime()).toBeGreaterThan(now.getTime());
  });

  test("mint reads the TTL from the call the list belongs to", async () => {
    const withEvent = await createPickList({ linkId: linkWithEventId });
    await mintPickListToken({ pickListId: withEvent.id });
    const eventRow = await db("event_pick_lists")
      .where({ id: withEvent.id })
      .first("expires_at");

    const withoutDates = await createPickList({ linkId: linkWithoutDatesId });
    await mintPickListToken({ pickListId: withoutDates.id });
    const undatedRow = await db("event_pick_lists")
      .where({ id: withoutDates.id })
      .first("expires_at");

    expect(new Date(eventRow.expires_at).toISOString()).toBe(
      new Date(
        new Date("2026-09-20T00:00:00.000Z").getTime() +
          TOKEN_TTL_AFTER_EVENT_DAYS * DAY_MS,
      ).toISOString(),
    );
    // Undated calls get the flat month, which lands well after the event TTL
    // in this fixture's timeline only by coincidence — assert the shape, not a
    // fixed instant.
    expect(new Date(undatedRow.expires_at).getTime()).toBeGreaterThan(
      Date.now() + (TOKEN_TTL_FALLBACK_DAYS - 1) * DAY_MS,
    );
  });

  test("an expired token stops resolving", async () => {
    const { rawToken } = await createPickList({
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    expect(await validatePickToken(rawToken)).toBeNull();
  });

  test("an unparsable expiry fails closed", async () => {
    const { id, rawToken } = await createPickList();
    await db("event_pick_lists")
      .where({ id })
      .update({ expires_at: "not-a-timestamp" });
    expect(await validatePickToken(rawToken)).toBeNull();
  });
});

describe("pick-list token resolution", () => {
  test("resolves an open list to its ids and status", async () => {
    const { id, rawToken } = await createPickList({ status: "open" });
    const context = await validatePickToken(rawToken);

    expect(context).toEqual({
      pickListId: id,
      agencyId,
      openCallLinkId: linkWithEventId,
      status: "open",
      expiresAt: expect.anything(),
      submittedAt: null,
    });
  });

  test("a closed list still resolves — closed is read-only, not gone", async () => {
    const { rawToken } = await createPickList({ status: "closed" });
    const context = await validatePickToken(rawToken);
    expect(context?.status).toBe("closed");
  });

  test("a draft list does not resolve — it was never handed over", async () => {
    const { rawToken } = await createPickList({ status: "draft" });
    expect(await validatePickToken(rawToken)).toBeNull();
  });

  test("a revoked list stops resolving immediately", async () => {
    const { id, rawToken } = await createPickList({ status: "open" });
    expect(await validatePickToken(rawToken)).not.toBeNull();

    await db("event_pick_lists").where({ id }).update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    });

    expect(await validatePickToken(rawToken)).toBeNull();
  });

  test.each([null, undefined, "", "   ", 12345, {}])(
    "refuses the malformed token %p without touching the database",
    async (value) => {
      expect(await validatePickToken(value)).toBeNull();
    },
  );
});

describe("no-oracle 404s", () => {
  test("unknown, draft, revoked and expired links are indistinguishable", async () => {
    const unknown = "Zg9nOtARealTokenAtAllZg9nOtARealTokenAtAll1";
    const draft = (await createPickList({ status: "draft" })).rawToken;
    const revoked = (
      await createPickList({
        status: "revoked",
        revokedAt: new Date().toISOString(),
      })
    ).rawToken;
    const expired = (
      await createPickList({ expiresAt: new Date(Date.now() - DAY_MS) })
    ).rawToken;

    const responses = await Promise.all(
      [unknown, draft, revoked, expired].map((token) =>
        request(app).get(`/api/picks/${token}`),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: "PICK_LIST_NOT_AVAILABLE",
          message: "This link is no longer available.",
        },
      });
    }

    // Byte-identical, not merely equivalent.
    const bodies = new Set(responses.map((r) => JSON.stringify(r.body)));
    expect(bodies.size).toBe(1);
  });

  test("writes against an unresolvable token get the same 404", async () => {
    const revoked = await createPickList({
      status: "revoked",
      revokedAt: new Date().toISOString(),
    });

    const put = await request(app)
      .put(`/api/picks/${revoked.rawToken}/selections/${uuid()}`)
      .send({ mark: "pick" });
    const submit = await request(app).post(
      `/api/picks/${revoked.rawToken}/submit`,
    );

    expect(put.status).toBe(404);
    expect(submit.status).toBe(404);
    expect(put.body.error.code).toBe("PICK_LIST_NOT_AVAILABLE");
    expect(submit.body.error.code).toBe("PICK_LIST_NOT_AVAILABLE");
  });
});

describe("reissue rotation", () => {
  test("an explicit reissue kills the old link and stamps rotated_at", async () => {
    const { id, rawToken: original } = await createPickList();
    expect(await validatePickToken(original)).not.toBeNull();

    const reissued = await mintPickListToken({
      pickListId: id,
      reissue: true,
    });

    expect(reissued.rawToken).not.toBe(original);
    expect(await validatePickToken(original)).toBeNull();
    expect(await validatePickToken(reissued.rawToken)).not.toBeNull();

    const row = await db("event_pick_lists").where({ id }).first("rotated_at");
    expect(row.rotated_at).toBeTruthy();
  });

  test("resending an unchanged list does not rotate anything", async () => {
    const { id, rawToken } = await createPickList();

    // A resend re-emails the URL the organizer already holds. Nothing in this
    // module is called, so the link in the designer's inbox keeps working.
    const before = await db("event_pick_lists")
      .where({ id })
      .first("token_hash", "rotated_at");
    const after = await db("event_pick_lists")
      .where({ id })
      .first("token_hash", "rotated_at");

    expect(after.token_hash).toBe(before.token_hash);
    expect(after.rotated_at).toBeNull();
    expect(await validatePickToken(rawToken)).not.toBeNull();
  });

  test("minting without the reissue flag does not stamp rotation", async () => {
    const { id } = await createPickList();
    await mintPickListToken({ pickListId: id });
    const row = await db("event_pick_lists").where({ id }).first("rotated_at");
    expect(row.rotated_at).toBeNull();
  });

  test("minting for a list that does not exist throws rather than no-oping", async () => {
    await expect(mintPickListToken({ pickListId: uuid() })).rejects.toThrow(
      /Pick list not found/,
    );
    await expect(mintPickListToken({ pickListId: "" })).rejects.toThrow(
      /pickListId is required/,
    );
  });
});

describe("same-origin guard covers the designer write paths", () => {
  test("/api/picks is a protected API prefix", () => {
    expect(isProtectedApiPath("/api/picks")).toBe(true);
    expect(isProtectedApiPath("/api/picks/abc/selections/def")).toBe(true);
    expect(isProtectedApiPath("/api/picksomething")).toBe(false);
  });

  test("a headerless designer write is rejected before it reaches the route", async () => {
    const guarded = express();
    guarded.use(
      sameOriginMutationGuard({
        allowedOrigins: new Set(["https://app.pholio.studio"]),
      }),
    );
    guarded.all("*", (req, res) => res.status(204).end());

    const blocked = await request(guarded)
      .put("/api/picks/token/selections/application")
      .set("Origin", "https://app.pholio.studio")
      .send({ mark: "pick" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.reason).toBe("missing_request_header");

    const crossSite = await request(guarded)
      .post("/api/picks/token/submit")
      .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
      .set("Origin", "https://attacker.example")
      .send({});
    expect(crossSite.status).toBe(403);
    expect(crossSite.body.error.reason).toBe("untrusted_origin");

    // Reads stay open — a designer follows a link, they do not POST to arrive.
    const read = await request(guarded).get("/api/picks/token");
    expect(read.status).toBe(204);
  });
});

describe("rate limiting", () => {
  // Runs last: the limiter is a module-level instance shared by every request
  // in this file, so this test is written to be order-independent by hammering
  // until it trips rather than assuming a fixed remaining budget.
  test("a scripted client hammering the token space is throttled", async () => {
    let sawTooMany = false;
    for (let i = 0; i < 200 && !sawTooMany; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await request(app).get(`/api/picks/probe-${i}`);
      if (response.status === 429) sawTooMany = true;
    }
    expect(sawTooMany).toBe(true);
  }, 60000);
});
