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
const FAMILIES = new Set(["bodoni", "archivo", "noto", "mono", "inter"]);
const TYPES = new Set(["photo", "text", "rect", "rule"]);
// #RRGGBB or numeric rgb()/rgba() only — nothing that could carry url() or a function.
const COLOR = /^(?:#[0-9a-fA-F]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\))$/;
const DIRECTIONS = new Set(["cover", "show", "letters", "digitals", "spine", "foil"]);
const BOX_SHADOW = /^(?:0 [0-9.]+mm [0-9.]+mm (?:-?[0-9.]+mm )?rgba\([0-9., ]+\)(?:, )?)+$/;
const AXES = new Set(["SOFT", "WONK", "opsz"]);
// Gradients: only linear/radial with hex or rgba() stops — no url(), no functions.
const GRADIENT = /^(linear|radial)-gradient\((?:[a-z0-9 .%,#()-]|rgba?\([0-9., ]+\))+\)$/i;
const SHADOW = /^drop-shadow\(0 [0-9.]+mm [0-9.]+mm (?:#[0-9a-fA-F]{6,8}|rgba\([0-9., ]+\))\)$/;

class SceneError extends Error {}

const num = (v, lo, hi, field = "value") => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new SceneError(`Out-of-range ${field} in scene`);
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
    tracking: opt(f.tracking, (v) => num(v, -0.2, 1, "tracking")),
    stretch: opt(f.stretch, (v) => num(v, 50, 125)),
    opsz: opt(f.opsz, (v) => num(v, 6, 96)),
    caps: f.caps === "small" ? "small" : f.caps === "upper" ? "upper" : undefined,
    numeric: ["tabular", "oldstyle", "lining"].includes(f.numeric) ? f.numeric : undefined,
    axes: f.axes && typeof f.axes === "object" ? Object.fromEntries(Object.entries(f.axes).filter(([k]) => AXES.has(k)).map(([k, v]) => [k, num(v, 0, 1000)])) : undefined,
  };
}

/** Type filled with one of the talent's photographs, or a foil gradient. */
function textFill(f, imagesById) {
  if (!f || typeof f !== "object") return undefined;
  if (f.kind === "gradient") {
    if (!GRADIENT.test(String(f.css)) || String(f.css).length > 300) throw new SceneError("Invalid fill");
    return { kind: "gradient", css: String(f.css) };
  }
  if (f.kind === "image") {
    const img = f.imageId ? imagesById.get(String(f.imageId)) : null;
    if (!img) throw new SceneError("Photo is not in your media library");
    return { kind: "image", imageId: String(f.imageId), src: img.src, x: num(f.x, -600, 600), y: num(f.y, -600, 600), w: num(f.w, 1, 1500), h: num(f.h, 1, 1500) };
  }
  return undefined;
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
        // Cutout figures may extend well past the trim (only part shows).
        x: num(el.x, -600, 600),
        y: num(el.y, -600, 600),
        w: num(el.w ?? 0, 0, 1200),
        h: num(el.h ?? 0, 0, 1200),
        z: opt(el.z, (v) => num(v, -5, 20)),
        spin: el.spin && typeof el.spin === "object" ? { deg: num(el.spin.deg, -15, 15), ox: num(el.spin.ox, -50, 300), oy: num(el.spin.oy, -50, 300) } : undefined,
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
          crop: c ? { x: num(c.x, -5, 5), y: num(c.y, -5, 5), w: num(c.w, 0.01, 10), h: num(c.h, 0.01, 10) } : null,
          fill: opt(el.fill, color),
          bleed: bleed(el.bleed),
          // Cutout layers: marked here, the matte itself is resolved server-side.
          cutout: el.cutout ? true : undefined,
          breakout: el.breakout ? true : undefined,
          decorative: el.decorative ? true : undefined,
          opacity: opt(el.opacity, (v) => num(v, 0, 1)),
          fade: el.fade && typeof el.fade === "object" ? Object.fromEntries(["t", "r", "b", "l"].filter((k) => el.fade[k]).map((k) => [k, num(el.fade[k], 0, 300)])) : undefined,
          shadow: el.shadow && SHADOW.test(String(el.shadow)) ? String(el.shadow) : undefined,
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
          fill: textFill(el.fill, imagesById),
        };
      }
      const gradient = el.gradient && GRADIENT.test(String(el.gradient)) && String(el.gradient).length < 300 ? String(el.gradient) : undefined;
      if (!gradient && !el.fill) throw new SceneError("Shape needs a fill");
      return {
        ...base,
        fill: el.fill ? color(el.fill) : undefined,
        gradient,
        bleed: bleed(el.bleed),
        opacity: opt(el.opacity, (v) => num(v, 0, 1)),
        boxShadow: el.boxShadow && BOX_SHADOW.test(String(el.boxShadow)) ? String(el.boxShadow) : undefined,
      };
    });
    return { name: p.name === "back" ? "back" : "front", paper: color(p.paper || "#FFFFFF"), elements };
  });
  return { direction: scene.direction, format: { id: formatId, ...format }, pages };
}

module.exports = { sanitizeScene, SceneError, FORMATS };
