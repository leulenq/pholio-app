/**
 * Comp Card style engine
 *
 * Deterministically chooses a layout family and micro-style variant from seed,
 * then applies token-bounded tweaks on top of the chosen theme.
 */

const DEFAULT_LAYOUT_FAMILY = "editorial-balanced";

const LAYOUT_FAMILIES = {
  "editorial-balanced": {
    id: "editorial-balanced",
    label: "Editorial Balanced",
    layout: {
      imageGrid: { cols: 2, rows: 2 },
      bodyColumns: "1fr 2.08in",
      bodyGap: "0.2in",
      gridOrder: 1,
      statsOrder: 2,
      rolePreference: ["full_body", "editorial", "lifestyle", null],
    },
    variants: [
      {
        id: "signature-gold",
        label: "Signature Gold",
        styleTokens: {
          frontOverlayStrength: 0.68,
          frontOverlayFadeStop: "54%",
          nameSize: "28pt",
          statRuleOpacity: 0.13,
          headerRuleOpacity: 0.52,
          badgeRadius: "999px",
        },
      },
      {
        id: "ivory-soft",
        label: "Ivory Soft",
        styleTokens: {
          frontOverlayStrength: 0.56,
          frontOverlayFadeStop: "52%",
          nameSize: "26pt",
          statRuleOpacity: 0.1,
          headerRuleOpacity: 0.4,
          badgeRadius: "999px",
        },
        colorPatch: {
          background: "#FFFEFA",
          accent: "#BA9962",
        },
      },
      {
        id: "ink-contrast",
        label: "Ink Contrast",
        styleTokens: {
          frontOverlayStrength: 0.73,
          frontOverlayFadeStop: "58%",
          nameSize: "29pt",
          statRuleOpacity: 0.18,
          headerRuleOpacity: 0.64,
          badgeRadius: "10px",
        },
      },
    ],
  },
  "runway-split": {
    id: "runway-split",
    label: "Runway Split",
    layout: {
      imageGrid: { cols: 1, rows: 4 },
      bodyColumns: "1.32in 1fr",
      bodyGap: "0.18in",
      gridOrder: 1,
      statsOrder: 2,
      rolePreference: ["full_body", "headshot", "editorial", "lifestyle"],
    },
    variants: [
      {
        id: "dark-room",
        label: "Dark Room",
        styleTokens: {
          frontOverlayStrength: 0.76,
          frontOverlayFadeStop: "62%",
          nameSize: "30pt",
          statRuleOpacity: 0.22,
          headerRuleOpacity: 0.66,
          badgeRadius: "9px",
        },
      },
      {
        id: "gallery-warm",
        label: "Gallery Warm",
        styleTokens: {
          frontOverlayStrength: 0.64,
          frontOverlayFadeStop: "56%",
          nameSize: "28pt",
          statRuleOpacity: 0.16,
          headerRuleOpacity: 0.54,
          badgeRadius: "14px",
        },
        colorPatch: {
          accent: "#B88D4A",
        },
      },
      {
        id: "quiet-modern",
        label: "Quiet Modern",
        styleTokens: {
          frontOverlayStrength: 0.62,
          frontOverlayFadeStop: "53%",
          nameSize: "27pt",
          statRuleOpacity: 0.14,
          headerRuleOpacity: 0.44,
          badgeRadius: "999px",
        },
      },
    ],
  },
  "mosaic-horizontal": {
    id: "mosaic-horizontal",
    label: "Mosaic Horizontal",
    layout: {
      imageGrid: { cols: 4, rows: 1 },
      bodyColumns: "1fr 1.95in",
      bodyGap: "0.16in",
      gridOrder: 1,
      statsOrder: 2,
      rolePreference: ["headshot", "editorial", "full_body", "lifestyle"],
    },
    variants: [
      {
        id: "studio-grid",
        label: "Studio Grid",
        styleTokens: {
          frontOverlayStrength: 0.61,
          frontOverlayFadeStop: "50%",
          nameSize: "27pt",
          statRuleOpacity: 0.14,
          headerRuleOpacity: 0.48,
          badgeRadius: "999px",
        },
      },
      {
        id: "high-key",
        label: "High Key",
        styleTokens: {
          frontOverlayStrength: 0.52,
          frontOverlayFadeStop: "48%",
          nameSize: "26pt",
          statRuleOpacity: 0.11,
          headerRuleOpacity: 0.36,
          badgeRadius: "999px",
        },
        colorPatch: {
          background: "#FFFFFF",
        },
      },
      {
        id: "linework",
        label: "Linework",
        styleTokens: {
          frontOverlayStrength: 0.66,
          frontOverlayFadeStop: "55%",
          nameSize: "28pt",
          statRuleOpacity: 0.19,
          headerRuleOpacity: 0.6,
          badgeRadius: "8px",
        },
      },
    ],
  },
};

