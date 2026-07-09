/**
 * Comp Card Composition Engine — orchestrator (WS-D)
 *
 * Single entry point that wires the composition modules together:
 *
 *   profile.image_analysis ──parse──▶ castingAnalysis
 *   castingAnalysis + archetype ─────▶ buildStatsBlock (signals)
 *   images ──────────────────────────▶ analyzeImagePool
 *   poolAnalysis ─(best-effort)──────▶ getCompositionAdvice (Groq, gated)
 *   everything ──────────────────────▶ designComposition (deterministic plan)
 *   plan + images ───────────────────▶ extended guardrail report
 *
 * DB-free by contract: the route resolves the archetype (loadArchetype) and
 * passes it in. AI advice is strictly advisory and strictly gated — it runs
 * only when `options.aiAdvice !== false`, GROQ_API_KEY is set, and
 * NODE_ENV !== 'test'; any failure degrades to `advice = null` and never
 * blocks composition.
 *
 * Exports:
 *   async composeCompCard({ profile, images, archetype, options }) →
 *     { plan, statsBlock, poolAnalysis, guardrailReport, advice }
 *
 *   options: {
 *     seed,                         // reproducible art direction
 *     locks: { heroId, gridIds },   // selector-style locks
 *     aiAdvice: boolean,            // default true (env-gated regardless)
 *     unitsPreference,              // 'dual' | 'imperial' | 'metric'
 *     engineOverrides,              // director overrides (tone, gridId, …)
 *     mode,                         // 'draft' | 'master' (guardrail report)
 *     adviceTimeoutMs,              // forwarded to the advisor
 *   }
 */

"use strict";

const { buildStatsBlock } = require("./stats-formatter");
const { analyzeImagePool } = require("./photo-intelligence");
const { designComposition } = require("./composition-director");
const { getDesignBrief, validateBrief } = require("./art-director");
const crypto = require("crypto");
const { evaluateCompCardGuardrails } = require("../guardrails");

/**
 * Persisted briefs carry { tone: {formality,...} }; validateBrief expects the
 * flat axis fields — flatten for re-validation on load.
 */
function flattenTone(brief) {
  const tone = brief && brief.tone;
  if (!tone || typeof tone !== "object") return {};
  return {
    formality: tone.formality,
    warmth: tone.warmth,
    energy: tone.energy,
    density: tone.density,
  };
}

/**
 * Defensive parse for JSON-ish columns (string | object | null).
 * @param {*} value
 * @returns {object}
 */
