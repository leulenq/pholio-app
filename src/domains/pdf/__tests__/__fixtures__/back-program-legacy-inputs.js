/**
 * Shared input builders for the back-program legacy-exactness regression.
 *
 * The baseline JSON (back-program-legacy-baseline.json) holds outputs of the
 * PRE-EDITIONS back-program solver (solveBackProgram) for these exact inputs,
 * captured BEFORE the editions chrome/pool/objectives (plan 2.7) landed. The
 * regression test replays each input WITHOUT `edition` and asserts deep
 * equality — proving the edition machinery is strictly opt-in and a
 * no-edition call is byte-identical to today.
 *
 * DO NOT EDIT the builders without regenerating the baseline from a
 * known-legacy revision (scripts/gen-back-program-legacy-baseline.js).
 */

"use strict";

const PAGE_W = 5.5;
const PAGE_H = 8.5;
const REGION = { x: 0.35, y: 0.3, w: PAGE_W - 0.7, h: PAGE_H - 0.6 };

function img(id, aspect, raw = "", role = null) {
  return { id, aspect, rawShotType: raw, role };
}

function pool(n, withFull = true) {
  const base = [
    img("a", 0.8, "headshot", "headshot"),
    img("b", 0.7, "", "editorial"),
    img("c", 1.2, "", "lifestyle"),
    img("d", 0.66, "", "editorial"),
    img("e", 0.9, "", "lifestyle"),
    img("f", 0.75, "", "editorial"),
  ].slice(0, n);
  if (withFull) base[Math.min(1, n - 1)] = img("fl", 0.55, "full_length", "full_body");
  return base;
}

// (label, input) pairs frozen in the baseline. Deliberately spans photo
// counts, stats sides, densities, skip, and bleed appetites so the legacy
// rng stream and every geometry branch are pinned.
function cases() {
  return [
    ["n3-auto", { region: REGION, images: pool(3), stats: { side: "auto", skip: false }, pacing: 1, tone: { formality: 0.5, density: 0.5 }, seed: "lb-1" }],
    ["n4-auto", { region: REGION, images: pool(4), stats: { side: "auto", skip: false }, pacing: 1, tone: { formality: 0.5, density: 0.5 }, seed: "lb-2" }],
    ["n5-dense", { region: REGION, images: pool(5), stats: { side: "auto", skip: false }, pacing: 1.2, tone: { formality: 0.3, density: 0.9 }, seed: "lb-3" }],
    ["n6-dense", { region: REGION, images: pool(6, false), stats: { side: "auto", skip: false }, pacing: 1.4, tone: { formality: 0.4, density: 0.95 }, seed: "lb-4" }],
    ["n2-minimal", { region: REGION, images: pool(2, false), stats: { side: "auto", skip: false }, pacing: 0.9, tone: { formality: 0.2, density: 0.1 }, seed: "lb-5" }],
    ["n4-skip", { region: REGION, images: pool(4), stats: { side: "auto", skip: true }, pacing: 1, tone: { formality: 0.6, density: 0.5 }, seed: "lb-6" }],
    ["n4-right", { region: REGION, images: pool(4), stats: { side: "right", skip: false }, pacing: 1, tone: { formality: 0.8, density: 0.4 }, seed: "lb-7" }],
    ["n4-bottom", { region: REGION, images: pool(4), stats: { side: "bottom", skip: false }, pacing: 1, tone: { formality: 0.2, density: 0.6 }, seed: "lb-8" }],
    ["n5-expressive", { region: REGION, images: pool(5), stats: { side: "auto", skip: false }, pacing: 1.1, tone: { formality: 0.5, density: 0.7 }, seed: "lb-9", bleedAppetite: "expressive" }],
    ["n4-nobleed", { region: REGION, images: pool(4), stats: { side: "auto", skip: false }, pacing: 1, tone: { formality: 0.5, density: 0.5 }, seed: "lb-10", bleedAppetite: "none" }],
    ["n3-nofull", { region: REGION, images: pool(3, false), stats: { side: "auto", skip: false }, pacing: 1, tone: { formality: 0.7, density: 0.3 }, seed: "lb-11" }],
    ["n6-formal", { region: REGION, images: pool(6, false), stats: { side: "auto", skip: false }, pacing: 1, tone: { formality: 0.95, density: 0.5 }, seed: "lb-12" }],
  ];
}

module.exports = { img, pool, cases, REGION, PAGE_W, PAGE_H };
