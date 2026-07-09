/**
 * Comp Card Composition Director (atelier engine v2).
 *
 * designComposition({ profile, archetype, castingAnalysis, statsBlock,
 *                     poolAnalysis, forensicsById?, seed, advice?, overrides?,
 *                     cropEngine? }) → CompositionPlan
 *
 * v2 is parametric: there are no layout families, grid templates, or tone
 * enums. The plan is produced by a pipeline of data-driven stages —
 *
 *   1. design-language.js  — continuous tone vector, type system, palette
 *      (accent derived from the hero photo's pixels), pacing, stats rule.
 *   2. layout-solver.js    — front geometry (full-bleed vs floated hero,
 *      name band from the hero's measured quiet zones) and a seeded
 *      recursive partition for the back page (stats carved as a partition
 *      member, 0–2 page-edge bleeds).
 *   3. crop-engine.js      — focal-aware, joint-safe crops per cell.
 *
 * AI advice is advisory only: hero suggestions are clamped to within
 * ADVICE_HERO_CLAMP_POINTS of the top-ranked image, tone advice becomes a
 * bounded ±0.15 nudge inside design-language, grid advice is obsolete (no
 * grids exist) and is logged as ignored.
 *
 * Determinism: same (profile, images, forensics, statsBlock, seed, advice)
 * ⇒ deep-equal plan. Every choice lands in plan.decisions.
 *
 * Resilience: if the solver throws, a deterministic two-column fallback
 * layout is used (logged); the route additionally falls back to the classic
 * engine if this module itself fails.
 *
 * Plan shape (extends spec §C; `back.slots` is kept as a template/guardrail
 * compatibility view of `back.layout.cells`):
 *   { engine, seedUsed, language, toneProfile (telemetry label only),
 *     palette, typography, front: { imageId, crop, geometry, treatment,
 *     name: { placement, align }, statLine }, back: { layout, slots,
 *     statsPlacement, contact }, wordmark: { href, front, back },
 *     decisions, warnings }
 */

const { synthesizeDesignLanguage, solveNameSizePt } = require("./design-language");
const {
  solveFrontGeometry,
  solveBackPartition,
  validateLayout,
  PAGE_W,
  PAGE_H,
} = require("./layout-solver");
const { cornerStats } = require("./contrast");
const { evaluateNameBand, cornerProtected } = require("./type-safety");
const { fontsCssUrl } = require("./font-library");
const { curateBackStory } = require("./photo-intelligence");

/** Advice hero must score within this many points of the top-ranked image. */
const ADVICE_HERO_CLAMP_POINTS = 15;

const NAME_ALIGNS = ["left", "center"];

// ── PRNG (selector-compatible, attribution: comp-card-selector.js) ─────────

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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function r3(n) {
  return Math.round(n * 1000) / 1000;
}

// ── crop engine (injectable, fail-soft) ─────────────────────────────────────

function resolveCropEngine(injected) {
  if (injected !== undefined) {
    return injected && typeof injected === "object" ? injected : null;
  }
  try {
    // eslint-disable-next-line global-require
    return require("./crop-engine");
  } catch {
    return null;
  }
}

