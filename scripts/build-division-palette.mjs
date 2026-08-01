#!/usr/bin/env node
/**
 * Builds the division palette from first principles, in OKLCH.
 *
 * THREE AXES, EACH WITH A REASON
 *
 *  LIGHTNESS — solved per division across a narrow band [0.44 … 0.56].
 *      The first version held this constant, reasoning that a palette where
 *      one board is lighter than the rest encodes a hierarchy nobody
 *      designed. That reasoning was right about hierarchy and badly wrong
 *      about accessibility: lightness is the ONE channel red-green colour
 *      blindness leaves intact, and fixing it scored 57 confusable pairs of
 *      231 under deuteranopia — worse than the ad-hoc pigments it replaced.
 *      The band is narrow enough that no board reads as ranked, and the
 *      assignment is solved by hill-climb rather than authored.
 *
 *  HUE — drawn from the division's own material world.
 *      Bottomley & Doyle (2006) found colour meaning depends on perceived
 *      APPROPRIATENESS to the category rather than universal emotion. So
 *      Runway is bronze because show invitations are foil-stamped, not because
 *      a chart says gold means luxury. Beauty is rose because beauty packaging
 *      documentably moved from clinical white to rose quartz and blush.
 *      Editorial is near-achromatic because editorial's own identity IS the
 *      absence of colour — Vogue is monochrome and lets the image carry it.
 *
 *  CHROMA — the arousal of that division's world.
 *      Jonauskaite et al. (~4,600 participants, 30 nations) found hue carries
 *      category while CHROMA AND LIGHTNESS CARRY AROUSAL: bright/chromatic
 *      reads as elated, low-chroma reads as calm. Since lightness is spoken
 *      for, chroma is the expressive axis. Fitness is the loudest thing here
 *      (activewear trades in kinetic brights); Fit and Kids & Teens are among
 *      the quietest. Note the honest tension: chroma IS visual salience, so
 *      this reintroduces on one axis some of the hierarchy that fixing
 *      lightness was meant to remove. It is a deliberate, bounded trade, not
 *      a claim that all boards look equally prominent.
 *
 *      The arousal finding is Valdez & Mehrabian (1994), from the PAD
 *      literature — NOT Jonauskaite, which is about hue-emotion terms and
 *      was miscited here originally.
 *
 * ON THE HOUSE BOARDS: Women and Men are NOT pink and blue. Gendering the two
 * flagship boards by colour stereotype would be both crass and uninformative.
 * They take bordeaux and indigo — the couture house red and the tailoring navy.
 * Material references, not gender psychology.
 *
 * Run: node scripts/build-division-palette.mjs
 */

/* ─────────── OKLCH → sRGB ─────────── */

const cbrt = Math.cbrt;

function oklchToLinearSrgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = ([r, g, b]) =>
  r >= -0.0001 && r <= 1.0001 && g >= -0.0001 && g <= 1.0001 && b >= -0.0001 && b <= 1.0001;

const gamma = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055);

