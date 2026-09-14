"use strict";

const mockReplyState = {
  blocked: false,
  context: null,
  messages: [],
};

jest.mock("../../src/shared/db/knex", () => {
  const db = jest.fn((table) => {
    if (table === "message_reply_tokens") {
      const builder = {
        where: jest.fn(() => builder),
        first: jest.fn(async () => ({
          id: "reply-token-1",
          application_id: "application-1",
          talent_user_id: "talent-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        })),
        update: jest.fn(async () => 1),
      };
      return builder;
    }

    if (table === "applications as a") {
      const builder = {
        join: jest.fn(() => builder),
        leftJoin: jest.fn(() => builder),
        where: jest.fn(() => builder),
        select: jest.fn(() => builder),
        first: jest.fn(async () => ({ ...mockReplyState.context })),
      };
      return builder;
    }

    if (table === "messages") {
      const builder = {
        criteria: null,
        insert: jest.fn(async (row) => {
          mockReplyState.messages.push(row);
          return 1;
        }),
        where: jest.fn((criteria) => {
          builder.criteria = criteria;
          return builder;
        }),
        first: jest.fn(async () =>
          mockReplyState.messages.find(
            (row) => row.id === builder.criteria?.id,
          ),
        ),
      };
      return builder;
    }

    throw new Error(`Unexpected table: ${table}`);
  });
  db.fn = { now: jest.fn(() => new Date().toISOString()) };
  return db;
});

jest.mock("../../src/shared/lib/blocked-agencies", () => ({
  isAgencyBlockedForTalent: jest.fn(async () => mockReplyState.blocked),
}));

jest.mock("../../src/domains/agency/routes/agency-log-activity", () =>
  jest.fn(),
);
jest.mock("../../src/shared/services/agency-notifications", () => ({
  notifyAgencyNewMessage: jest.fn(),
}));

const {
  validateReplyToken,
} = require("../../src/domains/messaging/services/message-reply-tokens");
const messageReplyRoutes = require("../../src/domains/messaging/routes/message-reply");
const express = require("express");
const request = require("supertest");

function adultReplyContext(overrides = {}) {
  return {
    application_id: "application-1",
    agency_id: "agency-1",
    application_status: "submitted",
    profile_id: "profile-1",
    date_of_birth: "1990-01-01",
    talent_user_id: "talent-1",
    talent_email: "talent@example.test",
    talent_account_status: "active",
    talent_first_name: "Taylor",
    talent_last_name: "Talent",
    agency_name: "Test Agency",
    agency_status: "ACTIVE",
    ...overrides,
  };
}

describe("prelaunch emailed reply bearer authorization", () => {
  beforeEach(() => {
    mockReplyState.blocked = false;
    mockReplyState.context = adultReplyContext();
    mockReplyState.messages = [];
  });

  test("accepts a current adult account, application, and agency", async () => {
    await expect(validateReplyToken("existing-token")).resolves.toMatchObject({
      applicationId: "application-1",
      talentUserId: "talent-1",
      agencyId: "agency-1",
    });
  });

  test.each(["suspended", "banned"])(
    "rejects a preexisting token after the talent is %s",
    async (talentAccountStatus) => {
      mockReplyState.context = adultReplyContext({
        talent_account_status: talentAccountStatus,
      });

      await expect(validateReplyToken("existing-token")).resolves.toBeNull();
    },
  );

  test("rejects a preexisting token after application withdrawal", async () => {
    mockReplyState.context = adultReplyContext({
      application_status: "withdrawn",
    });

    await expect(validateReplyToken("existing-token")).resolves.toBeNull();
  });

  test("rejects a preexisting token after the agency becomes inactive", async () => {
    mockReplyState.context = adultReplyContext({ agency_status: "SUSPENDED" });

    await expect(validateReplyToken("existing-token")).resolves.toBeNull();
  });

  test("rejects a preexisting token after talent blocks the agency", async () => {
    mockReplyState.blocked = true;

    await expect(validateReplyToken("existing-token")).resolves.toBeNull();
  });

  test.each(["2012-01-01", null, "not-a-date"])(
    "rejects a token unless adulthood is provable from DOB (%s)",
    async (dateOfBirth) => {
      mockReplyState.context = adultReplyContext({
        date_of_birth: dateOfBirth,
      });

      await expect(validateReplyToken("existing-token")).resolves.toBeNull();
    },
  );

  test("message throttling keys on stable talent and application identity", () => {
    const key = messageReplyRoutes._test.replyMessageRateLimitKey;
    const first = key({
      params: { token: "first-rotation" },
      replyContext: { talentUserId: "talent-1", applicationId: "application-1" },
    });
    const rotated = key({
      params: { token: "second-rotation" },
      replyContext: { talentUserId: "talent-1", applicationId: "application-1" },
    });

    expect(first).toBe("reply:talent-1:application-1");
    expect(rotated).toBe(first);
  });

  test("message writes are capped for one stable talent/application identity", async () => {
    const app = express();
    app.use(express.json());
    app.use(messageReplyRoutes);

    for (let attempt = 0; attempt < messageReplyRoutes._test.REPLY_MESSAGE_MAX; attempt += 1) {
      const response = await request(app)
        .post(`/api/reply/rotation-${attempt}/messages`)
        .send({ message: `Reply ${attempt}` });
      expect(response.status).toBe(200);
    }

    const limited = await request(app)
      .post("/api/reply/another-rotation/messages")
      .send({ message: "One reply too many" });

    expect(limited.status).toBe(429);
    expect(mockReplyState.messages).toHaveLength(
      messageReplyRoutes._test.REPLY_MESSAGE_MAX,
    );
  });
});
