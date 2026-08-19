/**
 * Pholio Email — AGENCY tokens (the older dark composition).
 *
 * Retained verbatim for the agency family, which was out of scope for the
 * talent redesign. The talent system now uses ./tokens.js (cream). Keeping the
 * two in separate files stops one surface's palette silently breaking the other
 * — which is exactly what happened when they shared a file.
 *
 * Original header follows.
 *
 * Pholio Email — full-frame cinematic tokens.
 *
 * Derived from the onboarding dark stage and the agency applications language:
 * black stage, warm-white serif identity, Inter for operational clarity, and
 * one restrained gold light. Values are deliberately email-safe hex colors.
 */

const COLOR = {
  stage: "#050403",
  stageRaised: "#0B0A08",
  stageSoft: "#14110D",
  panel: "#17130E",
  panelWarm: "#211A12",
  ink: "#F5F1EA",
  body: "#D8D0C4",
  muted: "#A79C8C",
  ghost: "#6F665A",
  gold: "#C9A55A",
  goldDeep: "#B8956A",
  goldInk: "#0A0806",
  hairline: "#3A3023",
  hairlineSoft: "#2A241C",
  cream: "#FAF8F5",
  creamInk: "#1A1815",
  danger: "#E2A399",
};

const FONT = {
  serif: "'Playfair Display', Georgia, 'Times New Roman', serif",
  sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
};

const SPACE = { xs: 8, sm: 12, md: 18, lg: 28, xl: 40, xxl: 56 };
const RADIUS = { frame: 4, panel: 8, button: 8 };
const LAYOUT = { width: 720, gutter: 48 };

module.exports = { COLOR, FONT, SPACE, RADIUS, LAYOUT };