function seedToUint32(seed) {
  if (seed == null || seed === "") return 0;
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

function createMulberry32(a) {
  let state = a >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeSingleQueryValue(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  return v || null;
}

function getLayoutFamilyKeys() {
  return Object.keys(LAYOUT_FAMILIES);
}

function pickDeterministic(items, seed, salt) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const rng = createMulberry32(
    seedToUint32(`${seed || "auto"}:${salt || "core"}`),
  );
  const idx = Math.floor(rng() * items.length) % items.length;
  return items[idx];
}

function resolveCompCardArtDirection({
  seed,
  theme,
  requestedLayoutFamily,
  requestedStyleVariant,
}) {
  const safeTheme = {
    ...(theme || {}),
    colors: {
      ...(theme?.colors || {}),
    },
    layout: {
      ...(theme?.layout || {}),
    },
  };
  const normalizedFamily = normalizeSingleQueryValue(requestedLayoutFamily);
  const normalizedVariant = normalizeSingleQueryValue(requestedStyleVariant);
  const allFamilies = getLayoutFamilyKeys();

  let familyKey = normalizedFamily;
  if (!familyKey || familyKey === "auto" || !LAYOUT_FAMILIES[familyKey]) {
    familyKey = pickDeterministic(allFamilies, seed, "layout-family");
  }
  if (!familyKey || !LAYOUT_FAMILIES[familyKey]) {
    familyKey = DEFAULT_LAYOUT_FAMILY;
  }

  const family = LAYOUT_FAMILIES[familyKey];
  let variant = null;
  if (normalizedVariant) {
    variant =
      family.variants.find((item) => item.id === normalizedVariant) || null;
  }
  if (!variant) {
    variant =
      pickDeterministic(family.variants, seed, `style:${familyKey}`) ||
      family.variants[0];
  }

  const appliedTheme = {
    ...safeTheme,
    colors: {
      ...safeTheme.colors,
      ...(variant.colorPatch || {}),
    },
    layout: {
      ...safeTheme.layout,
      imageGrid: {
        ...safeTheme.layout?.imageGrid,
        ...family.layout.imageGrid,
      },
    },
  };

  return {
    layoutFamily: family.id,
    layoutFamilyLabel: family.label,
    styleVariant: variant.id,
    styleVariantLabel: variant.label,
    rolePreference: family.layout.rolePreference || null,
    layoutPatch: {
      bodyColumns: family.layout.bodyColumns,
      bodyGap: family.layout.bodyGap,
      gridOrder: family.layout.gridOrder,
      statsOrder: family.layout.statsOrder,
      gridCols: family.layout.imageGrid.cols,
      gridRows: family.layout.imageGrid.rows,
    },
    styleTokens: {
      frontOverlayStrength: variant.styleTokens.frontOverlayStrength,
      frontOverlayFadeStop: variant.styleTokens.frontOverlayFadeStop,
      nameSize: variant.styleTokens.nameSize,
      statRuleOpacity: variant.styleTokens.statRuleOpacity,
      headerRuleOpacity: variant.styleTokens.headerRuleOpacity,
      badgeRadius: variant.styleTokens.badgeRadius,
    },
    appliedTheme,
  };
}

module.exports = {
  LAYOUT_FAMILIES,
  getLayoutFamilyKeys,
  resolveCompCardArtDirection,
};
