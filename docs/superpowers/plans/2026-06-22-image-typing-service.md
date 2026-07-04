# Pholio Image Typing Service (PITS) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify each talent upload into existing `shot_type` / `style_type` / `image_type` columns using heuristics + Groq Scout (no custom training), with human confirmation when confidence is low — powering readiness, comp cards, and apply flows.

**Architecture:** Three layers on top of existing upload pipeline: (1) sync heuristics from `imageIntel` + optional `faces.js`, (2) async Groq JSON classifier reusing `analyzeProfileImage` patterns, (3) policy router that auto-applies or surfaces suggestions. All writes go through existing `images` columns + `metadata.ai.classification` provenance.

**Tech Stack:** Node 20, Express, Knex, Groq SDK (`meta-llama/llama-4-scout-17b-16e-instruct`), sharp, existing `image-forensics` / `faces.js`, React 19 + TanStack Query, Jest.

**Source of truth:** `docs/superpowers/specs/2026-06-22-image-typing-service-design.md`

---

## File Structure

**Create:**
- `src/domains/ai/heuristic-shot-classifier.js` — deterministic shot framing from geometry + face boxes
- `src/domains/ai/classify-portfolio-image.js` — Groq vision JSON classifier
- `src/domains/talent/services/image-classification-policy.js` — threshold bands + column/metadata updates
- `src/domains/talent/services/run-image-classification.js` — orchestrator (load image → heuristic → groq → policy → DB)
- `migrations/20260622120000_image_classification_feedback.js` — correction log table
- `tests/ai/heuristic-shot-classifier.test.js`
- `tests/ai/image-classification-policy.test.js`
- `client/src/domains/talent/components/ClassificationReviewStrip.jsx`
- `client/src/domains/talent/components/ClassificationReviewStrip.css`

**Modify:**
- `src/domains/talent/routes/media.js` — `setImmediate` hook after upload; feedback on PATCH
- `src/domains/talent/services/profile-readiness-images.js` — digitals matrix + signal helpers
- `client/src/shared/utils/profileReadinessImages.js` — mirror server matrix
- `client/src/domains/talent/components/profileReadinessItems.js` — improve-tier photo items
- `client/src/shared/utils/portfolioGapAnalysis.js` — use `shot_type` not tags
- `client/src/domains/talent/components/MediaWorkspace.jsx` — review strip + frame labels + poll
- `client/src/domains/talent/components/FrameEditor.jsx` — log feedback on user save
- `tests/dashboard/profile-strength.test.js` — digitals slots

**Reuse unchanged:** `validation.js` enums, `uploader.js`, `photo-intelligence.js`, `comp-card-selector.js`, `analyzeProfileImage.js`

---

## Task 1: Heuristic shot classifier

**Files:**
- Create: `src/domains/ai/heuristic-shot-classifier.js`
- Create: `tests/ai/heuristic-shot-classifier.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/ai/heuristic-shot-classifier.test.js
const { classifyShotHeuristic } = require("../../src/domains/ai/heuristic-shot-classifier");

describe("classifyShotHeuristic", () => {
  test("large centered face → headshot", () => {
    const r = classifyShotHeuristic({
      width: 1200,
      height: 1600,
      faces: [{ x: 0.35, y: 0.12, w: 0.3, h: 0.22 }],
    });
    expect(r.shot_type).toBe("headshot");
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
  });

  test("small face high in frame + tall aspect → full_length", () => {
    const r = classifyShotHeuristic({
      width: 1200,
      height: 2000,
      faces: [{ x: 0.42, y: 0.05, w: 0.12, h: 0.08 }],
    });
    expect(r.shot_type).toBe("full_length");
  });

  test("no faces → low confidence null", () => {
    const r = classifyShotHeuristic({ width: 1000, height: 1500, faces: [] });
    expect(r.confidence).toBeLessThan(0.5);
    expect(r.shot_type).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ai/heuristic-shot-classifier.test.js -v`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal classifier**

