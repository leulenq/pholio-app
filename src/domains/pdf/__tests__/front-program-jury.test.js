/**
 * Tests for the front-program vision jury. groq-sdk is mocked — no network,
 * no puppeteer (renderPng is a stub the caller would supply). Strict-schema
 * transport is still validated field by field.
 */

const mockCreate = jest.fn();
jest.mock("groq-sdk", () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
);

// ── fixtures ──────────────────────────────────────────────────────────────────

// Minimal stand-in programs — the jury never inspects them; the caller's
// renderPng turns them into PNGs.
const CANDIDATES = [
  { program: { id: "p0" }, score: 60 },
  { program: { id: "p1" }, score: 80 },
  { program: { id: "p2" }, score: 70 },
];

const png = (tag) => Buffer.from(`png-${tag}`);

// renderPng that always succeeds, tagging the buffer from the program id.
const renderAll = () => jest.fn(async (program) => png(program.id));

// Build a rubric entry.
const entry = (index, l, b, s, p) => ({
  index,
  legibility: l,
  balance: b,
  subjectRespect: s,
  premiumFeel: p,
});

function groqReturns(obj) {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(obj) } }],
  });
}

// ── validateVerdict (pure) ────────────────────────────────────────────────────

describe("validateVerdict", () => {
  const { validateVerdict } = require("../composition/front-program/jury");

  test("valid verdict parses per-index rubric + winningIndex", () => {
    const v = validateVerdict(
      {
        scores: [entry(0, 50, 60, 70, 80), entry(1, 90, 90, 90, 90)],
        winningIndex: 1,
        rationale: "Cleaner hierarchy.",
      },
      2,
    );
    expect(v.winningIndex).toBe(1);
    expect(v.byIndex[1].premiumFeel).toBe(90);
    expect(v.rationale).toBe("Cleaner hierarchy.");
  });

  test("score count mismatch → null", () => {
    expect(
      validateVerdict({ scores: [entry(0, 1, 1, 1, 1)], winningIndex: 0, rationale: "" }, 2),
    ).toBeNull();
  });

  test("out-of-range index in scores → null", () => {
    expect(
      validateVerdict(
        { scores: [entry(0, 1, 1, 1, 1), entry(5, 1, 1, 1, 1)], winningIndex: 0, rationale: "" },
        2,
      ),
    ).toBeNull();
  });

  test("duplicate index / gap → null", () => {
    expect(
      validateVerdict(
        { scores: [entry(0, 1, 1, 1, 1), entry(0, 2, 2, 2, 2)], winningIndex: 0, rationale: "" },
        2,
      ),
    ).toBeNull();
  });

  test("non-numeric rubric score → null", () => {
    expect(
      validateVerdict(
        { scores: [entry(0, "good", 1, 1, 1), entry(1, 1, 1, 1, 1)], winningIndex: 0, rationale: "" },
        2,
      ),
    ).toBeNull();
  });

  test("out-of-range winningIndex → null", () => {
    expect(
      validateVerdict(
        { scores: [entry(0, 1, 1, 1, 1), entry(1, 1, 1, 1, 1)], winningIndex: 9, rationale: "" },
        2,
      ),
    ).toBeNull();
  });

  test("rationale truncated to 200 chars", () => {
    const v = validateVerdict(
      {
        scores: [entry(0, 1, 1, 1, 1), entry(1, 1, 1, 1, 1)],
        winningIndex: 0,
        rationale: "x".repeat(500),
      },
      2,
    );
    expect(v.rationale).toHaveLength(200);
  });
});

// ── rankFrontCandidates ───────────────────────────────────────────────────────

