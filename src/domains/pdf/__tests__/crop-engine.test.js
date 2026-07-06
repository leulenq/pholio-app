const {
  resolveCrop,
  assignImagesToSlots,
  computeFocalPoint,
  FULL_BODY_CAUTION_LOSS,
  FULL_BODY_UNSAFE_LOSS,
} = require("../composition/crop-engine");
const { analyzeImagePool } = require("../composition/photo-intelligence");

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}

function poolImage(overrides = {}) {
  return {
    id: overrides.id || "img-1",
    src: "/uploads/x.jpg",
    role: null,
    aspect: null,
    width: null,
    height: null,
    shot_type: null,
    style_type: null,
    metadata: {},
    heroScore: 50,
    qualityScore: 50,
    ...overrides,
  };
}

describe("resolveCrop", () => {
  describe("focal source order", () => {
    test("metadata.focal wins over role heuristic", () => {
      const crop = resolveCrop(
        poolImage({
          role: "headshot",
          shot_type: "headshot",
          metadata: { focal: { x: 0.3, y: 0.6 } },
        }),
        { aspect: 1, kind: "cell" },
      );
      // unknown aspect → head-biased fallback: y capped at 35% so a
      // vertical crop can never start below the head
      expect(crop.objectPosition).toBe("30% 35%");
      expect(crop.safety.notes.join(" ")).toMatch(/metadata\.focal/);
    });

    test("metadata.focal works when metadata is a JSON string", () => {
      const crop = resolveCrop(
        poolImage({ metadata: JSON.stringify({ focal: { x: 0.2, y: 0.4 } }) }),
        { aspect: 1, kind: "cell" },
      );
      expect(crop.objectPosition).toBe("20% 35%");
    });

    test("invalid metadata.focal falls back to role heuristic", () => {
      const crop = resolveCrop(
        poolImage({
          role: "headshot",
          shot_type: "headshot",
          metadata: { focal: { x: "oops" } },
        }),
        { aspect: 1, kind: "cell" },
      );
      expect(crop.objectPosition).toBe("50% 18%");
    });

    test("role heuristics: headshot 18%, three_quarter 25%, editorial 35%, untyped center", () => {
      const slot = { aspect: 1, kind: "cell" };
      expect(
        resolveCrop(poolImage({ role: "headshot", shot_type: "headshot" }), slot)
          .objectPosition,
      ).toBe("50% 18%");
      expect(
        resolveCrop(
          poolImage({ role: "full_body", shot_type: "three_quarter" }),
          slot,
        ).objectPosition,
      ).toBe("50% 25%");
      expect(
        resolveCrop(poolImage({ role: "editorial", style_type: "editorial" }), slot)
          .objectPosition,
      ).toBe("50% 35%");
      // untyped/unknown-aspect: center x, head-biased y cap
      expect(resolveCrop(poolImage(), slot).objectPosition).toBe("50% 35%");
    });

    test("metadata.focal values are clamped to 0-1", () => {
      const crop = resolveCrop(
        poolImage({ metadata: { focal: { x: -2, y: 7 } } }),
        { aspect: 1, kind: "cell" },
      );
      expect(crop.objectPosition).toBe("0% 35%"); // y head-bias caps the clamp
    });
  });

  describe("geometry and coverage loss", () => {
    test("no crop when aspects match: zero coverage loss, safe", () => {
      const crop = resolveCrop(
        poolImage({ aspect: 0.647, width: 1294, height: 2000, shot_type: "headshot" }),
        { aspect: 0.647, kind: "hero" },
      );
      expect(crop.coverageLoss).toBe(0);
      expect(crop.safety.level).toBe("safe");
      expect(crop.fit).toBe("cover");
    });

    test("vertical crop coverage loss = 1 - imageAspect/slotAspect", () => {
      // image 0.5 into square slot: loses half the height
      const crop = resolveCrop(
        poolImage({ aspect: 0.5, width: 1000, height: 2000 }),
        { aspect: 1, kind: "cell" },
      );
      expect(crop.coverageLoss).toBeCloseTo(0.5, 3);
    });

    test("horizontal crop coverage loss = 1 - slotAspect/imageAspect", () => {
      const crop = resolveCrop(
        poolImage({ aspect: 1.5, width: 3000, height: 2000 }),
        { aspect: 0.75, kind: "cell" },
      );
      expect(crop.coverageLoss).toBeCloseTo(0.5, 3);
    });

    test("unknown dimensions: head-biased positioning, caution with note, zero loss", () => {
      const crop = resolveCrop(
        poolImage({ role: "headshot", shot_type: "headshot" }),
        { aspect: 1, kind: "cell" },
      );
      expect(crop.coverageLoss).toBe(0);
      expect(crop.safety.level).toBe("caution"); // containment unverifiable
      expect(crop.safety.notes.join(" ")).toMatch(/dimensions unknown/);
    });

    test("headshot vertical crop pins position toward the face (top)", () => {
      // headshot focal y=0.18, image 0.7 into square slot → strong upward bias
      const crop = resolveCrop(
        poolImage({ aspect: 0.7, width: 1400, height: 2000, shot_type: "headshot" }),
        { aspect: 1, kind: "cell" },
      );
      const y = Number(crop.objectPosition.split(" ")[1].replace("%", ""));
      expect(y).toBeLessThanOrEqual(18);
    });
  });

  describe("full-body guard thresholds", () => {
    const fullBody = (aspect) =>
      poolImage({
        role: "full_body",
        shot_type: "full_length",
        aspect,
        width: Math.round(aspect * 3000),
        height: 3000,
      });

    test("height loss <= 18% stays safe", () => {
      // aspect 0.6 into 0.66 slot → loss ≈ 9.1%
      const crop = resolveCrop(fullBody(0.6), { aspect: 0.66, kind: "cell" });
      expect(crop.safety.level).toBe("safe");
    });

    test("height loss between 18% and 30% degrades to caution", () => {
      // aspect 0.6 into 0.78 slot → loss ≈ 23.1%
      const crop = resolveCrop(fullBody(0.6), { aspect: 0.78, kind: "cell" });
      expect(crop.safety.level).toBe("caution");
      expect(crop.safety.notes.join(" ")).toMatch(/>18%/);
    });

    test("height loss above 30% is unsafe", () => {
      // aspect 0.6 into square slot → loss = 40%
      const crop = resolveCrop(fullBody(0.6), { aspect: 1, kind: "cell" });
      expect(crop.safety.level).toBe("unsafe");
      expect(crop.safety.notes.join(" ")).toMatch(/>30%/);
    });

    test("caution crop biases vertical position upward to keep the head", () => {
      const crop = resolveCrop(fullBody(0.6), { aspect: 0.78, kind: "cell" });
      const y = Number(crop.objectPosition.split(" ")[1].replace("%", ""));
      expect(y).toBeLessThanOrEqual(35);
      expect(crop.safety.notes.join(" ")).toMatch(/keep head/);
    });

    test("horizontal crop of a full-body image does not trip the guard", () => {
      // image wider than slot: height fully visible
      const crop = resolveCrop(
        poolImage({
          role: "full_body",
          shot_type: "full_length",
          aspect: 0.8,
          width: 2400,
          height: 3000,
        }),
        { aspect: 0.6, kind: "cell" },
      );
      expect(crop.safety.level).toBe("safe");
    });

    test("thresholds match the spec constants", () => {
      expect(FULL_BODY_CAUTION_LOSS).toBeCloseTo(0.18);
      expect(FULL_BODY_UNSAFE_LOSS).toBeCloseTo(0.3);
    });
  });
});

