/**
 * Tests for the Groq art-director planning layer. groq-sdk is mocked — no
 * network. Strict-schema transport is still validated field by field.
 */

const mockCreate = jest.fn();
jest.mock("groq-sdk", () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
);

const POOL = [
  { id: "hs", role: "headshot", qualityScore: 85, heroScore: 90, label: "Headshot" },
  { id: "fb", role: "full_body", qualityScore: 80, heroScore: 60, label: "Runway" },
];

const VALID_RAW = {
  typographyVoice: "editorial-serif",
  formality: 75,
  warmth: 40,
  energy: 30,
  density: 45,
  frontTreatment: "full-bleed",
  statsSide: "right",
  frontStatLine: false,
  bleedAppetite: "restrained",
  heroImageId: "hs",
  rationale: "Classic editorial presence.",
};

function groqReturns(content) {
  mockCreate.mockResolvedValue({ choices: [{ message: { content } }] });
}

describe("validateBrief", () => {
  const { validateBrief } = require("../composition/art-director");

  test("valid brief normalizes 0-100 axes to 0..1", () => {
    const brief = validateBrief(VALID_RAW, POOL);
    expect(brief.typographyVoice).toBe("editorial-serif");
    expect(brief.tone).toEqual({ formality: 0.75, warmth: 0.4, energy: 0.3, density: 0.45 });
    expect(brief.heroImageId).toBe("hs");
    expect(brief.frontTreatment).toBe("full-bleed");
  });

  test("0..1 float axes are tolerated", () => {
    const brief = validateBrief({ ...VALID_RAW, formality: 0.9 }, POOL);
    expect(brief.tone.formality).toBe(0.9);
  });

  test("unknown voice → null brief (voice is the spine of the design)", () => {
    expect(validateBrief({ ...VALID_RAW, typographyVoice: "comic" }, POOL)).toBeNull();
  });

  test("hero not in pool → field nulled, brief survives", () => {
    const brief = validateBrief({ ...VALID_RAW, heroImageId: "ghost" }, POOL);
    expect(brief.heroImageId).toBeNull();
    expect(brief.typographyVoice).toBe("editorial-serif");
  });

  test("invalid enums degrade fields without killing the brief", () => {
    const brief = validateBrief(
      { ...VALID_RAW, frontTreatment: "hologram", statsSide: "diagonal", bleedAppetite: "max" },
      POOL,
    );
    expect(brief.frontTreatment).toBeNull();
    expect(brief.statsSide).toBeNull();
    expect(brief.bleedAppetite).toBe("restrained");
  });

  test("rationale truncated to 400 chars; non-numeric axis kills the brief", () => {
    const brief = validateBrief({ ...VALID_RAW, rationale: "x".repeat(900) }, POOL);
    expect(brief.rationale).toHaveLength(400);
    expect(validateBrief({ ...VALID_RAW, energy: "vivid" }, POOL)).toBeNull();
  });
});

describe("getDesignBrief", () => {
  let getDesignBrief;
  let DIRECTOR_MODEL;

  beforeEach(() => {
    jest.resetModules();
    mockCreate.mockReset();
    process.env.GROQ_API_KEY = "test-key";
    ({ getDesignBrief, DIRECTOR_MODEL } = require("../composition/art-director"));
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
  });

  const input = () => ({
    profile: { first_name: "Ana", last_name: "Petrova" },
    castingAnalysis: { lookType: "editorial", marketSignals: ["editorial"] },
    archetype: { label: "Editorial" },
    poolSummary: POOL,
    statsBlock: { category: "women" },
    forensicsById: new Map([
      ["hs", { luma: { isDark: true }, warmth: 0.2, quiet: { top: { score: 0.9 }, bottom: { score: 0.3 } }, palette: [{ hex: "#222222" }] }],
    ]),
  });

  test("happy path: strict-schema request, validated brief returned", async () => {
    groqReturns(JSON.stringify(VALID_RAW));
    const brief = await getDesignBrief(input());
    expect(brief.typographyVoice).toBe("editorial-serif");

    const args = mockCreate.mock.calls[0][0];
    expect(args.model).toBe(DIRECTOR_MODEL);
    expect(args.response_format.type).toBe("json_schema");
    expect(args.response_format.json_schema.strict).toBe(true);
    // prompt carries pool ids + forensics, never the last name
    const user = args.messages.find((m) => m.role === "user").content;
    expect(user).toContain("hs |");
    expect(user).toContain("quietTop");
    expect(user).not.toContain("Petrova");
  });

  test("malformed JSON → null", async () => {
    groqReturns("not json at all");
    expect(await getDesignBrief(input())).toBeNull();
  });

  test("SDK rejection → null", async () => {
    mockCreate.mockRejectedValue(new Error("boom"));
    expect(await getDesignBrief(input())).toBeNull();
  });

  test("timeout → null", async () => {
    mockCreate.mockImplementation(() => new Promise(() => {}));
    expect(await getDesignBrief({ ...input(), timeoutMs: 60 })).toBeNull();
  });

  test("no API key → null without constructing a client", async () => {
    delete process.env.GROQ_API_KEY;
    jest.resetModules();
    const fresh = require("../composition/art-director");
    expect(await fresh.getDesignBrief(input())).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("empty pool → null without a call", async () => {
    expect(await getDesignBrief({ ...input(), poolSummary: [] })).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
