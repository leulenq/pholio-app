/**
 * Pholio Email Framework — Design Tokens
 * ------------------------------------------------------------------
 * A direct mirror of the product design language (agency-tokens.css):
 * warm editorial luxury — cream canvas, Pholio gold, Playfair display
 * serif over Inter body. Values are duplicated here (not imported from
 * CSS) because email HTML must be fully inlined and self-contained.
 *
 * Everything downstream — the shell and every component — reads from
 * this object, so re-theming the entire system is a single-file change.
 */

const theme = {
  // ---- Surfaces (warm light) ----
  canvas: "#FAF8F5", // page background
  surface: "#FFFFFF", // primary card
  surfaceSunken: "#F7F4EF", // nested panels, quotes, code blocks
  surfaceRaised: "#FFFFFF",

  // ---- Pholio gold (platform accent — never agency-branded) ----
  gold: "#C9A55A",
  goldHover: "#B8956A",
  goldSoft: "#F3ECDD", // tinted fill for hero bands / accents
  goldGhost: "rgba(201, 165, 90, 0.12)",
  goldLine: "rgba(201, 165, 90, 0.30)",

  // ---- Ink & text (warm darks) ----
  ink: "#1A1815", // headlines / on-gold text
  body: "#2D2A26", // body copy
  muted: "#6B6560", // secondary
  faint: "#9C958E", // tertiary / captions
  ghost: "#C8C2BA", // disabled

  // ---- Lines ----
  border: "#EDE9E3",
  borderStrong: "rgba(26, 24, 21, 0.14)",

  // ---- Semantic ----
  success: "#2D8A56",
  danger: "#C0392B",
  warning: "#C2850E",
  info: "#3B7DD8",

  // ---- Shadows (warm-toned) ----
  shadowCard: "0 8px 40px rgba(26, 24, 21, 0.08)",
  shadowSoft: "0 4px 20px rgba(26, 24, 21, 0.06)",

  // ---- Typography ----
  fontDisplay:
    "'Playfair Display', Georgia, 'Times New Roman', Times, serif",
  fontBody:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontMono: "'SF Mono', 'Roboto Mono', 'Courier New', Courier, monospace",

  // ---- Geometry ----
  radius: 16, // cards
  radiusSm: 10, // buttons, nested panels
  radiusPill: 100,
  contentWidth: 600, // outer email column

  // ---- Web fonts (progressive enhancement; Georgia/Arial fall back) ----
  fontHref:
    "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap",

  // ---- Brand strings ----
  brandName: "Pholio",
  tagline: "Talent portfolios & agency tools",
  siteUrl: "https://www.pholio.studio",
  siteLabel: "pholio.studio",
};

function appBaseUrl() {
  return (
    process.env.APP_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://app.pholio.studio"
      : "http://localhost:5173")
  );
}

module.exports = { theme, appBaseUrl };
