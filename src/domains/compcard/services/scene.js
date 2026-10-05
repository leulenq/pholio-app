"use strict";

/**
 * Validates a composed card scene sent by the studio before it is stored
 * and printed. The server renders scenes in headless Chromium, so nothing
 * from the client reaches the page unchecked: element types, fonts and
 * colours are allow-listed, text is length-capped, and every photograph
 * must be one of the talent's own visible images — its URL is resolved
 * server-side from the image id, never taken from the client.
 */

const FORMATS = {
  us: { w: 139.7, h: 215.9, bleed: 3.175 },
  a5: { w: 148, h: 210, bleed: 3 },
};
const FAMILIES = new Set(["mono", "serif", "sans", "grotesk", "hanken"]);
const TYPES = new Set(["photo", "text", "rect", "rule"]);
const COLOR = /^#[0-9a-fA-F]{6}$/;
const DIRECTIONS = new Set(["clearing", "field", "lineup", "atelier"]);

class SceneError extends Error {}

const num = (v, lo, hi) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new SceneError("Out-of-range value in scene");
  return Math.round(n * 1000) / 1000;
};
const opt = (v, fn) => (v == null ? undefined : fn(v));
const color = (v) => {
  if (!COLOR.test(String(v))) throw new SceneError("Invalid colour");
  return String(v);
};
const bleed = (b) => {
  if (!b || typeof b !== "object") return undefined;
  const out = {};
  for (const k of ["t", "r", "b", "l"]) if (b[k]) out[k] = 1;
  return out;
};

function font(f) {
  if (!f || !FAMILIES.has(f.family)) throw new SceneError("Invalid font");
  return {
    family: f.family,
    weight: num(f.weight ?? 400, 100, 900),
    style: f.style === "italic" ? "italic" : undefined,
    size: num(f.size, 3, 400),
    tracking: opt(f.tracking, (v) => num(v, -0.2, 0.5)),
    stretch: opt(f.stretch, (v) => num(v, 50, 125)),
    opsz: opt(f.opsz, (v) => num(v, 6, 96)),
    caps: f.caps === "small" ? "small" : undefined,
    numeric: ["tabular", "oldstyle", "lining"].includes(f.numeric) ? f.numeric : undefined,
  };
}

/**
 * @param scene     client scene
 * @param imagesById Map(imageId → { src })
 * @returns sanitised scene
 */
function sanitizeScene(scene, imagesById) {
  if (!scene || typeof scene !== "object") throw new SceneError("Missing scene");
  const formatId = scene.format?.id;
  const format = FORMATS[formatId];
  if (!format) throw new SceneError("Unknown format");
  if (!DIRECTIONS.has(scene.direction)) throw new SceneError("Unknown direction");
  if (!Array.isArray(scene.pages) || scene.pages.length < 1 || scene.pages.length > 2) throw new SceneError("A card has a front and a back");
  const W = format.w + 20;
  const H = format.h + 20;

  const pages = scene.pages.map((p) => {
    if (!Array.isArray(p.elements) || p.elements.length > 400) throw new SceneError("Too many elements");
    const elements = p.elements.map((el) => {
      if (!TYPES.has(el.type)) throw new SceneError("Unknown element");
      const base = {
        type: el.type,
        x: num(el.x, -20, W),
        y: num(el.y, -20, H),
        w: num(el.w ?? 0, 0, W + 20),
        h: num(el.h ?? 0, 0, H + 20),
        z: opt(el.z, (v) => num(v, -5, 20)),
      };
      if (el.type === "photo") {
        const img = el.imageId ? imagesById.get(String(el.imageId)) : null;
        if (el.imageId && !img) throw new SceneError("Photo is not in your media library");
        const c = el.crop;
        return {
          ...base,
          slot: typeof el.slot === "string" ? el.slot.slice(0, 20) : undefined,
          imageId: img ? String(el.imageId) : null,
          src: img ? img.src : null,
          crop: c ? { x: num(c.x, -2, 2), y: num(c.y, -2, 2), w: num(c.w, 0.01, 5), h: num(c.h, 0.01, 5) } : null,
          fill: opt(el.fill, color),
          bleed: bleed(el.bleed),
        };
      }
      if (el.type === "text") {
        const lines = (Array.isArray(el.lines) ? el.lines : [el.text]).slice(0, 12).map((l) => String(l ?? "").slice(0, 240));
        return {
          ...base,
          lines,
          font: font(el.font),
          color: color(el.color || "#111111"),
          align: ["left", "right", "center"].includes(el.align) ? el.align : "left",
          leading: opt(el.leading, (v) => num(v, 0, 100)),
          rotate: el.rotate === -90 || el.rotate === 90 ? el.rotate : undefined,
        };
      }
      return { ...base, fill: color(el.fill), bleed: bleed(el.bleed) };
    });
    return { name: p.name === "back" ? "back" : "front", paper: color(p.paper || "#FFFFFF"), elements };
  });
  return { direction: scene.direction, format: { id: formatId, ...format }, pages };
}

module.exports = { sanitizeScene, SceneError, FORMATS };
