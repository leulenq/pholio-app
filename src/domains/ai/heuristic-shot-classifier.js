"use strict";

/**
 * Deterministic shot framing from geometry + optional face boxes.
 * No ML — uses output from perception/faces.js when available.
 */

function clamp01(n) {
  return Math.min(1, Math.max(0, Number(n) || 0));
}

function primaryFace(faces) {
  if (!Array.isArray(faces) || faces.length === 0) return null;
  let best = null;
  let bestArea = -1;
  for (const b of faces) {
    if (!b || !Number.isFinite(b.w) || !Number.isFinite(b.h)) continue;
    const area = b.w * b.h;
    if (area > bestArea) {
      bestArea = area;
      best = b;
    }
  }
  return best;
}

/**
 * @param {object} input
 * @param {number|null} input.width
 * @param {number|null} input.height
 * @param {Array<{x:number,y:number,w:number,h:number}>} [input.faces]
 * @returns {{ shot_type: string|null, confidence: number, signals: object, reasons: string[] }}
 */
function classifyShotHeuristic({ width, height, faces = [] } = {}) {
  const reasons = [];
  const face = primaryFace(faces);
  const aspect = width && height ? width / height : null;

  if (!face) {
    return {
      shot_type: null,
      confidence: 0.2,
      signals: {},
      reasons: ["no_face_detected"],
    };
  }

  const faceArea = face.w * face.h;
  reasons.push(`face_area=${faceArea.toFixed(3)}`);

  if (faceArea >= 0.12) {
    return {
      shot_type: "headshot",
      confidence: clamp01(0.7 + Math.min(faceArea, 0.25)),
      signals: { body_visibility: "face_only", pose_yaw: "front" },
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

  return {
    shot_type: null,
    confidence: 0.4,
    signals: {},
    reasons,
  };
}

module.exports = { classifyShotHeuristic, primaryFace };