```javascript
// src/domains/ai/heuristic-shot-classifier.js
"use strict";

const { primaryFace } = require("../pdf/composition/perception/faces");

function clamp01(n) {
  return Math.min(1, Math.max(0, Number(n) || 0));
}

function classifyShotHeuristic({ width, height, faces = [], forensics = null } = {}) {
  const reasons = [];
  const face = primaryFace(faces);
  const aspect = width && height ? width / height : null;

  if (!face) {
    return { shot_type: null, confidence: 0.2, signals: {}, reasons: ["no_face_detected"] };
  }

  const faceArea = face.w * face.h;
  reasons.push(`face_area=${faceArea.toFixed(3)}`);

  if (faceArea >= 0.12) {
    return {
      shot_type: "headshot",
      confidence: clamp01(0.7 + faceArea),
      signals: { body_visibility: "face_only", pose_yaw: "front" },
      reasons,
    };
  }

  if (faceArea >= 0.05 && aspect && aspect < 0.9) {
    return {
      shot_type: "three_quarter",
      confidence: 0.75,
      signals: { body_visibility: "three_quarter", pose_yaw: "three_quarter" },
      reasons,
    };
  }

  if (faceArea < 0.08 && face.y < 0.35) {
    return {
      shot_type: "full_length",
      confidence: 0.82,
      signals: { body_visibility: "full_length", pose_yaw: "front" },
      reasons,
    };
  }

  if (face.x < 0.08 || face.x + face.w > 0.92) {
    const shot = face.x < 0.5 ? "profile_left" : "profile_right";
    return {
      shot_type: shot,
      confidence: 0.7,
      signals: { body_visibility: "face_only", pose_yaw: shot },
      reasons: [...reasons, "lateral_face"],
    };
  }

  return { shot_type: null, confidence: 0.4, signals: {}, reasons };
}

module.exports = { classifyShotHeuristic };
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/ai/heuristic-shot-classifier.test.js -v`  
Expected: PASS

---

## Task 2: Classification policy router

