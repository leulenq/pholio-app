/**
 * Editions ROUTE wiring (plan 2.9) — supertest against /pdf/view/:slug using
 * the built-in demo profile (elara-k), so no database is required.
 *
 * Contracts:
 *  - flag OFF (default + ?editions=0): no edition meta keys, no edition
 *    response headers, and the rendered HTML is byte-identical to a render
 *    with no editions param (the editions engine is inert).
 *  - flag ON (?editions=1): the edition resolves, meta carries edition +
 *    takeSignature, the X-CompCard-Edition header is present.
 *  - ?edition=<id> pins a suitable edition.
 *  - ?avoidEdition= cycles (the avoided edition is not re-served).
 *  - ?directions=1&editions=1 carries the editions availability catalog.
 */

const express = require("express");
const request = require("supertest");

const pdfRouter = require("../routes/pdf");
const { EDITIONS } = require("../composition/editions");

let consoleLogSpy;
let consoleWarnSpy;
let consoleErrorSpy;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.session = {};
    next();
  });
  app.use(pdfRouter);
  return app;
}

beforeAll(() => {
  consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  consoleLogSpy?.mockRestore();
  consoleWarnSpy?.mockRestore();
  consoleErrorSpy?.mockRestore();
});

const SEED = "editions-route-seed";

describe("editions route — flag OFF is inert", () => {
  test("meta has no edition keys and no edition headers when the flag is off", async () => {
    const app = createApp();
    const res = await request(app).get(`/pdf/view/elara-k?meta=1&seed=${SEED}`);
    expect(res.status).toBe(200);
    expect(res.body.engine).toBe("composed");
    expect(res.body.edition).toBeUndefined();
    expect(res.body.takeSignature).toBeUndefined();
  });

  test("?editions=0 render carries no edition headers", async () => {
    const app = createApp();
    const res = await request(app).get(`/pdf/view/elara-k?editions=0&seed=${SEED}`);
    expect(res.status).toBe(200);
    expect(res.headers["x-compcard-edition"]).toBeUndefined();
    expect(res.headers["x-compcard-edition-field"]).toBeUndefined();
  });

  test("?editions=0 HTML is byte-identical to a render with no editions param", async () => {
    const app = createApp();
    const [a, b] = await Promise.all([
      request(app).get(`/pdf/view/elara-k?seed=${SEED}`),
      request(app).get(`/pdf/view/elara-k?editions=0&seed=${SEED}`),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.headers["x-compcard-engine"]).toBe("composed");
    expect(b.text).toBe(a.text);
    // and neither carries any editions-only markup
    expect(a.text).not.toContain("font-variant-numeric: tabular-nums");
    expect(a.text).not.toContain("cell-divider");
  });
});

describe("editions route — flag ON resolves an edition", () => {
  test("?editions=1&meta=1 exposes edition + takeSignature", async () => {
    const app = createApp();
    const res = await request(app).get(`/pdf/view/elara-k?editions=1&meta=1&seed=${SEED}`);
    expect(res.status).toBe(200);
    expect(res.body.edition).toBeTruthy();
    expect(EDITIONS.map((e) => e.id)).toContain(res.body.edition.id);
    expect(["paper", "warm", "plane", "dark"]).toContain(res.body.edition.field);
    expect(["quiet", "standard", "display"]).toContain(res.body.edition.register);
    expect(res.body.takeSignature).toBeTruthy();
    expect(res.body.takeSignature.edition).toBe(res.body.edition.id);
  });

  test("?editions=1 render sets the X-CompCard-Edition header", async () => {
    const app = createApp();
    const res = await request(app).get(`/pdf/view/elara-k?editions=1&seed=${SEED}`);
    expect(res.status).toBe(200);
    expect(res.headers["x-compcard-edition"]).toBeTruthy();
    expect(EDITIONS.map((e) => e.id)).toContain(res.headers["x-compcard-edition"]);
    expect(res.headers["x-compcard-edition-register"]).toBeTruthy();
  });

  test("?edition=<id> pins a suitable edition (house-classic is always suitable)", async () => {
    const app = createApp();
    const res = await request(app).get(
      `/pdf/view/elara-k?editions=1&meta=1&seed=${SEED}&edition=house-classic`,
    );
    expect(res.status).toBe(200);
    expect(res.body.edition.id).toBe("house-classic");
  });

  test("?avoidEdition= cycles — the avoided edition is not re-served", async () => {
    const app = createApp();
    const first = await request(app).get(
      `/pdf/view/elara-k?editions=1&meta=1&seed=cycle-A`,
    );
    const served = first.body.edition.id;
    const second = await request(app).get(
      `/pdf/view/elara-k?editions=1&meta=1&seed=cycle-A&avoidEdition=${served}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.edition.id).not.toBe(served);
  });

  test("invalid ?edition= is ignored (falls through to the draw)", async () => {
    const app = createApp();
    const res = await request(app).get(
      `/pdf/view/elara-k?editions=1&meta=1&seed=${SEED}&edition=not-a-real-edition`,
    );
    expect(res.status).toBe(200);
    expect(EDITIONS.map((e) => e.id)).toContain(res.body.edition.id);
  });
});

describe("editions route — directions catalog", () => {
  test("?directions=1&editions=1 carries the editions availability catalog", async () => {
    const app = createApp();
    const res = await request(app).get(`/pdf/view/elara-k?directions=1&editions=1&seed=${SEED}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.directions)).toBe(true); // untouched
    expect(Array.isArray(res.body.editions)).toBe(true);
    expect(res.body.editions.length).toBe(EDITIONS.length);
    const houseClassic = res.body.editions.find((e) => e.id === "house-classic");
    expect(houseClassic).toEqual(
      expect.objectContaining({
        id: "house-classic",
        label: expect.any(String),
        tone: expect.any(String),
        available: expect.any(Boolean),
      }),
    );
  });

  test("?directions=1 without editions carries no editions key (back-compat)", async () => {
    const app = createApp();
    const res = await request(app).get(`/pdf/view/elara-k?directions=1&seed=${SEED}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.directions)).toBe(true);
    expect(res.body.editions).toBeUndefined();
  });
});
