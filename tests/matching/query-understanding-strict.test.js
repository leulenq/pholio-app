"use strict";

const mockCreate = jest.fn();

jest.mock("groq-sdk", () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
);

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || "test-key";

const {
  understandQuery,
  groqDecomposeQuery,
  clearQueryCache,
  UNDERSTANDING_SCHEMA,
} = require("../../src/domains/agency/services/query-understanding");

// Groq strict-mode legality: every object requires every property and closes
// additionalProperties; optionality only via nullable type unions.
function assertStrictLegal(node, path = "schema") {
  if (!node || typeof node !== "object") return;
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes("object")) {
    expect({ path, additionalProperties: node.additionalProperties }).toEqual({
      path,
      additionalProperties: false,
    });
    const keys = Object.keys(node.properties || {}).sort();
    expect({ path, required: [...(node.required || [])].sort() }).toEqual({
      path,
      required: keys,
    });
    for (const [key, child] of Object.entries(node.properties || {})) {
      assertStrictLegal(child, `${path}.${key}`);
    }
  }
  if (types.includes("array") && node.items) {
    assertStrictLegal(node.items, `${path}[]`);
  }
}

const CANNED_RESPONSE = {
  residual_query: "sharp jawline severe profile",
  attributes: [{ type: "visual", term: "sharp jawline", confidence: 0.9 }],
  constraints: [
    { field: "archetype", value: "Editorial", confidence: 0.7, mode: "soft" },
    { field: "min_height", value: 175, confidence: 0.75, mode: "soft" },
  ],
  channel_queries: {
    visual: "sharp jawline angular bone structure",
    casting: "editorial casting presence",
    market: "editorial market fit",
    lexical: "sharp jawline editorial",
  },
};

function mockCompletion(payload) {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  });
}

beforeEach(() => {
  mockCreate.mockReset();
  clearQueryCache();
});

describe("UNDERSTANDING_SCHEMA (Groq strict mode)", () => {
  test("is a strict json_schema envelope", () => {
    expect(UNDERSTANDING_SCHEMA.name).toBe("discover_query_understanding");
    expect(UNDERSTANDING_SCHEMA.strict).toBe(true);
    expect(UNDERSTANDING_SCHEMA.schema).toBeDefined();
  });

  test("every object node is strict-legal (all required, closed)", () => {
    assertStrictLegal(UNDERSTANDING_SCHEMA.schema);
  });

  test("covers the existing parse shape exactly", () => {
    const props = UNDERSTANDING_SCHEMA.schema.properties;
    expect(Object.keys(props).sort()).toEqual([
      "attributes",
      "channel_queries",
      "constraints",
      "residual_query",
    ]);
    expect(Object.keys(props.channel_queries.properties).sort()).toEqual([
      "casting",
      "lexical",
      "market",
      "visual",
    ]);
    expect(props.constraints.items.properties.field.enum).toEqual([
      "gender",
      "heritage",
      "hair_color",
      "eye_color",
      "min_height",
      "archetype",
      "city",
    ]);
    expect(props.attributes.items.properties.type.enum).toEqual([
      "visual",
      "casting",
      "vibe",
      "demographic",
    ]);
  });
});

describe("groqDecomposeQuery request shape", () => {
  test("sends response_format json_schema with strict:true", async () => {
    mockCompletion(CANNED_RESPONSE);

    await groqDecomposeQuery("sharp jawline editorial");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const req = mockCreate.mock.calls[0][0];
    expect(req.response_format).toEqual({
      type: "json_schema",
      json_schema: UNDERSTANDING_SCHEMA,
    });
    expect(req.temperature).toBe(0.1);
    expect(req.max_completion_tokens).toBeGreaterThan(0);
    expect(req.messages).toHaveLength(2);
  });

  test("normalizes the strict response to the existing shape", async () => {
    mockCompletion(CANNED_RESPONSE);

    const result = await groqDecomposeQuery("sharp jawline editorial");

    expect(result.source).toBe("groq");
    expect(result.residual_query).toBe("sharp jawline severe profile");
    expect(result.attributes).toEqual(CANNED_RESPONSE.attributes);
    expect(result.constraints).toEqual(CANNED_RESPONSE.constraints);
    expect(result.channel_queries).toEqual(CANNED_RESPONSE.channel_queries);
  });
});

describe("understandQuery cache and fallback (unchanged behavior)", () => {
  test("caches results for repeated queries", async () => {
    mockCompletion(CANNED_RESPONSE);

    const first = await understandQuery("sharp jawline editorial");
    const second = await understandQuery("Sharp Jawline Editorial "); // case/space-insensitive key

    expect(first).toBe(second);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test("falls back to the regex decomposition when Groq fails", async () => {
    mockCreate.mockRejectedValue(new Error("model unavailable"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await understandQuery("tall editorial female");

    expect(result.source).toBe("intent_parser");
    expect(result.channel_queries.lexical).toBeTruthy();
    warn.mockRestore();
  });

  test("empty query short-circuits without a model call", async () => {
    const result = await understandQuery("   ");
    expect(result.source).toBe("empty");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
