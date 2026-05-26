const express = require("express");
const request = require("supertest");

const pdfRouter = require("../routes/pdf");
let consoleLogSpy;
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

describe("pdf diagnostics route locks", () => {
  beforeAll(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  test("applies valid hero/grid locks in diagnostics selection", async () => {
    const app = createApp();
    const response = await request(app).get(
      "/pdf/view/elara-k?diagnostics=1&seed=lock-seed-1&lockHeroId=demo-img-3&lockGridIds=demo-img-4,demo-img-1",
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.compCard?.locks).toEqual({
      heroId: "demo-img-3",
      gridIds: ["demo-img-4", "demo-img-1", null, null],
    });
    expect(response.body.selection?.heroImageId).toBe("demo-img-3");
    expect(response.body.selection?.gridImageIds?.[0]).toBe("demo-img-4");
    expect(response.body.selection?.gridImageIds?.[1]).toBe("demo-img-1");
    expect(response.body.guardrailReport).toEqual(
      expect.objectContaining({
        status: expect.any(String),
        blockingIssueCount: expect.any(Number),
        warningCount: expect.any(Number),
      }),
    );
  });

  test("normalizes malformed lock query values safely", async () => {
    const app = createApp();
    const response = await request(app).get(
      "/pdf/view/elara-k?diagnostics=1&lockHeroId=%20%20&lockGridIds=demo-img-2,%20,%40%40bad",
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.compCard?.locks).toEqual({
      heroId: null,
      gridIds: ["demo-img-2", null, "bad", null],
    });
    expect(response.body.selection?.heroImageId).toBeTruthy();
    expect(Array.isArray(response.body.selection?.gridImageIds)).toBe(true);
    expect(response.body.selection.gridImageIds).toHaveLength(4);
    expect(response.body.guardrailReport).toEqual(
      expect.objectContaining({
        checks: expect.any(Array),
      }),
    );
  });

  test("blocks master download when guardrails fail", async () => {
    const app = createApp();
    const response = await request(app).get(
      "/pdf/elara-k?mode=master&download=1",
    );

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Guardrails failed");
    expect(response.body.code).toBe("COMP_CARD_GUARDRAILS_FAILED");
    expect(response.body.guardrailReport).toEqual(
      expect.objectContaining({
        mode: "master",
        status: "fail",
      }),
    );
  });

  test("keeps draft download behavior compatible", async () => {
    const app = createApp();
    const response = await request(app).get(
      "/pdf/elara-k?mode=draft&download=1",
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
  });
});
