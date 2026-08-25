"use strict";

/**
 * The public agency registry endpoints (§7 item 5, §9.6 #2).
 *
 * These serve unauthenticated readers and are meant to be crawled, so the tests
 * that matter are about what does NOT come out. The stored spec is a research
 * artifact carrying reviewer identities and internal editorial notes; the
 * projection is an allowlist precisely so a field added upstream cannot become
 * public by existing. That property is what is asserted here.
 */

const express = require("express");
const request = require("supertest");

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("public-registry-api");
const knex = require("../../src/shared/db/knex");

const {
  publicAgencyDto,
  publicAgencySummaryDto,
} = require("../../src/domains/spec-registry/public-projection");
const path = require("path");
const { validateRegistry } = require("../../scripts/validate-spec-registry");
const { publishRegistry } = require("../../src/domains/spec-registry/store/publisher");

let app;

beforeAll(async () => {
  await migrate(knex);
  app = express();
  app.use(express.json());
  app.use("/api/public/registry", require("../../src/routes/api/public-registry"));
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

/* A spec carrying every field that must never be republished. */
const SPEC = {
  seriesId: "test-house-nyc:email",
  revisionId: "test-house-nyc:email@1",
  revision: 1,
  status: "verified",
  evaluationMode: "advisory",
  scope: {
    organization: { id: "test-house", name: "Test House" },
    office: { id: "nyc", name: "New York" },
    market: { kind: "city", code: "new-york-us", city: "New York", countryCodes: ["US"] },
    channel: { id: "email", type: "official_email", url: "https://example.test/contact" },
  },
  lifecycle: {
    observedOn: "2026-08-09",
    reviewedOn: "2026-08-09",
    nextReviewOn: "2026-11-07",
  },
  rules: {
    shots: {
      count: { minimum: 3, maximum: null },
      slots: [
        {
          id: "close-up-hair-up",
          quantity: { minimum: 1, maximum: 1 },
          modality: "requested",
          sourceLabel: "Close ups ... hair up",
          matchability: "hybrid",
          match: {
            all: [
              { field: "shot.frame", operator: "equals", value: "close_up", unit: null },
              { field: "appearance.hair_state", operator: "equals", value: "up", unit: null },
            ],
          },
        },
      ],
    },
    files: { allowedFormats: ["jpeg"], maxBytesPerFile: 1048576, secretInternalKnob: "nope" },
    eligibility: [
      {
        id: "preferred-minimum-height",
        modality: "preferred",
        constraint: { field: "applicant.height_cm", operator: "gte", value: 175.26, unit: "cm" },
        sourceLabel: "We prefer our models to be a minimum of 5'9\" and taller.",
        matchability: "automatic",
      },
    ],
  },
  unknowns: [
    {
      fact: "shots.count.maximum",
      reason: "not_published",
      note: "The email instructions do not publish a maximum number of images.",
    },
  ],
  evidence: [
    {
      id: "test-house-20260809",
      authority: "first_party_published",
      publisher: "Test House",
      title: "CONTACT | TEST HOUSE",
      url: "https://example.test/contact",
      retrievedOn: "2026-08-09",
      excerpt: "SECRET-EXCERPT-should-never-be-republished",
      contentHash: "SECRET-HASH",
      archivedUrl: "https://archive.test/SECRET",
    },
  ],
  review: {
    method: "dual_reviewer",
    reviewers: [{ id: "SECRET-REVIEWER-ID", reviewedOn: "2026-08-09" }],
    notes: "SECRET-INTERNAL-EDITORIAL-NOTE about how confident we are.",
  },
};

const ROUTE = {
  seriesId: SPEC.seriesId,
  organization: SPEC.scope.organization,
  agencyName: "Test House",
  office: SPEC.scope.office,
  market: SPEC.scope.market,
  marketLabel: "New York",
  channel: SPEC.scope.channel,
  lifecycle: SPEC.lifecycle,
  sourceFreshness: { state: "fresh" },
  verification: null,
};

describe("the public projection is an allowlist", () => {
  const dto = publicAgencyDto(ROUTE, SPEC);
  const serialized = JSON.stringify(dto);

  test.each([
    ["an evidence excerpt", "SECRET-EXCERPT-should-never-be-republished"],
    ["a content hash", "SECRET-HASH"],
    ["an archived-copy URL", "https://archive.test/SECRET"],
    ["a reviewer identity", "SECRET-REVIEWER-ID"],
    ["an internal editorial note", "SECRET-INTERNAL-EDITORIAL-NOTE"],
    ["an unrecognised internal key", "secretInternalKnob"],
    ["its value", "nope"],
  ])("never republishes %s", (_label, value) => {
    expect(serialized).not.toContain(value);
  });

  test("matchability and evaluationMode stay internal", () => {
    expect(serialized).not.toContain("matchability");
    expect(serialized).not.toContain("evaluationMode");
    expect(serialized).not.toContain("hybrid");
  });
});

describe("the public projection keeps what makes the page honest", () => {
  const dto = publicAgencyDto(ROUTE, SPEC);

  test("says what the agency does NOT publish", () => {
    // The single most important field: every competitor fills this silence
    // with an invention.
    expect(dto.notPublished).toHaveLength(1);
    expect(dto.notPublished[0].note).toMatch(/do not publish a maximum/i);
  });

  test("keeps the agency's own words beside Pholio's reading", () => {
    const [slot] = dto.requirements.slots;
    expect(slot.sourceLabel).toBe("Close ups ... hair up");
    expect(slot.reading).toEqual(["Shot frame: Close-up", "Hair state: Hair up"]);
  });

  test("carries the dates a reader needs to judge staleness", () => {
    expect(dto.checked).toMatchObject({
      observedOn: "2026-08-09",
      reviewedOn: "2026-08-09",
      nextReviewOn: "2026-11-07",
    });
  });

  test("cites its sources without copying them", () => {
    expect(dto.sources[0]).toMatchObject({
      publisher: "Test House",
      url: "https://example.test/contact",
      retrievedOn: "2026-08-09",
    });
    expect(dto.sources[0].excerpt).toBeUndefined();
  });

  test("states that Pholio is not affiliated, by name", () => {
    expect(dto.disclosure).toMatch(/not affiliated with Test House/);
  });

  test("verification is positive-only — null never renders as 'unverified'", () => {
    expect(dto.verification).toBeNull();
  });

  test("an unlabelled condition falls back to the source's words, not a guess", () => {
    const invented = {
      ...SPEC,
      rules: {
        ...SPEC.rules,
        shots: {
          ...SPEC.rules.shots,
          slots: [
            {
              id: "x",
              quantity: { minimum: 1, maximum: 1 },
              sourceLabel: "Whatever they actually wrote",
              match: { all: [{ field: "not.a.real.field", operator: "equals", value: "??" }] },
            },
          ],
        },
      },
    };
    const [slot] = publicAgencyDto(ROUTE, invented).requirements.slots;
    expect(slot.reading).toEqual([]);
    expect(slot.sourceLabel).toBe("Whatever they actually wrote");
  });
});

describe("the index row", () => {
  test("carries enough to list and link, and no requirements", () => {
    const summary = publicAgencySummaryDto(ROUTE);
    expect(summary.organization.name).toBe("Test House");
    expect(summary.checked.reviewedOn).toBe("2026-08-09");
    expect(summary.requirements).toBeUndefined();
  });
});

describe("the endpoints", () => {
  test("an empty registry answers 503, never an empty 200", async () => {
    // An empty 200 would be cached by the marketing site as "this agency
    // publishes nothing" — a lie with a long tail.
    const response = await request(app).get("/api/public/registry/agencies");
    expect(response.status).toBe(503);
    expect(response.body.error).toBe("registry_unavailable");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  test("an unknown series is 404, and says nothing about why", async () => {
    const response = await request(app).get("/api/public/registry/agencies/nope:email");
    expect(response.status).toBe(404);
    // Absent, delisted and never-existed answer identically: which agencies
    // Pholio has removed, and when, is an editorial fact about Pholio.
    expect(JSON.stringify(response.body)).not.toMatch(/delist/i);
  });

  test("an over-long series id is rejected before it reaches the database", async () => {
    const response = await request(app).get(
      `/api/public/registry/agencies/${"x".repeat(300)}`,
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_series_id");
  });
});

describe("the endpoints against the real published registry", () => {
  /*
   * The failure paths above are the easy half. This publishes the actual
   * shipped dataset and drives both endpoints over HTTP, because a projection
   * proven in isolation says nothing about whether the route reaches it — which
   * is the exact gap that let a decline picker post a field no route read.
   */
  let seriesId;

  beforeAll(async () => {
    const registry = validateRegistry({
      registryRoot: path.join(__dirname, "..", "..", "data", "spec-registry", "v1"),
      asOf: new Date("2026-08-20T12:00:00.000Z"),
    });
    await publishRegistry(knex, registry);
  }, 120000);

  test("the index lists the shipped agencies and says what the list is", async () => {
    const response = await request(app).get("/api/public/registry/agencies");

    expect(response.status).toBe(200);
    expect(response.body.data.count).toBeGreaterThan(0);
    expect(response.body.data.about).toMatch(/not affiliated/i);
    // Cacheable: the marketing site renders these server-side, and an uncached
    // public endpoint on a serverless function is a bill and an outage racing.
    expect(response.headers["cache-control"]).toMatch(/max-age=1800/);

    const [first] = response.body.data.agencies;
    expect(first.organization.name).toEqual(expect.any(String));
    // The index is a list, not a payload: no requirements ride along.
    expect(first.requirements).toBeUndefined();
    seriesId = first.seriesId;
  });

  test("one agency returns its published requirements", async () => {
    const response = await request(app).get(
      `/api/public/registry/agencies/${encodeURIComponent(seriesId)}`,
    );

    expect(response.status).toBe(200);
    const { data } = response.body;
    expect(data.seriesId).toBe(seriesId);
    expect(data.disclosure).toMatch(/not affiliated with /i);
    expect(data.channel.url).toEqual(expect.any(String));
    expect(data.checked.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("no internal editorial reaches the wire, on real data", async () => {
    const response = await request(app).get(
      `/api/public/registry/agencies/${encodeURIComponent(seriesId)}`,
    );
    const wire = JSON.stringify(response.body);

    // The fixture test proves the allowlist on poisoned input. This proves it
    // on the data actually shipping.
    for (const forbidden of ["reviewers", "contentHash", "archivedUrl", "matchability"]) {
      expect(wire).not.toContain(forbidden);
    }
  });
});