describe("rankFrontCandidates", () => {
  let rankFrontCandidates;
  let JURY_MODEL;

  beforeEach(() => {
    jest.resetModules();
    mockCreate.mockReset();
    process.env.GROQ_API_KEY = "test-key";
    ({ rankFrontCandidates, JURY_MODEL } = require("../composition/front-program/jury"));
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
  });

  test("happy path: one multi-image call, winnerIndex + parsed rubric", async () => {
    // candidate 1 dominates both signals → clear winner
    groqReturns({
      scores: [entry(0, 40, 40, 40, 40), entry(1, 95, 95, 95, 95), entry(2, 60, 60, 60, 60)],
      winningIndex: 1,
      rationale: "Most confident hero.",
    });
    const renderPng = renderAll();
    const result = await rankFrontCandidates({ candidates: CANDIDATES, renderPng });

    expect(result.winnerIndex).toBe(1);
    expect(result.rationale).toBe("Most confident hero.");
    expect(result.scores.find((s) => s.index === 1).vision.premiumFeel).toBe(95);

    // exactly one vision call, carrying json_object mode and 3 images.
    // The jury deliberately uses response_format json_object, NOT json_schema:
    // the Groq vision model does not support strict schema decoding, so the
    // shape lives in the system prompt and validateVerdict() is the only shape
    // guarantee (see the module header in jury.js). This assertion previously
    // required json_schema.strict and had not been updated when the
    // implementation moved.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const args = mockCreate.mock.calls[0][0];
    expect(args.model).toBe(JURY_MODEL);
    expect(args.response_format).toEqual({ type: "json_object" });
    const userContent = args.messages.find((m) => m.role === "user").content;
    const images = userContent.filter((c) => c.type === "image_url");
    expect(images).toHaveLength(3);
    expect(images[0].image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  test("fewer than 2 renderable PNGs → null without calling Groq", async () => {
    const renderPng = jest.fn(async () => null); // every render fails
    const result = await rankFrontCandidates({ candidates: CANDIDATES, renderPng });
    expect(result).toBeNull();
    expect(renderPng).toHaveBeenCalledTimes(3);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("renderPng throwing is treated as a null render", async () => {
    // only one survivor (index 1) → still <2 → null, no Groq call
    const renderPng = jest.fn(async (program) => {
      if (program.id === "p1") return png("p1");
      throw new Error("puppeteer boom");
    });
    const result = await rankFrontCandidates({ candidates: CANDIDATES, renderPng });
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("malformed JSON → null", async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "not json" } }] });
    expect(await rankFrontCandidates({ candidates: CANDIDATES, renderPng: renderAll() })).toBeNull();
  });

  test("SDK rejection → null", async () => {
    mockCreate.mockRejectedValue(new Error("boom"));
    expect(await rankFrontCandidates({ candidates: CANDIDATES, renderPng: renderAll() })).toBeNull();
  });

  test("timeout → null", async () => {
    mockCreate.mockImplementation(() => new Promise(() => {}));
    const result = await rankFrontCandidates({
      candidates: CANDIDATES,
      renderPng: renderAll(),
      timeoutMs: 60,
    });
    expect(result).toBeNull();
  });

  test("out-of-range winning index in response → null", async () => {
    groqReturns({
      scores: [entry(0, 50, 50, 50, 50), entry(1, 60, 60, 60, 60), entry(2, 70, 70, 70, 70)],
      winningIndex: 7, // invalid
      rationale: "ok",
    });
    expect(await rankFrontCandidates({ candidates: CANDIDATES, renderPng: renderAll() })).toBeNull();
  });

  test("no API key → null without constructing a client or rendering", async () => {
    delete process.env.GROQ_API_KEY;
    jest.resetModules();
    const fresh = require("../composition/front-program/jury");
    const renderPng = renderAll();
    expect(await fresh.rankFrontCandidates({ candidates: CANDIDATES, renderPng })).toBeNull();
    expect(renderPng).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("fewer than 2 candidates → null without rendering or calling Groq", async () => {
    const renderPng = renderAll();
    expect(await rankFrontCandidates({ candidates: [CANDIDATES[0]], renderPng })).toBeNull();
    expect(renderPng).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  describe("blend math", () => {
    const TWO = [
      { program: { id: "a" }, score: 10 }, // aesthetics hates a
      { program: { id: "b" }, score: 100 }, // aesthetics loves b
    ];

    test("model loves A while aesthetics loves B → vision (0.6) wins → A", async () => {
      groqReturns({
        scores: [entry(0, 95, 95, 95, 95), entry(1, 10, 10, 10, 10)],
        winningIndex: 1, // model's own pick is irrelevant to the blend
        rationale: "blend test",
      });
      const result = await rankFrontCandidates({ candidates: TWO, renderPng: renderAll() });
      // visionNorm a=1,b=0 ; aesthNorm a=0,b=1 ; final a=0.6, b=0.4 → A wins
      expect(result.winnerIndex).toBe(0);
      expect(result.scores.find((s) => s.index === 0).final).toBe(0.6);
      expect(result.scores.find((s) => s.index === 1).final).toBe(0.4);
    });

    test("symmetry: model loves B while aesthetics loves A → B wins", async () => {
      const flipped = [
        { program: { id: "a" }, score: 100 },
        { program: { id: "b" }, score: 10 },
      ];
      groqReturns({
        scores: [entry(0, 10, 10, 10, 10), entry(1, 95, 95, 95, 95)],
        winningIndex: 0,
        rationale: "blend test",
      });
      const result = await rankFrontCandidates({ candidates: flipped, renderPng: renderAll() });
      expect(result.winnerIndex).toBe(1);
    });
  });
});