function parseJsonish(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resolve the archetype label whether the route passed a string or a
 * `{ label, verdict }` object (loadArchetype shape).
 * @param {*} archetype
 * @returns {string|null}
 */
function resolveArchetypeLabel(archetype) {
  if (archetype == null) return null;
  if (typeof archetype === "string") return archetype.trim() || null;
  if (typeof archetype === "object" && archetype.label != null) {
    const label = String(archetype.label).trim();
    return label || null;
  }
  return null;
}

/**
 * Build the text-only pool summary the AI advisor reasons over
 * (no pixel data, no PII beyond image ids/labels).
 * @param {object} poolAnalysis
 * @param {Array<object>} images — original rows (for labels)
 * @returns {Array<{id, role, qualityScore, heroScore, label}>}
 */
function buildPoolSummary(poolAnalysis, images) {
  const labelById = new Map(
    (Array.isArray(images) ? images : [])
      .filter((img) => img && img.id != null)
      .map((img) => [img.id, img.label ?? null]),
  );
  const pool = Array.isArray(poolAnalysis?.pool) ? poolAnalysis.pool : [];
  return pool.map((item) => ({
    id: item.id,
    role: item.role ?? null,
    qualityScore: item.qualityScore,
    heroScore: item.heroScore,
    label: labelById.get(item.id) ?? null,
  }));
}

/**
 * Merge route locks + caller engine overrides into the director's
 * `overrides` argument. Returns null when there is nothing to override.
 * @param {object} opts — composeCompCard options
 * @returns {object|null}
 */
function buildOverrides(opts) {
  const overrides = {};
  if (opts.engineOverrides && typeof opts.engineOverrides === "object") {
    Object.assign(overrides, opts.engineOverrides);
  }
  if (opts.locks && typeof opts.locks === "object") {
    overrides.locks = { ...(overrides.locks || {}), ...opts.locks };
  }
  if (opts.forceBackArchitecture) {
    overrides.forceBackArchitecture = opts.forceBackArchitecture;
  }
  return Object.keys(overrides).length > 0 ? overrides : null;
}

/**
 * Recompute the guardrail summary from a checks array — identical logic to
 * guardrails.js `summarize()` so the extended report keeps the exact base
 * shape instead of hand-mutating counters.
 * @param {Array<{id, level, message}>} checks
 * @returns {{status, blockingIssueCount, warningCount, blockingIssues, warnings}}
 */
function summarizeChecks(checks) {
  const blockingIssues = checks.filter((check) => check.level === "error");
  const warnings = checks.filter((check) => check.level === "warn");
  const status =
    blockingIssues.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass";
  return {
    status,
    blockingIssueCount: blockingIssues.length,
    warningCount: warnings.length,
    blockingIssues,
    warnings,
  };
}

/**
 * Crop-safety checks for the composed plan (hero + every back slot).
 * 'unsafe' → error-level check; 'caution' → warn-level check.
 * @param {object} plan — CompositionPlan
 * @returns {Array<{id, level, message}>}
 */
function buildCropSafetyChecks(plan) {
  const targets = [];
  if (plan?.front?.crop) {
    targets.push({
      where: "front hero",
      imageId: plan.front.imageId,
      crop: plan.front.crop,
    });
  }
  const slots = Array.isArray(plan?.back?.slots) ? plan.back.slots : [];
  slots.forEach((slot) => {
    if (!slot || !slot.crop) return;
    targets.push({
      where: `back slot '${slot.area}'`,
      imageId: slot.imageId,
      crop: slot.crop,
    });
  });

  const checks = [];
  targets.forEach((target) => {
    const level = target.crop?.safety?.level;
    if (level !== "unsafe" && level !== "caution") return;
    const notes = Array.isArray(target.crop?.safety?.notes)
      ? target.crop.safety.notes.join("; ")
      : "";
    const detail = notes ? ` (${notes})` : "";
    if (level === "unsafe") {
      checks.push({
        id: "composed-crop-unsafe",
        level: "error",
        message: `Unsafe crop on ${target.where} — image ${target.imageId || "unknown"}${detail}.`,
      });
    } else {
      checks.push({
        id: "composed-crop-caution",
        level: "warn",
        message: `Caution crop on ${target.where} — image ${target.imageId || "unknown"}${detail}.`,
      });
    }
  });
  return checks;
}

/**
 * Extended guardrail evaluation for the composed engine: the base
 * `evaluateCompCardGuardrails` report (run on the images the plan actually
 * selected) with composed-engine checks appended, and the summary recomputed.
 *
 * Report shape is IDENTICAL to guardrails.js:
 *   { mode, status, blockingIssueCount, warningCount,
 *     blockingIssues, warnings, checks }
 *
 * @param {object} params
 * @param {object} params.profile
 * @param {Array<object>} params.images — full image rows
 * @param {object} params.plan — CompositionPlan
 * @param {object} params.statsBlock — StatsBlock
 * @param {string} [params.mode] — 'draft' | 'master'
 * @returns {object} extended guardrail report
 */
function buildComposedGuardrailReport({
  profile,
  images,
  plan,
  statsBlock,
  mode,
}) {
  const rows = Array.isArray(images) ? images : [];
  const byId = new Map(
    rows.filter((img) => img && img.id != null).map((img) => [img.id, img]),
  );

  // Map plan imageIds back to the original image rows.
  const heroImage =
    plan?.front?.imageId != null
      ? byId.get(plan.front.imageId) || null
      : null;
  const slots = Array.isArray(plan?.back?.slots) ? plan.back.slots : [];
  const gridImages = slots.map((slot) =>
    slot && slot.imageId != null ? byId.get(slot.imageId) || null : null,
  );

  const base = evaluateCompCardGuardrails({
    profile,
    images: rows,
    heroImage,
    gridImages,
    mode,
  });

  const extra = [...buildCropSafetyChecks(plan)];

  (Array.isArray(statsBlock?.warnings) ? statsBlock.warnings : []).forEach(
    (warning) => {
      extra.push({
        id: "composed-stats-warning",
        level: "warn",
        message: `Stats: ${warning}`,
      });
    },
  );

  const fullBodyWarning = (
    Array.isArray(plan?.warnings) ? plan.warnings : []
  ).find((warning) => /full-body|full-length/i.test(String(warning)));
  if (fullBodyWarning) {
    extra.push({
      id: "composed-full-body-missing",
      level: "warn",
      message: `Composition: ${fullBodyWarning}`,
    });
  }

  // PRODUCTION BLOCKER: on-image typography must carry a verification from
  // the type-safety system. The director enforces this; an unverified
  // on-image name reaching this point is a hard failure, never a warning.
  const ts = plan?.front?.typeSafety;
  if (ts && ts.onImage && !ts.verified) {
    extra.push({
      id: "composed-type-safety",
      level: "error",
      message: `On-image name placement is unverified — ${ts.because || "no verification recorded"}.`,
    });
  }

  const staleWarning = (Array.isArray(plan?.warnings) ? plan.warnings : []).find((w) =>
    /under 6 months|months old/i.test(String(w)),
  );
  if (staleWarning) {
    extra.push({
      id: "composed-photos-stale",
      level: "warn",
      message: `Recency: ${staleWarning}`,
    });
  }

  // A professional card must give a caster a way to book the talent.
  const booking = plan?.back?.booking;
  if (booking && !booking.primary && !booking.line) {
    extra.push({
      id: "composed-booking-missing",
      level: "warn",
      message:
        "No representation or booking contact available — the card cannot be acted on by a caster.",
    });
  }

  const checks = [...base.checks, ...extra];
  return {
    mode: base.mode,
    ...summarizeChecks(checks),
    checks,
  };
}

/**
 * Compose an intelligent comp card for one talent. Deterministic for a given
 * (profile, images, seed) when advice is disabled/unavailable; the advisor —
 * when it runs — can only bias choices the director validates and clamps.
 *
 * @param {object} params
 * @param {object} params.profile — profiles row (image_analysis parsed here)
 * @param {Array<object>} params.images — images rows (raw, unfiltered)
 * @param {object|string|null} [params.archetype] — loadArchetype result
 *   ({ label, verdict }) or a bare label; the route resolves it (DB-free here)
 * @param {object} [params.options] — see module JSDoc
 * @returns {Promise<{plan, statsBlock, poolAnalysis, guardrailReport, advice}>}
 */
async function composeCompCard({ profile, images, archetype, options } = {}) {
  const profileRow = profile && typeof profile === "object" ? profile : {};
  const imageRows = Array.isArray(images) ? images : [];
  const opts = options && typeof options === "object" ? options : {};

  // 1. Casting analysis (defensive: string | object | null).
  const castingAnalysis = parseJsonish(profileRow.image_analysis);
  const archetypeLabel = resolveArchetypeLabel(archetype);

  // 2. Stats block — fitness signals from castingAnalysis + archetype label.
  const statsBlock = buildStatsBlock(profileRow, {
    units: opts.unitsPreference,
    signals: {
      marketSignals: Array.isArray(castingAnalysis.marketSignals)
        ? castingAnalysis.marketSignals
        : [],
      lookType: castingAnalysis.lookType ?? null,
      archetypeLabel,
    },
  });

  // 3. Image pool intelligence.
  const poolAnalysis = analyzeImagePool({
    images: imageRows,
    profile: profileRow,
    castingAnalysis,
  });

  // 4. Art-director design brief — Groq strict-schema planning layer
  // (typography voice, tone axes, treatment, stat placement, bleed
  // appetite, hero). Best-effort, hard-gated, never blocks composition;
  // the director keeps deterministic vetoes over everything it adopts.
  //
  // PERSISTENCE: the brief is a talent-level identity decision, so it is
  // fingerprinted against the inputs it was authored from and reused until
  // those inputs change — regeneration with a new seed varies geometry
  // under the SAME authored direction (stable regeneration).
  const poolSummary = buildPoolSummary(poolAnalysis, imageRows);
  const briefFingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        images: poolSummary.map((x) => x.id).sort(),
        lookType: castingAnalysis.lookType ?? null,
        marketSignals: castingAnalysis.marketSignals ?? null,
        archetypeLabel,
        category: statsBlock.category,
        isFitness: statsBlock.isFitness,
        representation: opts.representation || null,
      }),
    )
    .digest("hex");

  let brief = null;
  const briefEnabled =
    opts.aiAdvice !== false &&
    Boolean(process.env.GROQ_API_KEY) &&
    process.env.NODE_ENV !== "test";
  const store = opts.briefStore && typeof opts.briefStore === "object" ? opts.briefStore : null;
  if (store && typeof store.load === "function") {
    try {
      const saved = await store.load();
      if (saved && saved.fingerprint === briefFingerprint && saved.brief) {
        brief = validateBrief(
          { ...saved.brief, ...flattenTone(saved.brief) },
          poolSummary,
        ) || null;
        if (brief) {
          console.log("[composition] persisted design brief reused (fingerprint match)");
        }
      }
    } catch {
      brief = null;
    }
  }
  if (!brief && briefEnabled) {
    try {
      brief = await getDesignBrief({
        profile: profileRow,
        castingAnalysis,
        archetype,
        poolSummary,
        statsBlock,
        forensicsById: opts.forensicsById || null,
        timeoutMs: opts.adviceTimeoutMs,
      });
      if (brief && store && typeof store.save === "function") {
        store
          .save({ brief, fingerprint: briefFingerprint, authoredAt: new Date().toISOString() })
          ?.catch?.(() => {});
      }
    } catch (error) {
      // getDesignBrief never throws by contract, but the engine must
      // survive even a broken planning module.
      console.warn(
        `[composition] design brief failed (${error.message}) — composing without it`,
      );
      brief = null;
    }
  }

  // 5. Deterministic composition plan (advice validated/clamped inside).
  // forensicsById (Map<imageId, Forensics|null>) is supplied by the route —
  // measured image pixels driving palette/quiet-zone/layout decisions.
  const plan = designComposition({
    profile: profileRow,
    archetype,
    castingAnalysis,
    statsBlock,
    poolAnalysis,
    forensicsById: opts.forensicsById || null,
    seed: opts.seed,
    brief,
    representation: opts.representation || null,
    // Deterministic advice (e.g. board → tone register from the directions
    // catalog); validated and clamped inside design-language/director.
    advice: opts.advice || null,
    // Pinned creative direction — salts the voice cast so each direction
    // carries a distinct typographic identity for the same seed.
    direction: opts.forceStructure || null,
    // take-to-take diversity: the previous take's voice is excluded
    avoidVoice: (opts.avoid && opts.avoid.voice) || null,
    overrides: buildOverrides(opts),
  });

  // 6. Extended guardrails on the actually-selected images.
  const guardrailReport = buildComposedGuardrailReport({
    profile: profileRow,
    images: imageRows,
    plan,
    statsBlock,
    mode: opts.mode,
  });

  // 7. Front-page design PROGRAM (v4) — opt-in. A grammar-sampled element
  // tree for the front, replacing the fixed front geometry. Hero/crop/
  // forensics come from the plan; the back page is unchanged. Best-effort:
  // any failure leaves plan.frontProgram null and the legacy front renders.
  if (opts.frontEngine === "program") {
    try {
      const { designFrontProgram } = require("./front-program/synthesize");
      const heroForensics =
        plan.front && plan.front.imageId
          ? (opts.forensicsById instanceof Map
              ? opts.forensicsById.get(plan.front.imageId)
              : opts.forensicsById && opts.forensicsById[plan.front.imageId]) || null
          : null;
      // Subject matte (P1): from opts.matteById when the route computed one
      // (requires @imgly/background-removal-node). Absent ⇒ null ⇒ the
      // synthesizer simply never samples mask-dependent structures.
      const matteGrid =
        plan.front && plan.front.imageId && opts.matteById
          ? (opts.matteById instanceof Map
              ? opts.matteById.get(plan.front.imageId)
              : opts.matteById[plan.front.imageId]) || null
          : null;
      const heroPoolEntry =
        plan.front && plan.front.imageId && Array.isArray(poolAnalysis?.pool)
          ? poolAnalysis.pool.find((p) => p.id === plan.front.imageId) || null
          : null;
      const front = designFrontProgram(
        {
          // raw image aspect + the cover crop the renderer will apply — the
          // sampler maps all on-photo verification into the visible window
          heroAspect:
            (heroForensics && Number(heroForensics.aspect)) ||
            (heroPoolEntry && Number(heroPoolEntry.aspect)) ||
            null,
          heroCrop: plan.front?.crop || null,
          heroForensics,
          matteGrid: matteGrid && matteGrid.maskGrid ? matteGrid.maskGrid : matteGrid,
          // 'alpha' (real matting) unlocks the cutout structure; 'studio'
          // (sharp-only backdrop estimate) powers negative-space placement
          // only. Legacy cached mattes predate the source field = alpha.
          matteSource: matteGrid ? matteGrid.source || "alpha" : null,
          palette: plan.palette,
          typography: plan.typography,
          nameText:
            `${profileRow.first_name || ""} ${profileRow.last_name || ""}`.trim() || "Untitled",
          nameMetrics: (() => {
            const metrics = {
              advanceEm: plan.language?.name?.glyphEm || 0.6,
              advanceLongestEm: plan.language?.name?.glyphEmLongest || null,
              measured: Boolean(plan.language?.name?.glyphMeasured),
              trackingEm: plan.language?.name?.trackingEm,
            };
            // Split-zone lockup metrics (first name in heavy display over
            // the photo, surname in tracked caps on a panel): measured per
            // segment at the weights the motif renders.
            try {
              const { nameAdvanceEm, heaviestWeight } = require("./perception/font-files");
              const nameText =
                `${profileRow.first_name || ""} ${profileRow.last_name || ""}`.trim();
              const parts = nameText.split(/\s+/);
              if (parts.length > 1) {
                const display = plan.typography?.display;
                const heavy = heaviestWeight(display);
                metrics.first = {
                  advanceEm: nameAdvanceEm({
                    family: display,
                    weight: heavy,
                    text: parts[0],
                    nameCase: "upper",
                  }).advanceEm,
                  weight: heavy,
                };
                metrics.last = {
                  advanceEm: nameAdvanceEm({
                    family: display,
                    weight: plan.language?.name?.weightClass || 500,
                    text: parts.slice(1).join(" "),
                    nameCase: "upper",
                  }).advanceEm,
                  weight: plan.language?.name?.weightClass || 500,
                };
                // body-font surname variant (grotesque caps against the
                // display first name — classification contrast on purpose)
                metrics.lastBody = {
                  advanceEm: nameAdvanceEm({
                    family: plan.typography?.body || "Inter",
                    weight: 600,
                    text: parts.slice(1).join(" "),
                    nameCase: "upper",
                  }).advanceEm,
                  weight: 600,
                };
              }
            } catch {
              /* split metrics are optional — the motif falls back to estimates */
            }
            return metrics;
          })(),
          contactLine: plan.back?.contact?.line || null,
          language: plan.language,
          brief,
        },
        {
          seed: opts.seed,
          candidates: 5,
          // named-directions seam: pin the field structure for this compose
          forceStructure: opts.forceStructure || null,
          // talent-facing name-treatment pin (classic/statement/variant)
          forceTreatment: opts.forceTreatment || null,
          // "Another take" diversity: penalize repeating the previous take
          avoid: opts.avoid || null,
          // P4 jury wiring: `frontCandidateIndex` forces a specific
          // candidate (the rasterizer renders each; the jury picks the
          // winner, then the final card re-renders with that index).
          pickIndex: Number.isInteger(opts.frontCandidateIndex)
            ? opts.frontCandidateIndex
            : null,
        },
      );
      plan.frontProgram = front.program;
      plan.frontProgramMeta = {
        signature: front.signature,
        candidates: front.candidates,
        score: front.score,
        structure: front.program.structure,
      };

      // Wordmark follow-up: the gold mark must consult the PROGRAM's
      // occupied rects, not sit in a fixed corner that crowds sampled
      // elements. Pick the 5.5×8.5 corner whose 0.95×0.2in slot least
      // overlaps any program element; set gold tone from the plane under it.
      try {
        const W = 0.95, H = 0.2, M = 0.25;
        const corners = [
          { id: "bottom-right", x: 5.5 - M - W, y: 8.5 - M - H, align: "right" },
          { id: "bottom-left", x: M, y: 8.5 - M - H, align: "left" },
          { id: "top-right", x: 5.5 - M - W, y: M, align: "right" },
          { id: "top-left", x: M, y: M, align: "left" },
        ];
        const occ = front.program.elements.filter((e) => e.rect && e.type !== "colorPlane");
        const overlap = (a, b) => {
          const ow = Math.max(0, Math.min(a.x + W, b.x + b.w) - Math.max(a.x, b.x));
          const oh = Math.max(0, Math.min(a.y + H, b.y + b.h) - Math.max(a.y, b.y));
          return ow * oh;
        };
        let bestCorner = corners[0];
        let bestOverlap = Infinity;
        for (const c of corners) {
          const total = occ.reduce((s, e) => s + overlap(c, e.rect), 0);
          // slight bias to the house default (bottom-right) on ties
          const adj = total + (c.id === "bottom-right" ? -0.0005 : 0);
          if (adj < bestOverlap) { bestOverlap = adj; bestCorner = c; }
        }
        const onPhoto = front.program.elements.some(
          (e) => e.type === "photo" &&
            bestCorner.x + W > e.rect.x && e.rect.x + e.rect.w > bestCorner.x &&
            bestCorner.y + H > e.rect.y && e.rect.y + e.rect.h > bestCorner.y,
        );
        const r3 = (n) => Math.round(n * 1000) / 1000;
        plan.wordmark.front = { x: r3(bestCorner.x), y: r3(bestCorner.y), w: W, h: H };
        plan.wordmark.align = bestCorner.align;
        plan.wordmark.tone = onPhoto ? "gold-bright" : "gold-deep";
      } catch {
        /* keep the director's wordmark placement */
      }
    } catch (error) {
      console.warn(`[composition] front program failed (${error.message}) — legacy front`);
      plan.frontProgram = null;
    }
  }

  // Rendered-name-integrity tripwire (audit P0-1): with measured glyph
  // metrics the program's name must fit the rect the search verified — a
  // violation is an engine regression, caught here instead of shipping.
  // The renderer's fit guard additionally self-heals at draw time, so this
  // surfaces as a warning (telemetry + test tripwire), not a user blocker.
  try {
    // split-role names carry their own text and are verified inside the
    // sampler; the tripwire measures the generic full-name element only
    const nameEl = plan.frontProgram?.elements?.find((e) => e.type === "name" && !e.role);
    const lang = plan.language?.name;
    if (nameEl && lang && nameEl.orientation === "horizontal") {
      const { nameAdvanceEm } = require("./perception/font-files");
      const lines = nameEl.stacked && String(lang.text).includes(" ")
        ? [String(lang.text).split(/\s+/)[0], String(lang.text).split(/\s+/).slice(1).join(" ")]
        : [String(lang.text)];
      const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
      const { advanceEm: adv } = nameAdvanceEm({
        family: plan.typography?.display,
        weight: lang.weightClass,
        text: longest,
        nameCase: lang.case,
      });
      const widthIn = longest.length * (adv + (nameEl.trackingEm || 0)) * (nameEl.sizePt / 72);
      if (widthIn > nameEl.rect.w * 1.02 + 0.02) {
        const checks = [
          ...guardrailReport.checks,
          {
            id: "rendered-name-integrity",
            level: "warn",
            message: `Front name measures ${widthIn.toFixed(2)}in against a ${nameEl.rect.w.toFixed(2)}in rect — renderer fit guard will shrink it; the composer should not have produced this.`,
          },
        ];
        Object.assign(guardrailReport, summarizeChecks(checks), { checks });
      }
    }
  } catch {
    /* tripwire only — never block composition */
  }

  return { plan, statsBlock, poolAnalysis, guardrailReport, brief, advice: brief };
}

// Composition engine version, stamped onto frozen saved cards (P1-6). Bump
// when a change would redesign existing seeds (geometry, scoring, grammar).
const ENGINE_VERSION = "composed-v5.0";

module.exports = {
  composeCompCard,
  ENGINE_VERSION,
  // Exposed for tests:
  buildComposedGuardrailReport,
  buildPoolSummary,
};
