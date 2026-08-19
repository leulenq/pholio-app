"use strict";

const crypto = require("crypto");

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot contain a non-finite number");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

function sha256Canonical(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function packageHash({ manifest, taxonomy, specs }) {
  const revisionHashes = specs
    .map((spec) => [spec.revisionId, sha256Canonical(spec)])
    .sort(([left], [right]) => left.localeCompare(right));
  return sha256Canonical({ manifest, taxonomy, revisions: revisionHashes });
}

module.exports = {
  canonicalJson,
  packageHash,
  sha256Canonical,
};