describe("assignImagesToSlots", () => {
  const HERO_SLOT = { aspect: 0.647, role: "headshot", kind: "hero" };

  function buildPoolAnalysis() {
    return analyzeImagePool({
      images: [
        {
          id: "head",
          path: "/h.jpg",
          sort: 1,
          shot_type: "headshot",
          width: 2000,
          height: 3000,
          is_primary: true,
        },
        {
          id: "full",
          path: "/f.jpg",
          sort: 2,
          shot_type: "full_length",
          width: 1800,
          height: 3000,
        },
        {
          id: "edit",
          path: "/e.jpg",
          sort: 3,
          style_type: "editorial",
          width: 2000,
          height: 2400,
        },
        {
          id: "life",
          path: "/l.jpg",
          sort: 4,
          style_type: "lifestyle",
          width: 2000,
          height: 2000,
        },
      ],
    });
  }

  const SLOTS = [
    HERO_SLOT,
    { aspect: 0.6, role: "full_body", kind: "cell" }, // tallest cell
    { aspect: 1.0, role: null, kind: "cell" }, // square cell
    { aspect: 0.9, role: null, kind: "cell" },
  ];

  test("returns one entry per slot in original order", () => {
    const result = assignImagesToSlots(buildPoolAnalysis(), SLOTS, { seed: "s1" });
    expect(result.map((r) => r.slotIndex)).toEqual([0, 1, 2, 3]);
    result.forEach((r) => {
      expect(r.imageId).not.toBeNull();
      expect(r.crop).toHaveProperty("objectPosition");
    });
  });

  test("full_body lands in the tallest cell, hero gets the top-ranked headshot", () => {
    const result = assignImagesToSlots(buildPoolAnalysis(), SLOTS, { seed: 7 });
    const bySlot = Object.fromEntries(result.map((r) => [r.slotIndex, r.imageId]));
    expect(bySlot[0]).toBe("head"); // hero slot
    expect(bySlot[1]).toBe("full"); // tallest cell
  });

  test("avoids unsafe assignments when a safer candidate exists", () => {
    // full_body image aspect 0.6: unsafe in the square slot (40% height loss),
    // safe in the tall slot. Both available; full must avoid the square slot.
    const pa = analyzeImagePool({
      images: [
        {
          id: "full",
          path: "/f.jpg",
          sort: 1,
          shot_type: "full_length",
          width: 1800,
          height: 3000,
        },
        {
          id: "head",
          path: "/h.jpg",
          sort: 2,
          shot_type: "headshot",
          width: 2000,
          height: 2400,
        },
      ],
    });
    const slots = [
      { aspect: 1.0, role: null, kind: "cell" },
      { aspect: 0.62, role: null, kind: "cell" },
    ];
    for (let i = 0; i < 25; i++) {
      const result = assignImagesToSlots(pa, slots, { seed: `avoid-${i}` });
      const squareSlot = result.find((r) => r.slotIndex === 0);
      expect(squareSlot.imageId).toBe("head");
      const tallSlot = result.find((r) => r.slotIndex === 1);
      expect(tallSlot.imageId).toBe("full");
      expect(tallSlot.crop.safety.level).not.toBe("unsafe");
    }
  });

  test("honors locks { heroId, gridIds } even against scoring preference", () => {
    const result = assignImagesToSlots(buildPoolAnalysis(), SLOTS, {
      seed: "lock-seed",
      locks: { heroId: "edit", gridIds: ["life", null, null] },
    });
    const bySlot = Object.fromEntries(result.map((r) => [r.slotIndex, r.imageId]));
    expect(bySlot[0]).toBe("edit"); // hero lock
    expect(bySlot[1]).toBe("life"); // first cell lock
    // remaining images still placed, no duplicates
    const ids = result.map((r) => r.imageId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("unknown lock ids are ignored gracefully", () => {
    const result = assignImagesToSlots(buildPoolAnalysis(), SLOTS, {
      seed: "x",
      locks: { heroId: "does-not-exist", gridIds: [] },
    });
    expect(result.find((r) => r.slotIndex === 0).imageId).toBe("head");
  });

  test("deterministic: same seed twice gives deep-equal output", () => {
    const a = assignImagesToSlots(buildPoolAnalysis(), SLOTS, { seed: "det-1" });
    const b = assignImagesToSlots(buildPoolAnalysis(), SLOTS, { seed: "det-1" });
    expect(a).toEqual(b);
  });

  test("different seeds can vary assignments when ties exist", () => {
    const pa = analyzeImagePool({
      images: [
        { id: "u1", path: "/1.jpg", sort: 1, width: 2000, height: 2000 },
        { id: "u2", path: "/2.jpg", sort: 1, width: 2000, height: 2000 },
        { id: "u3", path: "/3.jpg", sort: 1, width: 2000, height: 2000 },
      ],
    });
    const slots = [
      { aspect: 1, role: null, kind: "cell" },
      { aspect: 1, role: null, kind: "cell" },
    ];
    const variants = new Set();
    for (let i = 0; i < 40; i++) {
      variants.add(
        assignImagesToSlots(pa, slots, { seed: `v-${i}` })
          .map((r) => r.imageId)
          .join("|"),
      );
    }
    expect(variants.size).toBeGreaterThan(1);
  });

  test("more slots than images leaves trailing slots empty (null)", () => {
    const pa = analyzeImagePool({
      images: [{ id: "only", path: "/o.jpg", sort: 1, width: 2000, height: 3000 }],
    });
    const result = assignImagesToSlots(pa, SLOTS, { seed: 1 });
    const filled = result.filter((r) => r.imageId !== null);
    expect(filled).toHaveLength(1);
    result
      .filter((r) => r.imageId === null)
      .forEach((r) => expect(r.crop).toBeNull());
  });

  test("empty pool / empty slots are handled", () => {
    expect(assignImagesToSlots({ pool: [] }, [HERO_SLOT])).toEqual([
      { slotIndex: 0, imageId: null, crop: null },
    ]);
    expect(assignImagesToSlots(null, null)).toEqual([]);
  });
});

describe("computeFocalPoint", () => {
  const maybeTest = sharp ? test : test.skip;

  maybeTest("finds focal point near a bright region (sharp attention)", async () => {
    // 400x800 dark canvas with a bright square near the bottom-left.
    const overlay = await sharp({
      create: { width: 80, height: 80, channels: 3, background: { r: 250, g: 250, b: 250 } },
    })
      .png()
      .toBuffer();
    const buffer = await sharp({
      create: { width: 400, height: 800, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .composite([{ input: overlay, left: 40, top: 600 }])
      .png()
      .toBuffer();

    const focal = await computeFocalPoint(buffer);
    expect(focal).not.toBeNull();
    expect(focal.x).toBeGreaterThanOrEqual(0);
    expect(focal.x).toBeLessThanOrEqual(1);
    // Bright square center is at y = 640/800 = 0.8 → expect lower half.
    expect(focal.y).toBeGreaterThan(0.5);
  });

  maybeTest("is deterministic for the same buffer", async () => {
    const buffer = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 120, g: 90, b: 60 } },
    })
      .png()
      .toBuffer();
    const a = await computeFocalPoint(buffer);
    const b = await computeFocalPoint(buffer);
    expect(a).toEqual(b);
  });

  test("returns null for invalid input without throwing", async () => {
    expect(await computeFocalPoint(null)).toBeNull();
    expect(await computeFocalPoint(Buffer.alloc(0))).toBeNull();
    expect(await computeFocalPoint("not a buffer")).toBeNull();
    expect(await computeFocalPoint(Buffer.from("garbage bytes"))).toBeNull();
  });
});

// ── Head containment (hard guarantee) ──────────────────────────────────────
// Positioning the focal point is not the same as keeping the head in frame:
// a portrait cover-cropped into a wide cell must never slice the face.
describe("resolveCrop head containment", () => {
  const { resolveCrop } = require("../composition/crop-engine");

  function windowY0(crop, imageAspect, slotAspect) {
    const m = /\s(\d+)%$/.exec(crop.objectPosition);
    const posY = Number(m[1]) / 100;
    const heightLoss = 1 - imageAspect / slotAspect;
    return heightLoss * posY;
  }

  test("portrait with a high face in a landscape cell keeps the crown in frame", () => {
    // face high in frame (focal y 0.14, like a standing three-quarter)
    const img = {
      aspect: 2 / 3,
      metadata: JSON.stringify({ focal: { x: 0.5, y: 0.14 } }),
      shot_type: "three_quarter",
    };
    const crop = resolveCrop(img, { aspect: 1.4, kind: "cell" });
    const y0 = windowY0(crop, 2 / 3, 1.4);
    // visible window must start at/above the head top (focal − 0.13)
    expect(y0).toBeLessThanOrEqual(0.14 - 0.13 + 1e-6);
  });

  test("mid-frame face stays fully inside the window", () => {
    const img = {
      aspect: 2 / 3,
      metadata: JSON.stringify({ focal: { x: 0.5, y: 0.4 } }),
      shot_type: "editorial",
    };
    const slotAspect = 1.2;
    const crop = resolveCrop(img, { aspect: slotAspect, kind: "cell" });
    const y0 = windowY0(crop, 2 / 3, slotAspect);
    const visH = (2 / 3) / slotAspect;
    expect(y0).toBeLessThanOrEqual(0.4 - 0.13 + 1e-6);
    expect(y0 + visH).toBeGreaterThanOrEqual(0.4 + 0.08 - 1e-6);
  });

  test("unknown aspect degrades to head-biased caution, never raw focal", () => {
    const img = {
      metadata: JSON.stringify({ focal: { x: 0.5, y: 0.6 } }),
      shot_type: "headshot",
    };
    const crop = resolveCrop(img, { aspect: 1.4, kind: "cell" });
    expect(crop.safety.level).toBe("caution");
    const m = /\s(\d+)%$/.exec(crop.objectPosition);
    expect(Number(m[1])).toBeLessThanOrEqual(35);
  });
});
