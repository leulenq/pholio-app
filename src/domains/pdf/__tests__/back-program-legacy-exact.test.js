/**
 * Back-program legacy-exactness regression (editions plan 2.7 exit test).
 *
 * The editions chrome/pool/objectives are strictly OPT-IN: a solveBackProgram
 * call WITHOUT `input.edition` must be byte-identical to the pre-editions
 * solver. The frozen baseline (back-program-legacy-baseline.json) was captured
 * from the pre-2.7 revision with the exact inputs in
 * back-program-legacy-inputs.js; this suite replays them and demands deep
 * equality across the whole BackLayout.
 *
 * Also pinned: an absent edition and `edition: null` behave identically, and
 * neither leaks a `style` / `nameplate` field onto the layout.
 */

const { solveBackProgram } = require("../composition/back-program/synthesize");
const { cases } = require("./__fixtures__/back-program-legacy-inputs");
const BASELINE = require("./__fixtures__/back-program-legacy-baseline.json");

describe("legacy exactness: no edition ⇒ pre-editions output, bit for bit", () => {
  for (const [label, input] of cases()) {
    test(`${label} deep-equals the frozen pre-editions baseline`, () => {
      const out = JSON.parse(JSON.stringify(solveBackProgram({ ...input, cropEngine: null })));
      expect(out).toEqual(BASELINE[label]);
    });
  }

  test("edition: null behaves exactly like an absent edition", () => {
    const [, input] = cases()[1];
    const absent = solveBackProgram({ ...input, cropEngine: null });
    const explicitNull = solveBackProgram({ ...input, cropEngine: null, edition: null });
    expect(explicitNull).toEqual(absent);
  });

  test("a no-edition layout carries no style / nameplate fields", () => {
    for (const [, input] of cases()) {
      const out = solveBackProgram({ ...input, cropEngine: null });
      expect(out.style).toBeUndefined();
      expect(out.nameplate).toBeUndefined();
    }
  });
});
