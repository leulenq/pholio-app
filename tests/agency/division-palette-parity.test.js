"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Guards the class of bug that shipped silently once already.
 *
 * `DivisionMark` sets `--p: var(--dv-<pigment>)`. If the resolver emits a
 * pigment key with no matching token, the custom property is invalid at
 * computed-value time, `color-mix()` fails, and the mark renders with NO
 * FILL — no error, no console warning. The Main Board mark, the flagship
 * board on a roster, did exactly this when the palette was renamed and
 * `pigment: 'main'` was left pointing at a `--dv-mainboard` that did not
 * exist under that name.
 *
 * These files are plain enough to parse without a bundler, which is the
 * point: the check has to run in CI, not in a browser.
 */

const ROOT = path.join(__dirname, "..", "..");
const DIVISIONS_JS = path.join(
  ROOT,
  "client/src/domains/agency/components/status/divisions.js",
);
const PALETTE_CSS = path.join(ROOT, "client/src/styles/division-palette.css");
const MARKS_CSS = path.join(
  ROOT,
  "client/src/domains/agency/components/status/division-marks.css",
);

const read = (p) => fs.readFileSync(p, "utf8");

/** Token names defined by the generated palette. */
function paletteTokens() {
  return new Set(
    [...read(PALETTE_CSS).matchAll(/--dv-([a-z0-9]+)\s*:/g)].map((m) => m[1]),
  );
}

/** Every pigment key the resolver can emit: division keys + fallbacks. */
function pigmentKeys() {
  const src = read(DIVISIONS_JS);

  const block = src.slice(
    src.indexOf("export const DIVISIONS = {"),
    src.indexOf("export const TYPESETS"),
  );
  const divisionKeys = [...block.matchAll(/^\s{2}([a-z][a-z0-9]*):\s*D\(/gm)].map(
    (m) => m[1],
  );

  const fallbackBlock = src.slice(
    src.indexOf("const FALLBACK_PIGMENTS = ["),
    src.indexOf("/** Stable hash"),
  );
  const fallbacks = [...fallbackBlock.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

  return { divisionKeys, fallbacks };
}

describe("division palette parity", () => {
  const tokens = paletteTokens();
  const { divisionKeys, fallbacks } = pigmentKeys();

  it("parses a non-trivial taxonomy and palette", () => {
    expect(divisionKeys.length).toBeGreaterThanOrEqual(20);
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(tokens.size).toBeGreaterThanOrEqual(20);
  });

  it("defines a --dv-* token for every division key", () => {
    const missing = divisionKeys.filter((k) => !tokens.has(k));
    expect(missing).toEqual([]);
  });

  it("defines a --dv-* token for every fallback pigment", () => {
    const missing = fallbacks.filter((k) => !tokens.has(k));
    expect(missing).toEqual([]);
  });

  it("defines the unassigned token used when no board is set", () => {
    expect(tokens.has("unassigned")).toBe(true);
  });

  it("has no orphaned palette tokens", () => {
    const used = new Set([...divisionKeys, ...fallbacks, "unassigned"]);
    const orphans = [...tokens].filter((t) => !used.has(t));
    expect(orphans).toEqual([]);
  });

  it("defines a .dvt--* rule for every typeset a division references", () => {
    const src = read(DIVISIONS_JS);
    const block = src.slice(
      src.indexOf("export const DIVISIONS = {"),
      src.indexOf("export const TYPESETS"),
    );
    const sets = new Set(
      [...block.matchAll(/BOARD_KIND\.[A-Z]+,\s*'([a-z]+)'/g)].map((m) => m[1]),
    );
    // The fallback typeset must exist too — unknown agency boards use it.
    sets.add("plain");

    const css = read(MARKS_CSS);
    const defined = new Set(
      [...css.matchAll(/\.dvt--([a-z]+)\s*\{/g)].map((m) => m[1]),
    );

    expect(sets.size).toBeGreaterThan(5);
    const missing = [...sets].filter((s) => !defined.has(s));
    expect(missing).toEqual([]);
  });

  it("defines a .dv--* ground for every standing ink", () => {
    const src = read(DIVISIONS_JS);
    const block = src.slice(
      src.indexOf("export const STANDINGS = {"),
      src.indexOf("/** Backend status strings"),
    );
    const inks = new Set([...block.matchAll(/ink:\s*'([a-z]+)'/g)].map((m) => m[1]));

    const css = read(MARKS_CSS);
    const defined = new Set([...css.matchAll(/\.dv--([a-z]+)\s*\{/g)].map((m) => m[1]));

    expect(inks.size).toBeGreaterThanOrEqual(7);
    const missing = [...inks].filter((i) => !defined.has(i));
    expect(missing).toEqual([]);
  });
});
