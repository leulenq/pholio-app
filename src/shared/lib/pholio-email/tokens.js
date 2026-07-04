/**
 * Pholio Email — Design Tokens
 *
 * The brand DNA, distilled from the two real Pholio surfaces and re-expressed
 * in email-safe form:
 *   • Marketing site  (.pholio-landing-ref/app/globals.css) → editorial warmth,
 *     velvet/cream, Noto Serif Display headings, gold #C9A55A, restraint.
 *   • Talent dashboard (client/src/styles/tokens.css)       → structured trust,
 *     warm-cream canvas, white surfaces, 8px spacing rhythm, soft warm shadow.
 *
 * Gold (#C9A55A) is the single constant across every Pholio surface and is the
 * one accent these emails are allowed. Everything else is ink, warm neutral,
 * and negative space.
 *
 * Email constraint: web fonts only render in a few clients (Apple Mail, iOS).
 * The serif fallback to Georgia is intentional — it keeps the editorial voice
 * intact everywhere else.
 */

const COLOR = {
  // Surfaces
  canvas: "#FAF7F2", // warm cream — the outer inbox canvas (marketing cream)
  card: "#FFFFFF", // white content surface (dashboard card)
  panel: "#FAF8F4", // inset warm panel (codes, previews, detail rows)

  // Ink & text (warm dark scale)
  ink: "#1A1815", // headings
  body: "#5C5650", // body copy
  muted: "#9A938B", // captions, footer, metadata

  // Brand
  gold: "#C9A55A",
  goldDark: "#A8894E",
  goldSoft: "#EFE4CC", // faint gold wash for accents

  // Lines
  hairline: "#ECE6DB", // warm separators / card border
  panelBorder: "#EAE3D6",

  // Dark-mode counterparts (marketing velvet)
  darkCanvas: "#0E0E11",
  darkCard: "#17171B",
  darkPanel: "#1E1E22",
  darkInk: "#F5F0E8",
  darkBody: "#B9B2A8",
};

const FONT = {
  serif: "'Noto Serif Display', Georgia, 'Times New Roman', serif",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
};

// 8px spacing rhythm, inherited from the dashboard token scale.
const SPACE = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40 };

const RADIUS = { card: 16, panel: 10, button: 8 };

const LAYOUT = { width: 600, gutter: 40 };

module.exports = { COLOR, FONT, SPACE, RADIUS, LAYOUT };
