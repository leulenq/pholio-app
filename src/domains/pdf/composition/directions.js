/**
 * Named creative directions (audit P0-3).
 *
 * A direction is a real art-direction choice — a field structure the front
 * program is pinned to — not a reshuffle. The catalog is the talent-facing
 * contract: ids are stable (persisted on saved cards), labels/descriptions
 * are the copy the dashboard shows. "Studio cutout" only unlocks when a
 * subject matte exists for the hero (the engine refuses to fake it).
 *
 * Board conditioning: a saved card's board (division) nudges the design
 * language through the existing bounded advice channel (±0.15 tone nudges,
 * validated inside design-language.js) — a Runway card skews formal, a
 * Commercial card warm. Deterministic, no AI required.
 */

const DIRECTIONS = Object.freeze([
  {
    id: "full-bleed",
    structure: "photo-dominant",
    label: "Full bleed",
    description: "One frame carries the card — your name on a clean strip at its foot.",
  },
  {
    id: "gallery-mat",
    structure: "matted",
    label: "Gallery mat",
    description: "The photograph set deep on paper, gallery-style, your name beneath.",
  },
  {
    id: "split-field",
    structure: "split",
    label: "Split field",
    description: "Photograph beside a quiet paper field that carries your name.",
  },
  {
    id: "studio-cutout",
    structure: "cutout",
    label: "Studio cutout",
    requiresMatte: true,
    description: "Your figure lifted onto a flat plane, type set into the negative space.",
  },
]);

const STRUCTURES = Object.freeze(DIRECTIONS.map((d) => d.structure));

function isDirectionStructure(value) {
  return STRUCTURES.includes(value);
}

function directionForStructure(structure) {
  return DIRECTIONS.find((d) => d.structure === structure) || null;
}

/**
 * Deterministic board → tone-register advice (the same bounded channel the
 * AI advisor uses; design-language validates and clamps every nudge).
 * @param {string|null} board
 * @returns {{ tone: string }|null}
 */
function boardAdvice(board) {
  const b = String(board || "").trim().toLowerCase();
  if (!b) return null;
  if (b === "runway") return { tone: "high-fashion" };
  if (b === "editorial") return { tone: "editorial-classic" };
  if (b === "commercial" || b === "beauty" || b === "curve") return { tone: "commercial-warm" };
  if (b === "fitness") return { tone: "fitness-bold" };
  return null;
}

module.exports = {
  DIRECTIONS,
  isDirectionStructure,
  directionForStructure,
  boardAdvice,
};
