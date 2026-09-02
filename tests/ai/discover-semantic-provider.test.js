"use strict";

/**
 * Lane E — the embedding provider seam (src/domains/ai/embedding-provider.js).
 *
 * CI never calls a provider: every network path here runs against an injected
 * `fetchImpl`, and the injected-embedder seam (`__setEmbedder`) is proved to
 * short-circuit the network entirely.
 *
 * Covers: the fail-closed feature flag, the test seam, the deterministic
 * hash embedder (unit norm, stable, vocabulary-sensitive), the OpenAI request
 * shape and its re-sort by `index`, the Voyage query/document asymmetry, and
 * batching over MAX_BATCH (64).
 */

const config = require("../../src/config");
const provider = require("../../src/domains/ai/embedding-provider");

const { embedTexts, hashEmbedder, __setEmbedder, EMBEDDING_DIMENSIONS } = provider;

const ON = { PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "true" };
const OFF = {};

/** A fetch stand-in that records its calls and replays queued responses. */
function makeFetch(responder) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return responder(calls.length - 1, JSON.parse(init.body));
  };
  impl.calls = calls;
  return impl;
}

function okJson(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

const savedConfig = {
  provider: config.embedding.provider,
  openaiModel: config.embedding.openaiModel,
  voyageModel: config.embedding.voyageModel,
  voyageApiKey: config.embedding.voyageApiKey,
  openaiKey: config.openai.apiKey,
};

afterEach(() => {
  __setEmbedder(null);
  config.embedding.provider = savedConfig.provider;
  config.embedding.openaiModel = savedConfig.openaiModel;
  config.embedding.voyageModel = savedConfig.voyageModel;
  config.embedding.voyageApiKey = savedConfig.voyageApiKey;
  config.openai.apiKey = savedConfig.openaiKey;
});

describe("embedTexts — the feature flag fails closed", () => {
  test("throws when PHOLIO_ENABLE_PROFILE_EMBEDDINGS is not 'true'", async () => {
    await expect(embedTexts(["a brief"], { env: OFF })).rejects.toThrow(
      /profile embedding feature is disabled/,
    );
    await expect(
      embedTexts(["a brief"], { env: { PHOLIO_ENABLE_PROFILE_EMBEDDINGS: "1" } }),
    ).rejects.toThrow(/disabled/);
  });

  test("no provider call is attempted while the flag is off", async () => {
    const fetchImpl = makeFetch(() => okJson({ data: [] }));
    await expect(
      embedTexts(["a brief"], { env: OFF, fetchImpl }),
    ).rejects.toThrow();
    expect(fetchImpl.calls).toHaveLength(0);
  });

  test("featureEnabled reads the flag it is given", () => {
    expect(provider.featureEnabled(ON)).toBe(true);
    expect(provider.featureEnabled(OFF)).toBe(false);
  });
});

describe("__setEmbedder — the test seam", () => {
  test("an injected embedder answers instead of the network", async () => {
    const fake = jest.fn(async (inputs, kind) =>
      inputs.map((text, i) => [text.length, i, kind === "query" ? 1 : 0]),
    );
    __setEmbedder(fake);
    const fetchImpl = makeFetch(() => okJson({ data: [] }));

    const vectors = await embedTexts(["one", "twotwo"], {
      env: ON,
      kind: "query",
      fetchImpl,
    });

    expect(fetchImpl.calls).toHaveLength(0);
    expect(fake).toHaveBeenCalledTimes(1);
    expect(fake.mock.calls[0][0]).toEqual(["one", "twotwo"]);
    expect(fake.mock.calls[0][1]).toBe("query");
    expect(vectors).toEqual([
      [3, 0, 1],
      [6, 1, 1],
    ]);
  });

  test("__setEmbedder(null) restores the real path", async () => {
    __setEmbedder(hashEmbedder());
    __setEmbedder(null);
    config.openai.apiKey = "sk-test";
    const fetchImpl = makeFetch(() =>
      okJson({ data: [{ index: 0, embedding: [0.5, 0.5] }] }),
    );
    await embedTexts(["hello"], { env: ON, fetchImpl });
    expect(fetchImpl.calls).toHaveLength(1);
  });

  test("a single string is accepted and comes back as one vector", async () => {
    __setEmbedder(hashEmbedder(8));
    const vectors = await embedTexts("a single brief", { env: ON });
    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toHaveLength(8);
  });

  test("an empty input list never reaches a provider", async () => {
    const fake = jest.fn();
    __setEmbedder(fake);
    expect(await embedTexts([], { env: ON })).toEqual([]);
    expect(fake).not.toHaveBeenCalled();
  });
});

describe("hashEmbedder — deterministic, unit-norm, vocabulary-sensitive", () => {
  const embed = hashEmbedder();

  test("the same text always yields the same vector", async () => {
    const [a] = await embed(["editorial new face, strong bone structure"]);
    const [b] = await embed(["editorial new face, strong bone structure"]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  test("vectors are unit length", async () => {
    const vectors = await embed([
      "commercial warmth and a natural smile",
      "avant-garde sculptural styling",
    ]);
    for (const vec of vectors) {
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1, 10);
    }
  });

  test("texts sharing words land closer than unrelated texts", async () => {
    const [query, shared, unrelated] = await embed([
      "girl next door commercial warmth approachable natural",
      "approachable natural warmth for commercial lifestyle campaigns",
      "sculptural avant-garde couture presentation hard directional light",
    ]);
    expect(cosine(query, shared)).toBeGreaterThan(cosine(query, unrelated));
    expect(cosine(query, shared)).toBeGreaterThan(0.3);
  });

  test("the dimension count is configurable and defaults to 512", async () => {
    const [wide] = await hashEmbedder()(["editorial"]);
    const [narrow] = await hashEmbedder(16)(["editorial"]);
    expect(wide).toHaveLength(512);
    expect(narrow).toHaveLength(16);
  });
});

describe("OpenAI adapter", () => {
  beforeEach(() => {
    config.embedding.provider = "openai";
    config.openai.apiKey = "sk-test-key";
  });

  test("builds the documented request and re-sorts results by index", async () => {
    const fetchImpl = makeFetch(() =>
      // Deliberately out of order: the adapter must restore input order.
      okJson({
        data: [
          { index: 2, embedding: [0.3] },
          { index: 0, embedding: [0.1] },
          { index: 1, embedding: [0.2] },
        ],
      }),
    );

    const vectors = await embedTexts(["first", "second", "third"], {
      env: ON,
      kind: "document",
      fetchImpl,
    });

    expect(fetchImpl.calls).toHaveLength(1);
    const call = fetchImpl.calls[0];
    expect(call.url).toBe("https://api.openai.com/v1/embeddings");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers.Authorization).toBe("Bearer sk-test-key");
    expect(call.init.headers["Content-Type"]).toBe("application/json");
    expect(call.body).toEqual({
      model: "text-embedding-3-small",
      input: ["first", "second", "third"],
      dimensions: 512,
    });
    expect(vectors).toEqual([[0.1], [0.2], [0.3]]);
  });

  test("honours OPENAI_EMBED_MODEL through config", async () => {
    config.embedding.openaiModel = "text-embedding-3-large";
    const fetchImpl = makeFetch(() =>
      okJson({ data: [{ index: 0, embedding: [1] }] }),
    );
    await embedTexts(["x"], { env: ON, fetchImpl });
    expect(fetchImpl.calls[0].body.model).toBe("text-embedding-3-large");
  });

  test("a missing key throws before any request", async () => {
    config.openai.apiKey = "";
    const savedEnvKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const fetchImpl = makeFetch(() => okJson({ data: [] }));
    try {
      await expect(embedTexts(["x"], { env: ON, fetchImpl })).rejects.toThrow(
        /OPENAI_API_KEY not set/,
      );
      expect(fetchImpl.calls).toHaveLength(0);
    } finally {
      if (savedEnvKey !== undefined) process.env.OPENAI_API_KEY = savedEnvKey;
    }
  });

  test("a non-ok response surfaces status and body", async () => {
    const fetchImpl = makeFetch(() => ({
      ok: false,
      status: 429,
      text: async () => "rate limited",
      json: async () => ({}),
    }));
    await expect(embedTexts(["x"], { env: ON, fetchImpl })).rejects.toThrow(
      /OpenAI 429: rate limited/,
    );
  });

  test("inputs are truncated to the provider's character budget", async () => {
    const fetchImpl = makeFetch(() =>
      okJson({ data: [{ index: 0, embedding: [1] }] }),
    );
    await embedTexts(["x".repeat(20000)], { env: ON, fetchImpl });
    expect(fetchImpl.calls[0].body.input[0]).toHaveLength(8000);
  });
});

describe("Voyage adapter", () => {
  beforeEach(() => {
    config.embedding.provider = "voyage";
    config.embedding.voyageApiKey = "voyage-test-key";
  });

  test("sends input_type 'query' and the 512 output dimension", async () => {
    const fetchImpl = makeFetch(() =>
      okJson({ data: [{ index: 0, embedding: [0.9] }] }),
    );
    const vectors = await embedTexts(["clean beauty, girl next door"], {
      env: ON,
      kind: "query",
      fetchImpl,
    });
    const call = fetchImpl.calls[0];
    expect(call.url).toBe("https://api.voyageai.com/v1/embeddings");
    expect(call.init.headers.Authorization).toBe("Bearer voyage-test-key");
    expect(call.body).toEqual({
      model: "voyage-4-lite",
      input: ["clean beauty, girl next door"],
      input_type: "query",
      output_dimension: 512,
    });
    expect(vectors).toEqual([[0.9]]);
  });

  test("sends input_type 'document' for chunks (and for an unstated kind)", async () => {
    const fetchImpl = makeFetch(() =>
      okJson({ data: [{ index: 0, embedding: [0.1] }] }),
    );
    await embedTexts(["a bio sentence"], { env: ON, kind: "document", fetchImpl });
    await embedTexts(["a bio sentence"], { env: ON, fetchImpl });
    expect(fetchImpl.calls.map((c) => c.body.input_type)).toEqual([
      "document",
      "document",
    ]);
  });

  test("results are re-sorted by index like the OpenAI path", async () => {
    const fetchImpl = makeFetch(() =>
      okJson({
        data: [
          { index: 1, embedding: [2] },
          { index: 0, embedding: [1] },
        ],
      }),
    );
    const vectors = await embedTexts(["a", "b"], { env: ON, fetchImpl });
    expect(vectors).toEqual([[1], [2]]);
  });

  test("a missing key throws before any request", async () => {
    config.embedding.voyageApiKey = "";
    const savedEnvKey = process.env.VOYAGE_API_KEY;
    delete process.env.VOYAGE_API_KEY;
    const fetchImpl = makeFetch(() => okJson({ data: [] }));
    try {
      await expect(embedTexts(["x"], { env: ON, fetchImpl })).rejects.toThrow(
        /VOYAGE_API_KEY not set/,
      );
      expect(fetchImpl.calls).toHaveLength(0);
    } finally {
      if (savedEnvKey !== undefined) process.env.VOYAGE_API_KEY = savedEnvKey;
    }
  });

  test("modelName follows the selected provider", () => {
    expect(provider.providerName()).toBe("voyage");
    expect(provider.modelName()).toBe("voyage-4-lite");
    config.embedding.provider = "openai";
    expect(provider.modelName()).toBe("text-embedding-3-small");
  });
});

describe("batching", () => {
  test("70 inputs are sent as 64 + 6 and returned in one flat, ordered list", async () => {
    config.embedding.provider = "openai";
    config.openai.apiKey = "sk-test-key";
    const inputs = Array.from({ length: 70 }, (_, i) => `chunk number ${i}`);
    const fetchImpl = makeFetch((callIndex, body) =>
      okJson({
        data: body.input.map((text, i) => ({
          index: i,
          embedding: [callIndex, i, text.length],
        })),
      }),
    );

    const vectors = await embedTexts(inputs, { env: ON, fetchImpl });

    expect(fetchImpl.calls).toHaveLength(2);
    expect(fetchImpl.calls[0].body.input).toHaveLength(64);
    expect(fetchImpl.calls[1].body.input).toHaveLength(6);
    expect(fetchImpl.calls[0].body.input[0]).toBe("chunk number 0");
    expect(fetchImpl.calls[1].body.input[0]).toBe("chunk number 64");
    expect(vectors).toHaveLength(70);
    // First batch carries callIndex 0, second carries 1; positions are local.
    expect(vectors[0].slice(0, 2)).toEqual([0, 0]);
    expect(vectors[63].slice(0, 2)).toEqual([0, 63]);
    expect(vectors[64].slice(0, 2)).toEqual([1, 0]);
    expect(vectors[69].slice(0, 2)).toEqual([1, 5]);
  });

  test("exactly 64 inputs are a single batch", async () => {
    config.embedding.provider = "openai";
    config.openai.apiKey = "sk-test-key";
    const fetchImpl = makeFetch((callIndex, body) =>
      okJson({ data: body.input.map((_, i) => ({ index: i, embedding: [i] })) }),
    );
    await embedTexts(
      Array.from({ length: 64 }, (_, i) => `t${i}`),
      { env: ON, fetchImpl },
    );
    expect(fetchImpl.calls).toHaveLength(1);
  });

  test("the Voyage path batches identically and keeps input_type", async () => {
    config.embedding.provider = "voyage";
    config.embedding.voyageApiKey = "voyage-test-key";
    const fetchImpl = makeFetch((callIndex, body) =>
      okJson({ data: body.input.map((_, i) => ({ index: i, embedding: [i] })) }),
    );
    await embedTexts(
      Array.from({ length: 65 }, (_, i) => `t${i}`),
      { env: ON, kind: "query", fetchImpl },
    );
    expect(fetchImpl.calls).toHaveLength(2);
    expect(fetchImpl.calls.every((c) => c.body.input_type === "query")).toBe(true);
  });
});