function naiveCenterCrop() {
  return {
    fit: "cover",
    objectPosition: "50% 50%",
    safety: { level: "caution", notes: ["crop-engine unavailable; naive center crop"] },
    coverageLoss: 0,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Telemetry-only register label nearest to a tone vector. NEVER drives design. */
function nearestToneLabel(tone, statsBlock) {
  if (statsBlock?.category === "kids") return "kids-bright";
  if (statsBlock?.isFitness || tone.energy >= 0.72) return "fitness-bold";
  if (tone.formality >= 0.72) return "high-fashion";
  if (tone.warmth >= 0.6) return "commercial-warm";
  return "editorial-classic";
}

/** Contact line from city / instagram / phone. Never an address. */
function buildContactLine(profile) {
  const parts = [];
  const city = typeof profile?.city === "string" ? profile.city.trim() : "";
  if (city) parts.push(city);
  const handleRaw =
    typeof profile?.instagram_handle === "string" ? profile.instagram_handle.trim() : "";
  if (handleRaw) parts.push(handleRaw.startsWith("@") ? handleRaw : `@${handleRaw}`);
  const phone = typeof profile?.phone === "string" ? profile.phone.trim() : "";
  if (phone) parts.push(phone);
  return parts.join("  ·  ");
}

/**
 * Booking block — real comp cards carry representation or a bookings line,
 * not bare social metadata. Both treatments share the SAME typographic
 * hierarchy (micro label / primary / secondary), so unrepresented talent
 * never reads as a lesser fallback:
 *
 *   REPRESENTATION                 DIRECT BOOKINGS
 *   Icon Management                +1 (212) 555 0101
 *   New York · @ana                New York · @ana
 *
 * @param {object} profile
 * @param {string|null} representation — agency name when represented
 * @param {{ kids?: boolean }} [options] — kids cards label direct contact as
 *   guardian contact (industry convention: a child's card carries the
 *   parent/guardian line, never the child's own booking identity)
 * @returns {{ mode: 'represented'|'direct', label: string|null,
 *             primary: string|null, line: string }}
 */
function buildBookingBlock(profile, representation, options = {}) {
  const agency =
    typeof representation === "string" && representation.trim()
      ? representation.trim()
      : null;
  if (agency) {
    return {
      mode: "represented",
      label: "Representation",
      primary: agency,
      line: buildContactLine(profile),
    };
  }
  // Direct: lead with the strongest booking channel; the rest support it.
  const city = typeof profile?.city === "string" ? profile.city.trim() : "";
  const handleRaw =
    typeof profile?.instagram_handle === "string" ? profile.instagram_handle.trim() : "";
  const handle = handleRaw ? (handleRaw.startsWith("@") ? handleRaw : `@${handleRaw}`) : "";
  const phone = typeof profile?.phone === "string" ? profile.phone.trim() : "";
  const channels = [phone, handle, city].filter(Boolean);
  const primary = channels.length ? channels[0] : null;
  const rest = channels.slice(1).join("  ·  ");
  return {
    mode: "direct",
    label: primary ? (options.kids ? "Guardian Contact" : "Direct Bookings") : null,
    primary,
    line: rest,
  };
}

/**
 * Dynamic brand-mark placement: score the four front corners by measured
 * quiet (forensics), gold-ink feasibility (gold disappears over mid-luma
 * imagery), and interference with the name band / stat line / hero figure.
 * The art-director's requested corner wins unless the engine's score says
 * it lands on the composition. Never an afterthought stamp.
 */
const WORDMARK_W = 0.95;
const WORDMARK_H = 0.18;
const GOLD_LUMA = 0.42; // approximate relative luminance of the brand golds

function overlaps(a, b, pad = 0.08) {
  if (!a || !b) return false;
  return (
    a.x < b.x + b.w + pad &&
    b.x < a.x + a.w + pad &&
    a.y < b.y + b.h + pad &&
    b.y < a.y + a.h + pad
  );
}

function cornerRect(corner) {
  const x = corner.endsWith("left") ? 0.25 : PAGE_W - 0.25 - WORDMARK_W;
  const y = corner.startsWith("top") ? 0.25 : PAGE_H - 0.25 - WORDMARK_H;
  return { x: r3(x), y: r3(y), w: WORDMARK_W, h: WORDMARK_H };
}

function placeFrontWordmark({ geometry, heroForensics, treatment, briefCorner, statLine }) {
  const corners = ["bottom-right", "bottom-left", "top-right", "top-left"];
  const obstacles = [geometry.nameBand, statLine, geometry.contactBand].filter(Boolean);
  const scored = corners.map((corner) => {
    const rect = cornerRect(corner);
    let score = corner === "bottom-right" ? 0.6 : 0; // house default bias
    const notes = [];
    for (const obstacle of obstacles) {
      if (overlaps(rect, obstacle)) {
        score -= 100;
        notes.push("collides with type");
      }
    }
    if (treatment === "full-bleed") {
      if (heroForensics && cornerProtected(heroForensics, corner)) {
        score -= 100;
        notes.push("corner sits on the talent");
      }
      const stats = heroForensics ? cornerStats(heroForensics, corner) : null;
      if (stats) {
        score += stats.quiet * 6;
        // Gold needs the backdrop away from its own luminance to read.
        score += Math.min(3, Math.abs(stats.mean - GOLD_LUMA) * 8);
        notes.push(`quiet ${stats.quiet.toFixed(2)}, luma ${stats.mean.toFixed(2)}`);
      } else {
        score += corner.startsWith("bottom") ? 1.5 : 0; // headroom heuristic
      }
      // Faces live in the upper third of portraits — keep top corners shy.
      if (corner.startsWith("top")) score -= 1.6;
    } else {
      // Floated hero: the mark belongs on paper; top corners only when the
      // hero leaves them free.
      if (overlaps(rect, geometry.hero)) {
        score -= 100;
        notes.push("lands on the floated hero");
      }
    }
    return { corner, rect, score, notes };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (briefCorner) {
    const requested = scored.find((s) => s.corner === briefCorner);
    if (requested && requested.score > -50 && requested.score >= best.score - 2.5) {
      return {
        ...requested,
        because: `art-director corner '${briefCorner}' adopted (${requested.notes.join("; ") || "clear"})`,
      };
    }
    return {
      ...best,
      because: `art-director corner '${briefCorner}' vetoed (${requested ? requested.notes.join("; ") || "scores below the engine's pick" : "unknown"}) — '${best.corner}' placed instead`,
    };
  }
  return { ...best, because: `quietest non-interfering corner (${best.notes.join("; ") || "paper"})` };
}

function forensicsFor(forensicsById, imageId) {
  if (!forensicsById || imageId == null) return null;
  if (forensicsById instanceof Map) return forensicsById.get(imageId) || null;
  if (typeof forensicsById === "object") return forensicsById[imageId] || null;
  return null;
}

/**
 * Deterministic non-solver fallback: tall feature cell + stacked supports,
 * stats column on the right. Used only when the partition solver throws.
 */
function fallbackBackLayout({ region, images, gutter, cropFor }) {
  const colW = 1.35;
  const nameH = 0.45;
  const footH = 0.46;
  const photo = {
    x: region.x,
    y: region.y + nameH + gutter,
    w: region.w - colW - gutter,
    h: region.h - nameH - footH - 2 * gutter,
  };
  const count = Math.min(images.length, 4);
  const cells = [];
  if (count > 0) {
    const featureW = count === 1 ? photo.w : photo.w * 0.55;
    cells.push({ x: photo.x, y: photo.y, w: r3(featureW), h: r3(photo.h) });
    const rest = count - 1;
    if (rest > 0) {
      const rx = photo.x + featureW + gutter;
      const rw = photo.w - featureW - gutter;
      const rh = (photo.h - gutter * (rest - 1)) / rest;
      for (let i = 0; i < rest; i++) {
        cells.push({ x: r3(rx), y: r3(photo.y + i * (rh + gutter)), w: r3(rw), h: r3(rh) });
      }
    }
  }
  const ordered = [...images].sort((a, b) => {
    const fa = a.rawShotType === "full_length" || a.rawShotType === "full_body" ? 0 : 1;
    const fb = b.rawShotType === "full_length" || b.rawShotType === "full_body" ? 0 : 1;
    return fa - fb;
  });
  return {
    cells: cells.map((rect, i) => ({
      ...rect,
      imageId: ordered[i].id,
      crop: cropFor(ordered[i], rect.w / rect.h),
      bleedEdges: [],
    })),
    statsBlock: {
      x: r3(region.x + region.w - colW),
      y: r3(region.y + nameH + gutter),
      w: colW,
      h: r3(region.h - nameH - footH - 2 * gutter),
      orientation: "column",
    },
    nameBlock: { x: region.x, y: region.y, w: region.w, h: nameH },
    contactBlock: { x: region.x, y: r3(region.y + region.h - footH), w: r3(region.w - 1.1), h: footH },
    wordmark: { x: r3(region.x + region.w - 1.1), y: r3(region.y + region.h - 0.3), w: 1.1, h: 0.3 },
    gutter,
    coverageRatio: 1,
    decisions: [],
    warnings: [],
  };
}

// ── designComposition ───────────────────────────────────────────────────────

/**
 * @param {object} input — see module header
 * @returns {object} CompositionPlan
 */
function designComposition(input = {}) {
  const {
    profile = {},
    archetype = null,
    castingAnalysis = null,
    statsBlock = null,
    poolAnalysis = null,
    forensicsById = null,
    seed,
    advice = null,
    brief = null, // art-director design brief (validated by art-director.js)
    representation = null, // agency name when represented (route supplies)
    overrides = null,
    cropEngine,
  } = input;

  const decisions = [];
  const warnings = [];
  const decide = (aspect, choice, because) => decisions.push({ aspect, choice, because });
  const warn = (message) => {
    if (message && !warnings.includes(message)) warnings.push(message);
  };

  const seedUsed = seed == null || seed === "" ? "auto" : String(seed);
  const identity =
    profile?.slug || profile?.id || `${profile?.first_name || ""}-${profile?.last_name || ""}`;
  const rng = createMulberry32(seedToUint32(`${seedUsed}:director:${identity}`));

  const pool = Array.isArray(poolAnalysis?.pool) ? poolAnalysis.pool : [];
  if (Array.isArray(poolAnalysis?.warnings)) poolAnalysis.warnings.forEach(warn);
  if (pool.length === 0) warn("image pool is empty; composition is incomplete");

  const engine = resolveCropEngine(cropEngine);
  let naiveCropUsed = false;
  const cropFor = (image, aspect, kind = "cell") => {
    if (engine && typeof engine.resolveCrop === "function") {
      try {
        const crop = engine.resolveCrop(image, { aspect, role: image?.role ?? null, kind });
        if (crop && crop.fit) return crop;
      } catch {
        /* fall through */
      }
    }
    naiveCropUsed = true;
    return naiveCenterCrop();
  };

  // ── Hero selection (deterministic ranking, clamped advice, hard locks) ───
  const poolById = new Map(pool.map((p) => [p.id, p]));
  const topHero = pool[0] || null;
  const topScore = Number(topHero?.heroScore) || 0;
  let heroId =
    Array.isArray(poolAnalysis?.heroRanking) && poolAnalysis.heroRanking.length
      ? poolAnalysis.heroRanking[0]
      : topHero?.id || null;
  let heroBecause = "top of deterministic heroRanking";

  // Brief and legacy advice share the same hero clamp: a suggestion may
  // only win if it scores within ADVICE_HERO_CLAMP_POINTS of the top image.
  const heroSuggestions = [
    brief?.heroImageId != null ? { source: "brief", id: brief.heroImageId } : null,
    advice?.heroImageId !== undefined ? { source: "advice", id: advice.heroImageId } : null,
  ].filter(Boolean);
  for (const suggestion of heroSuggestions) {
    const candidate = poolById.get(suggestion.id);
    if (!candidate) {
      decide(`${suggestion.source}.heroImageId`, "ignored", `'${suggestion.id}' is not in the eligible pool`);
    } else if (Number(candidate.heroScore) < topScore - ADVICE_HERO_CLAMP_POINTS) {
      decide(
        `${suggestion.source}.heroImageId`,
        "ignored",
        `heroScore ${candidate.heroScore} is more than ${ADVICE_HERO_CLAMP_POINTS} points below top score ${topScore}`,
      );
    } else {
      heroId = candidate.id;
      heroBecause = `${suggestion.source} hero accepted (heroScore ${candidate.heroScore} within ${ADVICE_HERO_CLAMP_POINTS} of top ${topScore})`;
      break; // brief outranks advice
    }
  }
  const forcedHeroId = overrides?.heroImageId ?? overrides?.locks?.heroId;
  if (forcedHeroId != null) {
    if (poolById.has(forcedHeroId)) {
      heroId = forcedHeroId;
      heroBecause = "explicit override/lock forces hero";
    } else {
      warn(`locked hero '${forcedHeroId}' is not in the eligible pool; using ranking instead`);
      decide("override.heroImageId", "ignored", `'${forcedHeroId}' is not in the eligible pool`);
    }
  }
  const heroImage = poolById.get(heroId) || null;
  decide("hero", heroId || "none", heroBecause);

  if (advice && advice.gridPreference !== undefined) {
    decide(
      "advice.gridPreference",
      "ignored",
      "atelier engine has no preset grids — layout is solved per talent",
    );
  }

  // ── Design language (continuous parameters from the talent's data) ───────
  const heroForensics = forensicsFor(forensicsById, heroId);
  if (forensicsById && !heroForensics && heroId) {
    warn("no forensics for the hero image; heuristic bands used");
  }
  const language = synthesizeDesignLanguage({
    profile,
    archetype,
    castingAnalysis,
    statsBlock,
    poolAnalysis,
    heroForensics,
    seed: seedUsed,
    advice,
    brief,
    overrides,
    direction: input.direction || null,
    avoidVoice: input.avoidVoice || null,
  });
  language.decisions.forEach((d) => decisions.push(d));
  language.warnings.forEach(warn);
  const tone = language.toneVector;

  // ── Front geometry + typography-placement safety (production blocker) ───
  // No name ships over the photograph unless the band passes contrast,
  // quiet-zone, AND protected-subject verification. Unverifiable imagery
  // (no measurements / no focal point) never carries on-image type. When no
  // band passes on a full bleed, the treatment itself is demoted to a
  // floated hero with the name on paper.
  let frontGeometry = solveFrontGeometry({
    heroAspect: Number(heroImage?.aspect) || null,
    heroForensics,
    pacing: language.pacing,
    tone,
    seed: seedUsed,
    salt: `front:${identity}`,
    treatmentPreference: brief?.frontTreatment || null,
  });
  frontGeometry.decisions.forEach((d) => decisions.push(d));

  const relocateNameToPaper = (geometry) => {
    geometry.nameBand = {
      x: geometry.margins.left || 0.25,
      y: r3(geometry.hero.y + geometry.hero.h + 0.16),
      w: r3(PAGE_W - 2 * (geometry.margins.left || 0.25)),
      h: geometry.nameBand.h,
      onImage: false,
      inkOn: "dark",
    };
  };
  const edgeOfBand = (band) => (band.y + band.h / 2 < PAGE_H / 2 ? "top" : "bottom");

  let frontScrim = null;
  let typeSafety = { onImage: false, verified: true, because: "name set on paper" };
  if (frontGeometry.nameBand.onImage) {
    let edge = edgeOfBand(frontGeometry.nameBand);
    let verdict = evaluateNameBand({ forensics: heroForensics, edge });
    if (!verdict.ok) {
      decide("type-safety", `${edge} band rejected`, verdict.because);
      const other = edge === "top" ? "bottom" : "top";
      const alt = evaluateNameBand({ forensics: heroForensics, edge: other });
      if (alt.ok) {
        const bandH = frontGeometry.nameBand.h;
        frontGeometry.nameBand.y =
          other === "top" ? 0.25 + 0.12 : PAGE_H - 0.25 - bandH - 0.28;
        edge = other;
        verdict = alt;
        decide("name-band", `${other} (relocated on image)`, alt.because);
      } else {
        decide("type-safety", `${other} band rejected`, alt.because);
        if (frontGeometry.hero.bleedEdges.length === 4) {
          frontGeometry = solveFrontGeometry({
            heroAspect: Number(heroImage?.aspect) || null,
            heroForensics,
            pacing: language.pacing,
            tone,
            seed: seedUsed,
            salt: `front-safe:${identity}`,
            treatmentPreference: "floated",
          });
          frontGeometry.decisions.forEach((d) => decisions.push(d));
          if (frontGeometry.nameBand.onImage) relocateNameToPaper(frontGeometry);
          decide(
            "type-safety",
            "treatment demoted to floated",
            "no on-image band passes contrast + protected-subject verification — name belongs on paper",
          );
        } else {
          relocateNameToPaper(frontGeometry);
          decide("type-safety", "name relocated to paper", "no on-image band passes verification");
        }
        verdict = null;
      }
    }
    if (verdict && verdict.ok) {
      frontGeometry.nameBand.inkOn = verdict.contrast.ink;
      frontScrim = verdict.contrast.scrim
        ? { direction: verdict.contrast.scrim.direction, strength: verdict.contrast.scrim.strength, edge }
        : null;
      typeSafety = { onImage: true, verified: true, because: verdict.because };
      decide("name-contrast", verdict.contrast.verdict, verdict.because);
    }
  }
  const heroCrop = heroImage
    ? cropFor(heroImage, frontGeometry.hero.w / frontGeometry.hero.h, "hero")
    : null;
  const treatment = frontGeometry.hero.bleedEdges.length === 4 ? "full-bleed" : "bordered";

  // Brand mark: dynamically placed (quiet zones + interference + gold
  // feasibility), always GOLD — tone adapts to the backdrop so it reads on
  // dark imagery and on paper alike.
  let frontStatLineRect = language.statsPlacement.frontLine ? frontGeometry.statLine : null;
  if (frontStatLineRect && frontGeometry.hero.bleedEdges.length === 4) {
    // The front stat line sits ON the photograph at the foot of a full
    // bleed — it obeys the same blocker rules as the name.
    const statVerdict = evaluateNameBand({ forensics: heroForensics, edge: "bottom", depth: 2 });
    if (!statVerdict.ok) {
      frontStatLineRect = null;
      decide("type-safety", "front stat line dropped", statVerdict.because);
    }
  }
  const wordmarkPlacement = placeFrontWordmark({
    geometry: frontGeometry,
    heroForensics,
    treatment,
    briefCorner: brief?.wordmarkCorner || null,
    statLine: frontStatLineRect,
  });
  decide("wordmark-placement", wordmarkPlacement.corner, wordmarkPlacement.because);
  frontGeometry.wordmark = wordmarkPlacement.rect;
  const wordmarkCornerStats =
    treatment === "full-bleed" && heroForensics
      ? cornerStats(heroForensics, wordmarkPlacement.corner)
      : null;
  // Bright gold (#C9A55A) over dark imagery; deep gold (#A6845C) on paper
  // and light backdrops — gold either way, per brand.
  const frontWordmarkTone =
    treatment === "full-bleed" && (!wordmarkCornerStats || wordmarkCornerStats.mean < 0.5)
      ? "gold-bright"
      : "gold-deep";

  let nameAlign = rng() < 0.42 + 0.25 * tone.formality ? "left" : "center";
  if (advice && advice.nameAlign !== undefined) {
    if (NAME_ALIGNS.includes(advice.nameAlign)) {
      nameAlign = advice.nameAlign;
      decide("advice.nameAlign", nameAlign, "advisor alignment accepted (valid enum)");
    } else {
      decide("advice.nameAlign", "ignored", `'${advice.nameAlign}' is not a valid alignment`);
    }
  }
  if (overrides?.nameAlign !== undefined && NAME_ALIGNS.includes(overrides.nameAlign)) {
    nameAlign = overrides.nameAlign;
    decide("name-align", nameAlign, "explicit override");
  }
  const namePlacement =
    frontGeometry.nameBand.y + frontGeometry.nameBand.h / 2 < PAGE_H / 2 ? "top" : "bottom";

  // Solve the name size against the real band geometry with the voice's
  // own glyph metrics. Long names degrade by stages — flooring the size up
  // guarantees overflow, and a clipped name is a ruined card:
  //   1. solved size ≥ 17pt → ship it (×0.95 safety on estimates)
  //   2. else relax tracking toward zero and re-solve
  //   3. else STACK the name (editorial two-line treatment); the longest
  //      line drives the size
  //   4. absolute floor 12pt (unreachable in practice after stacking)
  const glyphEm = language.name.glyphEm || (language.name.case === "upper" ? 0.58 : 0.52);
  const sizeFor = (text, trackingEm, glyph = glyphEm) =>
    solveNameSizePt({
      text,
      bandWidthIn: frontGeometry.nameBand.w,
      targetSpan: language.name.targetSpan,
      trackingEm,
      glyphEm: glyph,
      clamp: false,
    });
  let nameTrackingEm = language.name.trackingEm;
  let nameLines = null;
  let rawPt = sizeFor(language.name.text, nameTrackingEm);
  if (rawPt < 17) {
    nameTrackingEm = Math.round(Math.max(0.02, nameTrackingEm * 0.45) * 1000) / 1000;
    rawPt = sizeFor(language.name.text, nameTrackingEm);
    decide("name-fit", `tracking relaxed to ${nameTrackingEm}em`, "long name — tracking gives way before size");
  }
  if (rawPt < 17) {
    const parts = language.name.text.split(/\s+/);
    if (parts.length > 1) {
      const firstLine = parts[0];
      const secondLine = parts.slice(1).join(" ");
      nameLines = [firstLine, secondLine];
      const longest = nameLines.reduce((a, b) => (b.length > a.length ? b : a));
      rawPt = sizeFor(longest, nameTrackingEm, language.name.glyphEmLongest || glyphEm);
      decide("name-fit", "stacked on two lines", "name cannot fit on one line at the minimum size");
    }
  }
  const nameSizePt =
    Math.round(Math.min(34, Math.max(12, rawPt * 0.95)) * 10) / 10;
  decide("name-size", `${nameSizePt}pt`, "solved from band width, span target, tracking");

  // ── Back partition — curated story, not leftovers ───────────────────────
  const marketSignals = (() => {
    const ca = typeof castingAnalysis === "string" ? null : castingAnalysis;
    return Array.isArray(ca?.marketSignals) ? ca.marketSignals : [];
  })();
  const curation = curateBackStory({ pool, heroId, marketSignals, max: 5 });
  curation.warnings.forEach(warn);
  if (curation.reasons.length) {
    decide("back-story", `${curation.story.length} image(s) curated`, curation.reasons.join(" | "));
  }
  let backCandidates = curation.story;
  if (backCandidates.length < 3 && pool.length > backCandidates.length) {
    // Sparse pool: reuse the hero rather than ship a sparse — or with a
    // single image, EMPTY — back page.
    backCandidates = pool.slice();
    warn("sparse pool: hero image reused on the back page");
    decide("back-pool", "hero reused", "fewer than 3 non-hero images available");
  }
  if (backCandidates.length < 3) {
    warn(`only ${backCandidates.length} image(s) available for the back layout (3 preferred)`);
  }
  const solverImages = backCandidates.map((p) => ({
    id: p.id,
    aspect: Number(p.aspect) || null,
    role: p.role ?? null,
    rawShotType: p.rawShotType || "",
    // measured face location — the crop engine's head-containment guarantee
    // is only as good as the focal it protects
    focal: p.focal ?? null,
  }));

  const pacingT = (Math.min(1.6, Math.max(0.8, language.pacing)) - 0.8) / 0.8;
  const margin = r3(lerp(0.3, 0.5, pacingT));
  const region = {
    x: margin,
    y: r3(margin * 0.8),
    w: r3(PAGE_W - 2 * margin),
    h: r3(PAGE_H - 1.6 * margin),
  };

  const backArgs = {
    region,
    images: solverImages,
    stats: {
      side: overrides?.statsSide || brief?.statsSide || "auto",
      // No stats to set → don't carve dead space; photos take the room.
      skip: !statsBlock || !Array.isArray(statsBlock.lines) || statsBlock.lines.length === 0,
    },
    pacing: language.pacing,
    tone,
    seed: seedUsed,
    salt: `back:${identity}`,
    cropEngine: engine || null,
    bleedAppetite: brief?.bleedAppetite || null,
    forceArchitecture: overrides?.forceBackArchitecture || null,
  };
  let backLayout;
  try {
    // v5: back-page ARCHITECTURE GRAMMAR (uniform-grid / feature column·row /
    // mosaic / filmstrip / editorial-stagger / restrained-duo / high-density)
    // — distinct structural families per talent + photo set, same BackLayout
    // contract. Falls back to the single-partition solver, then to the
    // deterministic fixed layout.
    const { solveBackProgram } = require("./back-program/synthesize");
    backLayout = solveBackProgram(backArgs);
    let check = validateLayout(backLayout);
    if (!check.ok) {
      decide("back-architecture", "partition fallback", check.problems.join("; "));
      backLayout = solveBackPartition(backArgs);
      check = validateLayout(backLayout);
      if (!check.ok) throw new Error(`solver invariants violated: ${check.problems.join("; ")}`);
    } else {
      decide("back-architecture", backLayout.architecture || "grammar", "back program grammar");
    }
  } catch (error) {
    warn(`layout solver unavailable (${error.message}); deterministic fallback layout used`);
    decide("back-layout", "fallback", error.message);
    backLayout = fallbackBackLayout({
      region,
      images: solverImages,
      gutter: 0.1,
      cropFor: (img, aspect) => cropFor(img, aspect),
    });
  }
  backLayout.decisions.forEach((d) => decisions.push(d));
  backLayout.warnings.forEach(warn);

  // ── Crop healing: never force a bad crop ─────────────────────────────────
  // If a cell's crop is 'unsafe' (subject presence destroyed), swap in a
  // benched image that fits the cell cleanly instead — choosing a different
  // image always beats ruining one.
  {
    const usedIds = new Set(backLayout.cells.map((c) => c.imageId));
    const benched = pool.filter((p) => p.id !== heroId && !usedIds.has(p.id));
    const levelRank = { safe: 2, caution: 1 };
    for (const cell of backLayout.cells) {
      if (cell.crop?.safety?.level !== "unsafe") continue;
      const cellAspect = cell.w / cell.h;
      let best = null;
      for (const candidate of benched) {
        const crop = cropFor(candidate, cellAspect, "cell");
        const rank = levelRank[crop.safety.level];
        if (!rank) continue;
        const score = rank * 1000 + (candidate.qualityScore || 0);
        if (!best || score > best.score) best = { candidate, crop, score };
      }
      if (best) {
        const evicted = poolById.get(cell.imageId);
        decide(
          "crop-healing",
          `${cell.imageId} → ${best.candidate.id}`,
          `unsafe crop in a ${r3(cellAspect)}-aspect cell — benched image fits cleanly (${best.crop.safety.level})`,
        );
        benched.splice(benched.indexOf(best.candidate), 1);
        if (evicted) benched.push(evicted); // may still fit another cell
        usedIds.delete(cell.imageId);
        cell.imageId = best.candidate.id;
        cell.crop = best.crop;
        usedIds.add(best.candidate.id);
      }
    }

    // Second strategy: reassign WITHIN the layout — two placed images often
    // both improve by trading cells (the wide shot leaves the tall column,
    // the portrait takes it).
    for (const cell of backLayout.cells) {
      if (cell.crop?.safety?.level !== "unsafe") continue;
      const cellAspect = cell.w / cell.h;
      const imageA = poolById.get(cell.imageId);
      let swapped = false;
      for (const other of backLayout.cells) {
        if (other === cell) continue;
        const otherAspect = other.w / other.h;
        const imageB = poolById.get(other.imageId);
        if (!imageA || !imageB) continue;
        const cropBHere = cropFor(imageB, cellAspect, "cell");
        const cropAThere = cropFor(imageA, otherAspect, "cell");
        if (
          cropBHere.safety.level !== "unsafe" &&
          cropAThere.safety.level !== "unsafe"
        ) {
          decide(
            "crop-healing",
            `${cell.imageId} ⇄ ${other.imageId}`,
            `unsafe crop in a ${r3(cellAspect)}-aspect cell — cells traded images (${cropBHere.safety.level}/${cropAThere.safety.level})`,
          );
          const movedId = other.imageId;
          other.imageId = cell.imageId;
          other.crop = cropAThere;
          cell.imageId = movedId;
          cell.crop = cropBHere;
          swapped = true;
          break;
        }
      }
      if (!swapped) {
        // Last resort: mat the image (contain on paper) — an editorial
        // treatment that keeps the whole subject. Never force a bad crop.
        cell.crop = {
          fit: "contain",
          objectPosition: "50% 50%",
          safety: {
            level: "caution",
            notes: ["matted (contain) to preserve subject presence"],
          },
          coverageLoss: 0,
        };
        decide(
          "crop-healing",
          `${cell.imageId} matted`,
          `no safe cover crop or reassignment exists for a ${r3(cellAspect)}-aspect cell — image matted on paper instead`,
        );
      }
    }
  }

  // Compatibility view for guardrails/templates that walk plan.back.slots.
  const slots = backLayout.cells.map((cell, i) => ({
    imageId: cell.imageId,
    crop: cell.crop,
    aspect: r3(cell.w / cell.h),
    area: `c${i}`,
  }));

  const contactLine = buildContactLine(profile);
  const booking = buildBookingBlock(profile, representation, {
    kids: statsBlock?.category === "kids",
  });
  decide(
    "booking",
    booking.mode === "represented" ? `Representation · ${booking.primary}` : booking.label || "none",
    booking.mode === "represented"
      ? "represented talent leads with the agency"
      : "direct-booking treatment with the same hierarchy — never a lesser fallback",
  );
  if (naiveCropUsed) warn("crop-engine unavailable; naive center crops applied (safety 'caution')");

  const toneProfile = nearestToneLabel(tone, statsBlock);

  return {
    engine: "composed",
    seedUsed,
    language,
    toneProfile, // telemetry label only — design is driven by language/geometry
    palette: {
      background: language.palette.paper,
      text: language.palette.ink,
      muted: language.palette.ink === "#111111" ? "#5C5C5C" : "#6B6560",
      accent: language.palette.accent,
      rule: language.palette.rule,
    },
    typography: {
      display: language.fonts.display,
      body: language.fonts.body,
      voiceId: language.voiceId,
      fontsUrl: fontsCssUrl([language.fonts.display, language.fonts.body]),
      nameSize: `${nameSizePt}pt`,
      nameTracking: `${nameTrackingEm}em`,
      nameCase: language.name.case === "upper" ? "uppercase" : "capitalize",
      nameWeight: language.name.weightClass,
      statSize: `${language.typeScale.statValue}pt`,
      statLabelSize: `${language.typeScale.statLabel}pt`,
      contactSize: `${language.typeScale.contact}pt`,
    },
    front: {
      imageId: heroId || null,
      crop: heroCrop,
      geometry: frontGeometry,
      treatment,
      scrim: frontScrim,
      typeSafety,
      name: {
        placement: namePlacement,
        align: nameAlign,
        rotation: language.name.rotation,
        lines: nameLines, // null = single line; ['First', 'Rest'] = stacked
      },
      statLine: frontStatLineRect,
      statLineText: frontStatLineRect
        ? (statsBlock?.lines || [])
            .slice(0, 4)
            .map((l) => `${l.label} ${l.value}`)
            .join("  ·  ")
        : null,
      showContactBlock: tone.warmth >= 0.45 && tone.formality < 0.72,
    },
    back: {
      layout: backLayout,
      slots,
      statsPlacement: backLayout.statsBlock.orientation === "column" ? "side-column" : "bottom-strip",
      contact: { line: contactLine },
      booking,
    },
    wordmark: {
      href: null, // filled by the route with the short portfolio URL
      displayUrl: null, // filled by the route (human-readable cue)
      corner: wordmarkPlacement.corner,
      align: wordmarkPlacement.corner.endsWith("left") ? "left" : "right",
      tone: frontWordmarkTone,
      front: frontGeometry.wordmark,
      back: backLayout.wordmark,
    },
    decisions,
    warnings,
  };
}

module.exports = {
  designComposition,
  buildContactLine,
  buildBookingBlock,
  placeFrontWordmark,
  nearestToneLabel,
  ADVICE_HERO_CLAMP_POINTS,
};
