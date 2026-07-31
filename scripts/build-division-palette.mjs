#!/usr/bin/env node
/**
 * Builds the division palette from first principles, in OKLCH.
 *
 * THREE AXES, EACH WITH A REASON
 *
 *  LIGHTNESS — held constant across every division.
 *      No board outranks another. A palette where one division is lighter or
 *      darker than the rest encodes a hierarchy nobody designed. Fixed L is
 *      the equality principle, and it's why this can't be eyeballed in hex:
 *      equal-looking hex values are not equal-lightness values.
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
 *      for, chroma becomes the expressive axis. Fitness is the loudest thing
 *      here (activewear trades in kinetic brights); Main Board and Fit are the
 *      quietest. Kids & Teens is held deliberately low as a safeguarding
 *      decision rather than an aesthetic one — a minors board must never read
 *      as marketable.
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
const L_SOLID = 0.52;

const DIVISIONS = [
  // key            label            group        H     C      why
  ['women',        'Women',         'roster',     22,  0.085, 'Bordeaux — the couture house red, of the carpet and the box. Not pink.'],
  ['men',          'Men',           'roster',    268,  0.070, 'Indigo — tailoring navy and denim. Not blue-for-boys.'],
  ['curve',        'Curve',         'roster',     42,  0.105, 'Terracotta — warm and declarative. The board fought for its place; it should not read apologetic.'],
  ['petite',       'Petite',        'roster',    350,  0.055, 'Dusty rose — adjacent to Women, lower in arousal.'],
  ['kids',         'Kids & Teens',  'roster',    152,  0.045, 'Deep sage — the calmest hue in the set. A minors board must never read playful or marketable.'],
  ['classic',      'Classic',       'roster',     68,  0.042, 'Bronze-taupe — patina. Age as an asset, not a fade.'],
  ['talent',       'Talent',        'roster',    322,  0.045, 'Plum-grey — stage curtain, house lights down.'],

  ['newfaces',     'New Faces',     'ladder',    128,  0.072, 'Fresh olive — growth, unripe, not yet arrived.'],
  ['development',  'Development',   'ladder',     58,  0.075, 'Raw sienna — earth and work-in-progress. Raw material being worked.'],
  ['mainboard',    'Main Board',    'ladder',     40,  0.016, 'Warm neutral — the LEAST chromatic board in the set. Fixed lightness means the flagship cannot be the darkest, so it is the quietest instead: everything around it has a hue, and the main board simply does not need one.'],

  ['editorial',    'Editorial',     'market',    312,  0.038, 'Near-achromatic violet-ink. Editorial identity IS the absence of colour — Vogue runs monochrome and lets the image carry it. Lowest chroma of any market board, on purpose.'],
  ['commercial',   'Commercial',    'market',    212,  0.062, 'Trust blue — the most reliably "competent/dependable" hue cross-culturally. Commercial is the workhorse board.'],
  ['runway',       'Runway',        'market',     78,  0.098, 'Bronze — show invitations are foil-stamped. Ceremony and occasion.'],
  ['beauty',       'Beauty',        'market',    354,  0.090, 'Rose — beauty packaging documentably moved from clinical white to rose quartz and blush. Skin, intimacy, care.'],
  ['digital',      'Digital',       'market',    196,  0.086, 'Cyan-teal — screen-native signal. Held bright rather than dark: dark low-chroma cyan tested as the fear direction.'],
  ['lifestyle',    'Lifestyle',     'market',    138,  0.058, 'Moss — domestic, outdoors, real people.'],
  ['fitness',      'Fitness',       'market',    252,  0.120, 'Electric blue — activewear trades in kinetic brights and dopamine colour. The highest-arousal division in the industry gets the highest chroma in the palette.'],
  ['swim',         'Swim',          'market',    218,  0.090, 'Aqua — the 2026 trade reports name blue "the new neutral" for swim.'],

  ['fit',          'Fit',           'specialist',232,  0.030, 'Steel — instrument grey-blue. Fit is booked on measurement, not on look, and the colour should be as unglamorous as the job.'],
  ['parts',        'Parts',         'specialist',308,  0.034, 'Mauve-grey — clinical and close-up.'],
  ['artists',      'Artists',       'specialist', 88,  0.036, 'Warm stone — hands, craft, materials.'],

  ['unassigned',   'Unassigned',    'none',        0,  0.000, 'True neutral. No board, no hue.'],
];

/* ─────────── build & verify ─────────── */

const CREAM = '#fbf9f5';
const INK = '#16140f';
const PAPER = '#ffffff';
const CANVAS = '#f4f0e8';
const AA = 4.5;

const built = DIVISIONS.map(([key, label, group, H, C, why]) => {
  const { hex, chroma, clipped } = oklch(L_SOLID, C, H);
  const onSolid = contrast(CREAM, hex);              // cream type on the solid field
  const inkOnTint = contrast(
    mixHex(hex, 0.7, INK),
    mixHex(hex, 0.32, PAPER),
  );                                                  // board ink on the active tint
  const lite = mixHex(hex, 0.45, PAPER);
  const onDark = contrast(lite, '#14110b');           // lightened, on the dark hero
  return { key, label, group, H, C, chroma, clipped, hex, why, onSolid, inkOnTint, onDark };
});

const fails = built.filter(
  (d) => d.onSolid < AA || d.inkOnTint < AA || d.onDark < AA,
);

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nDivision palette — OKLCH, L fixed at ${L_SOLID}\n`);
console.log(
  `  ${pad('key', 13)}${pad('hex', 9)}${pad('H', 5)}${pad('C', 7)}${pad('cream/solid', 13)}${pad('ink/tint', 10)}ltn/dark`,
);
console.log('  ' + '─'.repeat(74));
for (const d of built) {
  const flag = d.onSolid < AA || d.inkOnTint < AA || d.onDark < AA ? '✗' : '✓';
  console.log(
    `  ${flag} ${pad(d.key, 12)}${pad(d.hex, 9)}${pad(d.H, 5)}${pad(d.chroma.toFixed(3), 7)}` +
      `${pad(d.onSolid.toFixed(2), 13)}${pad(d.inkOnTint.toFixed(2), 10)}${d.onDark.toFixed(2)}`,
  );
  if (d.clipped) console.log(`     ↳ chroma clipped to sRGB gamut from ${d.C}`);
}

console.log('');
if (fails.length) {
  console.log(`${fails.length} division(s) below ${AA}:1 — adjust L_SOLID or chroma.\n`);
  process.exit(1);
}
const worst = built.reduce((a, d) =>
  Math.min(d.onSolid, d.inkOnTint, d.onDark) < Math.min(a.onSolid, a.inkOnTint, a.onDark) ? d : a,
);
console.log(
  `All ${built.length} divisions clear ${AA}:1 in all three roles. ` +
    `Tightest: ${worst.key} at ${Math.min(worst.onSolid, worst.inkOnTint, worst.onDark).toFixed(2)}.\n`,
);

/* ─────────── emit CSS ─────────── */

let css = `/* ── Division palette ──────────────────────────────────────
   Generated by scripts/build-division-palette.mjs — do not hand-edit.

   Built in OKLCH from first principles:
     lightness  fixed at ${L_SOLID} so no board outranks another
     hue        drawn from the division's own material world
     chroma     the arousal of that world (fitness loudest, main board quietest)

   Every value clears 4.5:1 as cream-on-solid, as board-ink-on-tint,
   and lightened against the dark drawer hero.
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
