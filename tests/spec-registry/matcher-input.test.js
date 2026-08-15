"use strict";

const {
  isEligibleImage,
  normalizeDeliverySizeBytes,
  normalizeWorkAuthorization,
  parseJson,
  socialMap,
  uniqueStringIds,
} = require("../../src/domains/spec-registry/matcher-input");

describe("Spec Registry matcher input helpers", () => {
  test("filters inactive, excluded, video, and retired images", () => {
    expect(isEligibleImage({ status: "active", asset_kind: "image" })).toBe(true);
    expect(isEligibleImage({ status: "inactive", asset_kind: "image" })).toBe(false);
    expect(isEligibleImage({ status: "active", exclude_from_agency: true })).toBe(false);
    expect(isEligibleImage({ status: "active", asset_kind: "video" })).toBe(false);
    expect(isEligibleImage({ status: "active", asset_kind: "image", retired_at: "2026-01-01" })).toBe(false);
  });

  test("normalizes only explicit valid image IDs deterministically", () => {
    expect(uniqueStringIds(["b", "a", "b", "", 1, " c "])).toEqual(["a", "b", "c"]);
    expect(uniqueStringIds(null)).toBeNull();
  });

  test("parses metadata safely and maps each social platform once", () => {
    expect(parseJson("not json")).toEqual({});
    expect(parseJson('{"ai":{"classification":{"source":"user"}}}').ai.classification.source).toBe("user");
    expect(socialMap([{ platform: "instagram", handle: "first" }, { platform: "instagram", handle: "second" }, { platform: "tiktok", url: "https://tiktok.example" }, { platform: "twitter", handle: "pholio" }])).toEqual({ instagram: "first", tiktok: "https://tiktok.example", x: "pholio" });
  });

  test("normalizes persisted work eligibility representations", () => {
    expect(normalizeWorkAuthorization("Yes")).toBe(true);
    expect(normalizeWorkAuthorization("No")).toBe(false);
    expect(normalizeWorkAuthorization(1)).toBe(true);
    expect(normalizeWorkAuthorization(null)).toBeNull();
  });

  test("normalizes PostgreSQL BIGINT delivery sizes to safe numeric matcher facts", () => {
    expect(normalizeDeliverySizeBytes("30000000")).toBe(30000000);
    expect(normalizeDeliverySizeBytes(30000000n)).toBe(30000000);
    expect(normalizeDeliverySizeBytes("0")).toBeNull();
    expect(normalizeDeliverySizeBytes("1.5")).toBeNull();
    expect(normalizeDeliverySizeBytes("9007199254740992")).toBeNull();
  });
});