**Files:**
- Create: `src/domains/talent/services/image-classification-policy.js`
- Create: `tests/ai/image-classification-policy.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
const { applyClassificationPolicy } = require("../../src/domains/talent/services/image-classification-policy");

describe("applyClassificationPolicy", () => {
  test("high shot confidence auto-writes column when unset", () => {
    const r = applyClassificationPolicy({
      imageRow: { shot_type: null, style_type: null, image_type: null, metadata: {} },
      classification: {
        shot_type: "headshot",
        style_type: null,
        image_type: "digital",
        confidence: { shot_type: 0.92, style_type: 0.4, image_type: 0.85 },
        signals: {},
        reasoning: "test",
        uncertainty_factors: [],
      },
    });
    expect(r.band).toBe("auto");
    expect(r.columnUpdates.shot_type).toBe("headshot");
    expect(r.columnUpdates.image_type).toBe("digital");
    expect(r.columnUpdates.style_type).toBeUndefined();
  });

  test("never overwrites user-set source", () => {
    const r = applyClassificationPolicy({
      imageRow: {
        shot_type: "full_length",
        metadata: { ai: { classification: { source: "user" } } },
      },
      classification: {
        shot_type: "headshot",
        confidence: { shot_type: 0.99, style_type: 0.99, image_type: 0.99 },
        signals: {},
        uncertainty_factors: [],
      },
    });
    expect(r.columnUpdates.shot_type).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement policy**

Implement `applyClassificationPolicy`, `bandForField(confidence, field)`, `buildMetadataProvenance()` per spec §5.3. Export thresholds as constants for tuning.

- [ ] **Step 4: Run tests — expect PASS**

---

## Task 3: Groq portfolio classifier

**Files:**
- Create: `src/domains/ai/classify-portfolio-image.js`

- [ ] **Step 1: Implement Groq call (no CI test — mock in Task 4)**

Copy lazy Groq init pattern from `src/domains/ai/analyzeProfileImage.js`. Export:

```javascript
async function classifyPortfolioImage({ imageBuffer, heuristicDraft, forensicsSummary })
```

Prompt must:
- List allowed values from `IMAGE_TYPE_VALUES`, `SHOT_TYPE_VALUES`, `STYLE_TYPE_VALUES` (import from `validation.js`)
- Include heuristic draft + forensics text as context
- Return parsed JSON matching spec schema
- Return `null` on missing API key or parse failure (fail soft)

Model: `meta-llama/llama-4-scout-17b-16e-instruct`, temperature `0.1`, max tokens `800`.

- [ ] **Step 2: Manual smoke test (dev only)**

Run with a sample WebP from `uploads/` and `node -e "..."` script if GROQ_API_KEY set; otherwise skip.

---

## Task 4: Orchestrator + DB migration

**Files:**
- Create: `src/domains/talent/services/run-image-classification.js`
- Create: `migrations/20260622120000_image_classification_feedback.js`

- [ ] **Step 1: Migration**

```javascript
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable("image_classification_feedback");
  if (exists) return;
  await knex.schema.createTable("image_classification_feedback", (table) => {
    table.uuid("id").primary();
    table.uuid("image_id").notNullable().references("id").inTable("images").onDelete("CASCADE");
    table.uuid("profile_id").notNullable().references("id").inTable("profiles").onDelete("CASCADE");
    table.string("predicted_shot_type").nullable();
    table.string("predicted_style_type").nullable();
    table.string("predicted_image_type").nullable();
    table.string("corrected_shot_type").nullable();
    table.string("corrected_style_type").nullable();
    table.string("corrected_image_type").nullable();
    table.jsonb("confidence_json").nullable();
    table.string("model").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.index(["profile_id"]);
    table.index(["image_id"]);
  });
};
```

Run: `npm run migrate`

- [ ] **Step 2: Implement `runImageClassification(knex, imageId)`**

1. Load image row + read file buffer from `absolute_path` (or skip if missing)
2. Parse `metadata` for existing `imageIntel` / forensics
3. Optional: `detectFaces(buffer)` from `faces.js`
4. `classifyShotHeuristic(...)`
5. `classifyPortfolioImage(...)` — merge per spec
6. `applyClassificationPolicy(...)`
7. `knex('images').where({ id }).update({ ...columnUpdates, metadata: merged })`
8. Never throw — wrap in try/catch, log `[PITS]`

- [ ] **Step 3: Wire upload hook in `media.js`**

After each successful insert in POST `/`:

```javascript
const { runImageClassification } = require("../services/run-image-classification");
// inside loop after push to uploadedImages:
setImmediate(() => {
  runImageClassification(knex, imageId).catch((err) =>
    console.warn("[PITS] classification failed:", imageId, err.message),
  );
});
```

Add `classification_status: "pending"` to upload response objects.

- [ ] **Step 4: Feedback on PATCH**

In media PATCH handler, when structured fields change, compare to `metadata.ai.classification` predicted values; insert feedback row if different and `source !== 'user'` already on prior prediction.

---

## Task 5: Readiness + gap analysis (server + client mirror)

**Files:**
- Modify: `src/domains/talent/services/profile-readiness-images.js`
- Modify: `client/src/shared/utils/profileReadinessImages.js`
- Modify: `client/src/domains/talent/components/profileReadinessItems.js`
- Modify: `client/src/shared/utils/portfolioGapAnalysis.js`
- Modify: `tests/dashboard/profile-strength.test.js`

- [ ] **Step 1: Extend `analyzeBookReadiness`**

Add:

```javascript
function analyzeDigitalsReadiness(images = []) {
  const book = analyzeBookReadiness(images);
  const hasProfile = list.some((img) => hasShotType(img, ["profile_left", "profile_right"]));
  const hasSmile = list.some(hasSmileHeadshot); // metadata.ai.signals.expression === 'smile'
  const hasBack = list.some((img) => hasShotType(img, ["back"]));
  const hasEditorial = list.some((img) => normalizeToken(img.style_type) === "editorial");
  const hasLifestyle = list.some((img) =>
    ["lifestyle", "commercial"].includes(normalizeToken(img.style_type)),
  );
  return { ...book, hasProfile, hasSmile, hasBack, hasEditorial, hasLifestyle };
}
```

- [ ] **Step 2: Mirror on client** — copy exports to `profileReadinessImages.js`

- [ ] **Step 3: Rewrite `portfolioGapAnalysis.js`** to call same slot rules (import from profileReadinessImages or duplicate minimal helpers)

- [ ] **Step 4: Extend profile-strength tests**

Run: `npx jest tests/dashboard/profile-strength.test.js -v`  
Expected: PASS

---

## Task 6: Classification review UI

**Files:**
- Create: `client/src/domains/talent/components/ClassificationReviewStrip.jsx`
- Create: `client/src/domains/talent/components/ClassificationReviewStrip.css`
- Modify: `client/src/domains/talent/components/MediaWorkspace.jsx`

- [ ] **Step 1: Helper to read classification state**

```javascript
function getClassificationState(image) {
  const ai = parseMetadata(image)?.ai?.classification;
  if (!ai) return { status: 'pending', band: 'pending' };
  return {
    status: ai.band === 'pending' ? 'pending' : 'ready',
    band: ai.band,
    label: formatTypeLabel(image.shot_type, image.image_type),
    suggested: ai.shot_type?.value,
    reasoning: ai.reasoning,
  };
}
```

- [ ] **Step 2: ClassificationReviewStrip**

- Lists images where `band === 'suggest' || band === 'ask'`
- **Use this** → `talentApi.updateMedia(id, { shot_type, style_type, image_type, metadata: { ai: { classification: { source: 'user', confirmed: true }}}})`
- No corner badges — plain text only

- [ ] **Step 3: Frame caption in PortfolioFrame**

Below index: plain `mw-frame__type-label` text from columns or suggestion.

- [ ] **Step 4: Poll while pending**

In `useMedia` or MediaWorkspace: if any image `classification_status === 'pending'`, set `refetchInterval: 2000` for 30s max.

- [ ] **Step 5: Undo toast for auto-applied**

On auto band, toast with action calling PATCH to clear `shot_type` and mark user override.

- [ ] **Step 6: Lint**

Run: `cd client && npm run lint`

---

## Task 7: FrameEditor feedback hook

**Files:**
- Modify: `client/src/domains/talent/components/FrameEditor.jsx`

- [ ] **Step 1: On save success**, if form shot/style/image differs from `metadata.ai.classification.*.value`, include `metadata.ai.classification.source = 'user'` and `confirmed: true` in PATCH body (server logs feedback in Task 4).

---

## Task 8: Integration verification

- [ ] **Step 1: Backend tests**

Run: `npx jest tests/ai/ tests/dashboard/profile-strength.test.js -v`  
Expected: all PASS

- [ ] **Step 2: Manual golden path**

1. `npm run dev:all`
2. Upload headshot + full-length as talent
3. Within ~5s, frames show type labels or review strip
4. Profile strength reflects headshot + full-body
5. Comp card page picks hero by `shot_type`

- [ ] **Step 3: Verify Groq-less graceful degradation**

Unset `GROQ_API_KEY`, upload — heuristics still populate metadata; no 500 errors.

---

## Plan self-review (spec coverage)

| Spec section | Task |
|--------------|------|
| Heuristic layer | Task 1 |
| Groq classifier | Task 3 |
| Policy router | Task 2 |
| Upload hook | Task 4 |
| Feedback table | Task 4 |
| Readiness matrix | Task 5 |
| Client UX | Task 6–7 |
| No custom model | Explicit — Groq + heuristics only |
| portfolioGapAnalysis fix | Task 5 |

No placeholders remain in task code blocks.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-06-22-image-typing-service.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement tasks in this session with checkpoints  

Which approach do you want?