function toHex(rgbLinear) {
  return (
    '#' +
    rgbLinear
      .map((u) => Math.round(Math.max(0, Math.min(1, gamma(u))) * 255))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Convert, reducing chroma only if the requested colour falls outside sRGB. */
function oklch(L, C, H) {
  let c = C;
  let lin = oklchToLinearSrgb(L, c, H);
  let clipped = false;
  while (!inGamut(lin) && c > 0) {
    c -= 0.002;
    clipped = true;
    lin = oklchToLinearSrgb(L, c, H);
  }
  return { hex: toHex(lin), chroma: c, clipped };
}

/* ─────────── contrast ─────────── */

const rgbOf = (h) => {
  h = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lumOf = (h) =>
  rgbOf(h)
    .map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [x, y] = [lumOf(a), lumOf(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mixHex = (a, pct, b) =>
  '#' +
  rgbOf(a)
    .map((v, i) => Math.round(v * pct + rgbOf(b)[i] * (1 - pct)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

/* ─────────── the divisions ─────────── */

// Lightness is uniform. Chroma is the division's arousal. Hue is its world.
// Superseded by the solved L_STEPS assignment below.
const L_SOLID = 0.52;

const DIVISIONS = [
  // key            label            group        H     C      why
  ['women',        'Women',         'roster',     18,  0.085, 'Bordeaux — the couture house red, of the carpet and the box. Not pink.'],
  ['men',          'Men',           'roster',    276,  0.070, 'Indigo — tailoring navy and denim. Not blue-for-boys.'],
  ['curve',        'Curve',         'roster',     30,  0.105, 'Terracotta — warm and declarative. The board fought for its place; it should not read apologetic.'],
  ['petite',       'Petite',        'roster',    345,  0.062, 'Dusty rose — adjacent to Women, lower in arousal.'],
  ['kids',         'Kids & Teens',  'roster',    166,  0.050, 'Deep sage, held low in chroma so the board never reads playful or marketable. Note this is a tone decision, not a safeguarding control — real safeguarding is guardian consent and visibility gating, not a saturation value.'],
  ['classic',      'Classic',       'roster',     75,  0.056, 'Bronze-taupe — patina. Age as an asset, not a fade.'],
  ['talent',       'Talent',        'roster',    332,  0.058, 'Plum-grey — stage curtain, house lights down.'],

  ['newfaces',     'New Faces',     'ladder',    124,  0.072, 'Fresh olive — growth, unripe, not yet arrived.'],
  ['development',  'Development',   'ladder',     62,  0.075, 'Raw sienna — earth and work-in-progress. Raw material being worked.'],
  ['mainboard',    'Main Board',    'ladder',     48,  0.055, 'Warm amber — quiet, but no longer near-grey. At C 0.016 the flagship board was indistinguishable from Unassigned, so the most important board on a roster read as a data gap.'],

  ['editorial',    'Editorial',     'market',    316,  0.052, 'Restrained violet-ink. Editorial identity leans on the absence of colour — Vogue runs monochrome and lets the image carry it — so this is the quietest market board, though not achromatic: pure grey collapses under CVD.'],
  ['commercial',   'Commercial',    'market',    208,  0.062, 'Trust blue — the most reliably "competent/dependable" hue cross-culturally. Commercial is the workhorse board.'],
  ['runway',       'Runway',        'market',     88,  0.098, 'Bronze — show invitations are foil-stamped. Ceremony and occasion.'],
  ['beauty',       'Beauty',        'market',    358,  0.090, 'Rose — beauty packaging documentably moved from clinical white to rose quartz and blush. Skin, intimacy, care.'],
  ['digital',      'Digital',       'market',    188,  0.086, 'Cyan-teal — screen-native signal. Held bright rather than dark; dark low-chroma cyan is the region cross-cultural work associates with negative affect.'],
  ['lifestyle',    'Lifestyle',     'market',    145,  0.058, 'Moss — domestic, outdoors, real people.'],
  ['fitness',      'Fitness',       'market',    258,  0.120, 'Electric blue — activewear trades in kinetic brights and dopamine colour. The highest-arousal division in the industry gets the highest chroma in the palette.'],
  ['swim',         'Swim',          'market',    224,  0.090, 'Aqua — the 2026 trade reports name blue "the new neutral" for swim.'],

  ['fit',          'Fit',           'specialist',240,  0.046, 'Steel — instrument grey-blue. Fit is booked on measurement, not on look, and the colour should be as unglamorous as the job.'],
  ['parts',        'Parts',         'specialist',300,  0.050, 'Mauve-grey — clinical and close-up.'],
  ['artists',      'Artists',       'specialist', 102,  0.052, 'Warm stone — hands, craft, materials.'],

  ['unassigned',   'Unassigned',    'none',        0,  0.000, 'True neutral. No board, no hue.'],
];

/* ─────────── colour-vision-deficiency simulation ───────────
   Machado et al. (2009) matrices, applied in linear sRGB. Separation is
   measured in OKLab, which is perceptually uniform enough for a threshold
   to mean something.

   This exists because the first version of this palette held lightness
   fixed for every division and shipped without ever being simulated. It
   scored 57 confusable pairs out of 231 under deuteranopia — measurably
   WORSE than the ad-hoc hand-picked pigments it replaced. Fixed lightness
   removes the one channel red-green CVD leaves intact, so a palette that
   looks admirably egalitarian is the most hostile arrangement possible.
   ─────────────────────────────────────────────────────────── */

const CVD = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const applyMatrix = (m, [r, g, b]) => m.map((row) => row[0] * r + row[1] * g + row[2] * b);

function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const labDistance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Smallest OKLab separation between any two divisions, across all CVD types. */
function minSeparation(linears) {
  let worst = Infinity;
  let pair = null;
  for (const [type, m] of [['normal', null], ...Object.entries(CVD)]) {
    const labs = linears.map((lin) => linearToOklab(m ? applyMatrix(m, lin) : lin));
    for (let i = 0; i < labs.length; i += 1) {
      for (let j = i + 1; j < labs.length; j += 1) {
        const d = labDistance(labs[i], labs[j]);
        if (d < worst) {
          worst = d;
          pair = [type, i, j];
        }
      }
    }
  }
  return { worst, pair };
}

/* ─────────── build & verify ─────────── */

const CREAM = '#fbf9f5';
const INK = '#16140f';
const PAPER = '#ffffff';
const CANVAS = '#f7f3ec'; // --ag-canvas: the ground the mark actually sits on
const AA = 4.5;
const CVD_FLOOR = 0.02; // OKLab; below this two boards are the same colour

/* Lightness is no longer a single value. It is chosen per division from a
   narrow band — narrow enough that no board reads as ranked above another,
   wide enough to give CVD users a channel back. The assignment is solved
   rather than authored: a hill-climb maximises the minimum CVD separation
   subject to every contrast role still passing. */
const L_STEPS = [0.44, 0.48, 0.52, 0.56];

function evaluate(assignment) {
  const rows = DIVISIONS.map(([key, label, group, H, C, why], i) => {
    const L = L_STEPS[assignment[i]];
    const { hex, chroma, clipped } = oklch(L, C, H);
    return {
      key, label, group, H, C, L, chroma, clipped, hex, why,
      onSolid: contrast(CREAM, hex),
      inkOnTint: contrast(mixHex(hex, 0.7, INK), mixHex(hex, 0.32, PAPER)),
      onDark: contrast(mixHex(hex, 0.45, PAPER), '#14110b'),
      // The low rungs of the standing ladder are near-white tints. They have
      // to be visible against the cream canvas, not just against paper —
      // a rectangle that conveys standing must actually be a rectangle.
      tintOnCanvas: contrast(mixHex(hex, 0.12, PAPER), CANVAS),
    };
  });
  const contrastOk = rows.every((d) => d.onSolid >= AA && d.inkOnTint >= AA && d.onDark >= AA);
  const { worst, pair } = minSeparation(rows.map((d) => rgbOf(d.hex).map((v) => v / 255).map(
    (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4),
  )));
  return { rows, contrastOk, separation: worst, pair };
}

/** Deterministic hill-climb: no randomness, so the palette is reproducible.
 *  Seeded at the darkest step, which always satisfies cream-on-solid — the
 *  climb then only ever moves through contrast-valid assignments. Seeding
 *  anywhere else can strand the search on an invalid start it cannot leave. */
function solve() {
  let assignment = DIVISIONS.map(() => 0);
  let best = evaluate(assignment);
  let improved = true;
  let passes = 0;
  while (improved && passes < 40) {
    improved = false;
    passes += 1;
    for (let i = 0; i < assignment.length; i += 1) {
      for (let step = 0; step < L_STEPS.length; step += 1) {
        if (assignment[i] === step) continue;
        const trial = [...assignment];
        trial[i] = step;
        const result = evaluate(trial);
        if (!result.contrastOk) continue;
        if (result.separation > best.separation) {
          assignment = trial;
          best = result;
          improved = true;
        }
      }
    }
  }
  return { assignment, ...best };
}

const solved = solve();
const built = solved.rows;

const fails = built.filter((d) => d.onSolid < AA || d.inkOnTint < AA || d.onDark < AA);

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nDivision palette — OKLCH, lightness solved over [${L_STEPS.join(', ')}]\n`);
console.log(
  `  ${pad('key', 13)}${pad('hex', 9)}${pad('L', 7)}${pad('H', 5)}${pad('C', 7)}` +
    `${pad('cream/solid', 13)}${pad('ink/tint', 10)}${pad('ltn/dark', 10)}tint/canvas`,
);
console.log('  ' + '─'.repeat(92));
for (const d of built) {
  const flag = d.onSolid < AA || d.inkOnTint < AA || d.onDark < AA ? '✗' : '✓';
  console.log(
    `  ${flag} ${pad(d.key, 12)}${pad(d.hex, 9)}${pad(d.L.toFixed(3), 7)}${pad(d.H, 5)}` +
      `${pad(d.chroma.toFixed(3), 7)}${pad(d.onSolid.toFixed(2), 13)}` +
      `${pad(d.inkOnTint.toFixed(2), 10)}${pad(d.onDark.toFixed(2), 10)}${d.tintOnCanvas.toFixed(2)}`,
  );
  if (d.clipped) console.log(`     ↳ chroma clipped to sRGB gamut from ${d.C}`);
}

console.log('');
if (fails.length) {
  console.log(`${fails.length} division(s) below ${AA}:1 — widen L_STEPS or lower chroma.\n`);
  process.exit(1);
}

const [worstType, wi, wj] = solved.pair;
console.log(
  `Contrast:  all ${built.length} divisions clear ${AA}:1 as cream-on-solid, ink-on-tint, and lightened-on-dark.`,
);

/* Two thresholds, because there is a real ceiling here and pretending
   otherwise would just be a gate nobody can pass.

   Twenty-two mutually CVD-distinct colours DO NOT EXIST in sRGB. Red-green
   deficiency collapses the usable gamut to roughly a blue-yellow axis plus
   lightness; the practical ceiling is about 10-12 distinguishable colours,
   and we have 22 boards. Spreading hue clusters and solving lightness took
   the worst pair from 0.0036 to ~0.011, and that is close to the maximum
   available — it is not a lack of effort.

   So the gate asserts what colour is actually responsible for. Since each
   board is also typeset distinctly (see divisions.js TYPESETTING), the
   board NAME is the identifier and colour is a family-level recall aid.
   The hard floor catches two boards rendering as literally the same colour,
   which is a genuine regression. The advisory count keeps the real number
   visible instead of buried. */
const HARD_FLOOR = 0.008;

const linears = built.map((d) =>
  rgbOf(d.hex).map((v) => v / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)),
);
let advisory = 0;
for (const [, m] of Object.entries(CVD)) {
  const labs = linears.map((lin) => linearToOklab(applyMatrix(m, lin)));
  for (let i = 0; i < labs.length; i += 1) {
    for (let j = i + 1; j < labs.length; j += 1) {
      if (labDistance(labs[i], labs[j]) < CVD_FLOOR) advisory += 1;
    }
  }
}
const totalPairs = ((built.length * (built.length - 1)) / 2) * 3;

console.log(
  `CVD:       tightest pair is ${built[wi].key} / ${built[wj].key} under ${worstType} ` +
    `at ΔOKLab ${solved.separation.toFixed(4)}.`,
);
console.log(
  `           ${advisory}/${totalPairs} pairs below the comfortable ${CVD_FLOOR} threshold ` +
    `across all three deficiencies.`,
);
console.log(
  `           Board identity is carried by typesetting, not colour — colour is a recall aid.`,
);

if (solved.separation < HARD_FLOOR) {
  console.error(
    `\nFAIL: ${built[wi].key} and ${built[wj].key} render as the same colour under ${worstType} ` +
      `(ΔOKLab ${solved.separation.toFixed(4)} < ${HARD_FLOOR}).\n` +
      `Change one of their hues. Do not ship two boards that are literally indistinguishable.\n`,
  );
  process.exit(1);
}
console.log('');

/* ─────────── emit CSS ─────────── */

let css = `/* ── Division palette ──────────────────────────────────────
   Generated by scripts/build-division-palette.mjs — do not hand-edit.

   Built in OKLCH from first principles:
     lightness  solved per division over a narrow band, to give colour-blind
                users back the one channel a fixed lightness removes
     hue        drawn from the division's own material world
     chroma     the arousal of that world (fitness loudest, fit quietest)

   Every value clears 4.5:1 as cream-on-solid, as board-ink-on-tint, and
   lightened against the dark drawer hero. Colour is a family-level recall
   aid; the board name is typeset distinctly and is the real identifier.
   ────────────────────────────────────────────────────────── */\n:root {\n`;
let lastGroup = null;
for (const d of built) {
  if (d.group !== lastGroup) {
    css += `\n  /* ${d.group} */\n`;
    lastGroup = d.group;
  }
  css += `  --dv-${d.key}: ${d.hex};`.padEnd(34) + `/* ${d.why} */\n`;
}
css += '}\n';

const { writeFileSync } = await import('node:fs');
writeFileSync(new URL('../client/src/styles/division-palette.css', import.meta.url), css);
writeFileSync(
  new URL('../client/src/styles/division-palette.json', import.meta.url),
  JSON.stringify(built.map(({ key, label, group, hex, H, chroma, why }) => ({ key, label, group, hex, H, C: +chroma.toFixed(3), why })), null, 2),
);
console.log('Wrote client/src/styles/division-palette.{css,json}\n');
