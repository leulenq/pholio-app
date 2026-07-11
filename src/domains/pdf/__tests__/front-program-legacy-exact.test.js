/**
 * Legacy-exactness regression (editions plan 2.4 exit test).
 *
 * The editions machinery is strictly OPT-IN: a ctx without `edition` must
 * produce byte-identical programs to the pre-editions engine. The frozen
 * baseline (front-program-legacy-baseline.json) was captured from the
 * pre-editions revision of synthesize.js with the exact inputs rebuilt by
 * front-program-legacy-inputs.js; this suite replays them and demands
 * deep equality — full result object: program, signature, score,
 * decisions, pick.
 *
 * Also pinned here: the edition path NEVER leaks into a no-edition ctx
 * (`edition: null` / absent behave the same), and the structural
 * signature format for legacy programs is unchanged (no lk:/fd: suffix).
 */

const { designFrontProgram } = require("../composition/front-program/synthesize");
const { variants, BASELINE_CASES } = require("./__fixtures__/front-program-legacy-inputs");
const BASELINE = require("./__fixtures__/front-program-legacy-baseline.json");

describe("legacy exactness: ctx.edition undefined ⇒ pre-editions output, bit for bit", () => {
  const ctxByVariant = variants();

  for (const [variant, seeds] of BASELINE_CASES) {
    for (const seed of seeds) {
      test(`${variant}/${seed} deep-equals the frozen pre-editions baseline`, () => {
        const out = designFrontProgram(ctxByVariant[variant], { seed, candidates: 5 });
        // JSON round-trip normalizes undefined-valued keys the same way the
        // frozen baseline was serialized.
        expect(JSON.parse(JSON.stringify(out))).toEqual(BASELINE[variant][seed]);
      });
    }
  }

  test("edition: null behaves exactly like an absent edition", () => {
    const ctx = ctxByVariant.studio;
    const a = designFrontProgram(ctx, { seed: "null-vs-absent", candidates: 3 });
    const b = designFrontProgram({ ...ctx, edition: null }, { seed: "null-vs-absent", candidates: 3 });
    expect(a).toEqual(b);
  });

  test("legacy structural signatures carry no lockup/field extension", () => {
    for (const [variant, seeds] of BASELINE_CASES) {
      for (const seed of seeds) {
        const { signature } = designFrontProgram(ctxByVariant[variant], { seed, candidates: 5 });
        expect(signature).not.toMatch(/\|lk:/);
        expect(signature).not.toMatch(/\|fd:/);
      }
    }
  });
});
