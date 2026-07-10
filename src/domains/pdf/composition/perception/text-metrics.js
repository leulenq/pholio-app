/**
 * Exact text metrics (perception engine, P1) — HarfBuzz-shaped.
 *
 * Measures REAL shaped advances per font/size/tracking so the composition
 * engine can fit names by measurement instead of the calibrated
 * capAdvanceEm/titleAdvanceEm ESTIMATES in font-library.js. The PDF renderer
 * is Chromium, and Chromium shapes text with HarfBuzz — so this module shapes
 * with HarfBuzz too (harfbuzzjs, the upstream WASM build) and gets parity by
 * construction.
 *
 * Why not opentype.js (the previous implementation): opentype.js silently
 * ignores class-based GPOS kerning (Bodoni Moda / Playfair Display / Noto
 * Serif Display returned 0 for every kern pair) and its getAdvanceWidth
 * throws on fonts with GSUB lookup-type-6 features (Inter, Archivo), falling
 * to a weaker path. Both failure modes OVERESTIMATED name widths by 5–10%,
 * and because the fit guard only shrinks, names shipped undersized. HarfBuzz
 * applies the full GSUB/GPOS pipeline exactly as the renderer will.
 *
 * Engineering: harfbuzzjs ships an ESM-only JS wrapper (top-level await), but
 * its .wasm binary is self-contained — it exports its own memory and needs
 * only five trivial Emscripten host imports — so we instantiate it
 * SYNCHRONOUSLY here and call the hb_* C API directly: no async init, no ESM
 * interop, works under Jest/CJS. Everything is fail-soft: a missing
 * dependency, an unreadable path, or a corrupt font yields null (or, for
 * callers, a deliberate hop to estimateLine), never a throw. Mirrors the
 * lazy-sharp discipline in image-forensics.js.
 *
 * Tracking convention (shared by measureLine + estimateLine): trackingEm is
 * applied as additional advance of `trackingEm * sizePt` after EVERY glyph
 * (matching CSS letter-spacing), i.e. total tracking = trackingEm * sizePt *
 * text.length. Both functions use this identical convention so a caller can
 * swap measurement for estimate without a discontinuity.
 *
 * Case transforms are the caller's job (font-files.js applyNameCase) — the
 * string passed in must already be the exact string the renderer will draw.
 */

const fs = require("fs");
const path = require("path");

const PT_PER_IN = 72; // 1pt = 1/72in
const DEFAULT_ADVANCE_EM = 0.55; // neutral per-glyph advance for estimateLine
const DEFAULT_CAP_RATIO = 0.7; // cap-height / em fallback when font absent
const METRICS_VERSION = 2; // v2: HarfBuzz shaping (v1 was opentype.js)

const WASM_PAGE = 65536;
const SHAPE_CACHE_MAX = 512; // per-font shaped-width memo bound

// ── HarfBuzz WASM runtime (lazy, synchronous) ─────────────────────────────

let hbRuntime; // { ex } — instantiated wasm exports
let hbLoadFailed = false;

function hbTag(s) {
  return (
    ((s.charCodeAt(0) & 255) << 24) |
    ((s.charCodeAt(1) & 255) << 16) |
    ((s.charCodeAt(2) & 255) << 8) |
    (s.charCodeAt(3) & 255)
  );
}

/**
 * Locate harfbuzzjs's wasm binary. require.resolve honours the package's
 * exports map (which points at dist/index.mjs); the wasm sits next to it.
 */
function findWasmPath() {
  const entry = require.resolve("harfbuzzjs");
  return path.join(path.dirname(entry), "harfbuzz.wasm");
}

/** Lazy sync-instantiate HarfBuzz; null (cached) when unavailable. */
function getHb() {
  if (hbRuntime) return hbRuntime;
  if (hbLoadFailed) return null;
  try {
    const wasmBytes = fs.readFileSync(findWasmPath());
    const wasmModule = new WebAssembly.Module(wasmBytes);
    let ex = null; // assigned below; env closures run only during hb_* calls
    const env = {
      emscripten_resize_heap(requested) {
        const current = ex.memory.buffer.byteLength;
        const need = (requested >>> 0) - current;
        if (need <= 0) return 1;
        try {
          ex.memory.grow(Math.ceil(need / WASM_PAGE));
          return 1;
        } catch {
          return 0;
        }
      },
      _emscripten_runtime_keepalive_clear() {},
      _abort_js() {
        throw new Error("harfbuzz wasm abort");
      },
      _setitimer_js() {
        return 0;
      },
    };
    const instance = new WebAssembly.Instance(wasmModule, {
      env,
      wasi_snapshot_preview1: { proc_exit() {} },
    });
    ex = instance.exports;
    if (typeof ex.__wasm_call_ctors === "function") ex.__wasm_call_ctors();
    hbRuntime = { ex };
    return hbRuntime;
  } catch {
    hbLoadFailed = true;
    return null;
  }
}

// Heap views are NOT cached — memory.grow() detaches old ArrayBuffers.
const heapU8 = (ex) => new Uint8Array(ex.memory.buffer);
const heapI32 = (ex) => new Int32Array(ex.memory.buffer);

// ── Font handles ──────────────────────────────────────────────────────────

// Loaded fonts are cached by absolute path. A null entry means "we tried this
// path and it isn't usable" — so we never re-read a broken/missing file.
const fontCache = new Map();

/** Cap-height / em ratio via OT metrics (synthesized fallback inside hb). */
function readCapRatio(ex, fontPtr, upem) {
  try {
    const out = ex.malloc(4);
    ex.hb_ot_metrics_get_position_with_fallback(fontPtr, hbTag("cpht"), out);
    const cap = heapI32(ex)[out >> 2];
    ex.free(out);
    if (Number.isFinite(cap) && cap > 0 && upem > 0) return cap / upem;
  } catch {
    /* fall through */
  }
  return DEFAULT_CAP_RATIO;
}

/**
 * Build a font handle from raw bytes: copy into the wasm heap, create
 * blob → face → font. Validity is checked via the 'head' table (present in
 * every real TTF/OTF; zero-length for garbage — hb_face_create itself never
 * fails, it just yields an empty face). Returns null for anything unusable.
 * Handles live for the process lifetime (they back the path cache), so the
 * font bytes stay resident in the wasm heap by design.
 */
function createHandle(buffer) {
  const hb = getHb();
  if (!hb || !buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return null;
  }
  const { ex } = hb;
  let dataPtr = 0;
  let blobPtr = 0;
  let facePtr = 0;
  let fontPtr = 0;
  try {
    dataPtr = ex.malloc(buffer.length);
    heapU8(ex).set(buffer, dataPtr);
    // mode 2 = HB_MEMORY_MODE_WRITABLE, no destroy callback (we own dataPtr)
    blobPtr = ex.hb_blob_create(dataPtr, buffer.length, 2, 0, 0);
    facePtr = ex.hb_face_create(blobPtr, 0);
    const head = ex.hb_face_reference_table(facePtr, hbTag("head"));
    const headLen = ex.hb_blob_get_length(head);
    ex.hb_blob_destroy(head);
    const upem = ex.hb_face_get_upem(facePtr);
    if (!headLen || !Number.isFinite(upem) || upem <= 0) throw new Error("not a font");
    fontPtr = ex.hb_font_create(facePtr);
    return {
      hbFont: true,
      unitsPerEm: upem,
      capRatio: readCapRatio(ex, fontPtr, upem),
      fontPtr,
      shapeCache: new Map(), // text → total shaped advance in em
    };
  } catch {
    try {
      if (fontPtr) ex.hb_font_destroy(fontPtr);
      if (facePtr) ex.hb_face_destroy(facePtr);
      if (blobPtr) ex.hb_blob_destroy(blobPtr);
      if (dataPtr) ex.free(dataPtr);
    } catch {
      /* best-effort cleanup */
    }
    return null;
  }
}

/**
 * Parse a font from a Buffer. Returns a font handle or null. Not cached
 * (buffers aren't reliably keyable).
 * @param {Buffer} buffer
 * @returns {object|null}
 */
function parseFontBuffer(buffer) {
  return createHandle(buffer);
}

/**
 * Load + cache a font from a filesystem path. Returns a font handle or
 * null on any failure (dep missing, file missing, parse error).
 * @param {string} fontPath
 * @returns {object|null}
 */
function loadFont(fontPath) {
  if (typeof fontPath !== "string" || !fontPath) return null;
  if (fontCache.has(fontPath)) return fontCache.get(fontPath);
  let handle = null;
  try {
    handle = createHandle(fs.readFileSync(fontPath));
  } catch {
    handle = null;
  }
  fontCache.set(fontPath, handle);
  return handle;
}

// ── Shaping ───────────────────────────────────────────────────────────────

/**
 * Total shaped advance for a string, in EM units — the full HarfBuzz
 * pipeline (GSUB substitutions + GPOS kerning), identical to what Chromium
 * applies at render time. Memoized per font handle (shaping runs in request
 * paths; the same name is measured repeatedly during a solve).
 * @returns {number|null}
 */
function totalAdvanceEm(handle, text) {
  if (!handle || !handle.hbFont) return null;
  if (!text.length) return 0;
  const cached = handle.shapeCache.get(text);
  if (cached !== undefined) return cached;
  const hb = getHb();
  if (!hb) return null;
  const { ex } = hb;
  let textPtr = 0;
  let bufPtr = 0;
  try {
    const utf8 = Buffer.from(text, "utf8");
    textPtr = ex.malloc(utf8.length);
    heapU8(ex).set(utf8, textPtr);
    bufPtr = ex.hb_buffer_create();
    ex.hb_buffer_add_utf8(bufPtr, textPtr, utf8.length, 0, utf8.length);
    ex.hb_buffer_guess_segment_properties(bufPtr);
    ex.hb_shape(handle.fontPtr, bufPtr, 0, 0);
    const glyphCount = ex.hb_buffer_get_length(bufPtr);
    const posPtr = ex.hb_buffer_get_glyph_positions(bufPtr, 0);
    const i32 = heapI32(ex);
    const base = posPtr >> 2;
    let total = 0;
    for (let i = 0; i < glyphCount; i += 1) {
      total += i32[base + i * 5]; // hb_glyph_position_t.x_advance (5 × int32)
    }
    const em = total / handle.unitsPerEm;
    if (!Number.isFinite(em)) return null;
    if (handle.shapeCache.size >= SHAPE_CACHE_MAX) handle.shapeCache.clear();
    handle.shapeCache.set(text, em);
    return em;
  } catch {
    return null;
  } finally {
    try {
      if (bufPtr) ex.hb_buffer_destroy(bufPtr);
      if (textPtr) ex.free(textPtr);
    } catch {
      /* best-effort cleanup */
    }
  }
}

/**
 * Average per-glyph advance (em) for a string in a given font — the measured
 * analogue of font-library's capAdvanceEm/titleAdvanceEm estimates (same
 * semantics: tracking excluded, em units, divided by CHARACTER count so a
 * caller's `chars × advanceEm` math reproduces the shaped total exactly).
 * @param {object} font — a font handle (from loadFont/parseFontBuffer)
 * @param {string} text
 * @returns {number|null}
 */
function advanceEmFor(font, text) {
  if (!font || !font.hbFont) return null;
  const str = typeof text === "string" ? text : "";
  if (!str.length) return 0;
  const totalEm = totalAdvanceEm(font, str);
  if (!Number.isFinite(totalEm)) return null;
  return totalEm / str.length;
}

/**
 * EXACT measurement of a single line (HarfBuzz-shaped).
 * @param {object} args
 * @param {string} [args.fontPath] — path to a TTF/OTF (cached)
 * @param {Buffer} [args.fontBuffer] — alternative to fontPath
 * @param {string} args.text
 * @param {number} args.sizePt — font size in points
 * @param {number} [args.trackingEm=0] — letter-spacing in em
 * @returns {{ widthIn:number, heightIn:number, version:number }|null}
 *   null when harfbuzz/font is unavailable or input is invalid — the signal
 *   for a caller to fall back to estimateLine.
 */
function measureLine({ fontPath, fontBuffer, text, sizePt, trackingEm = 0 } = {}) {
  if (typeof text !== "string" || !Number.isFinite(sizePt) || sizePt <= 0) {
    return null;
  }
  const font = fontBuffer ? parseFontBuffer(fontBuffer) : loadFont(fontPath);
  if (!font) return null;
  const totalEm = totalAdvanceEm(font, text);
  if (!Number.isFinite(totalEm)) return null;
  const track = Number.isFinite(trackingEm) ? trackingEm : 0;
  const widthPt = totalEm * sizePt + track * sizePt * text.length;
  return {
    widthIn: Math.max(0, widthPt / PT_PER_IN),
    heightIn: Math.max(0, (font.capRatio * sizePt) / PT_PER_IN),
    version: METRICS_VERSION,
  };
}

/**
 * ESTIMATE of a single line (no font file required). Mirrors the historical
 * estimate math: width = (advanceEm + trackingEm) · sizePt · len. Always
 * returns an object for valid numeric input so callers degrade cleanly; the
 * same tracking convention as measureLine.
 * @param {object} args
 * @param {string} args.text
 * @param {number} args.sizePt
 * @param {number} [args.trackingEm=0]
 * @param {number} [args.advanceEm] — per-glyph advance estimate (em); from
 *   font-library's capAdvanceEm/titleAdvanceEm when known
 * @returns {{ widthIn:number, heightIn:number, estimated:true }}
 */
function estimateLine({ text, sizePt, trackingEm = 0, advanceEm } = {}) {
  const str = typeof text === "string" ? text : "";
  const size = Number.isFinite(sizePt) && sizePt > 0 ? sizePt : 0;
  const adv = Number.isFinite(advanceEm) && advanceEm > 0 ? advanceEm : DEFAULT_ADVANCE_EM;
  const track = Number.isFinite(trackingEm) ? trackingEm : 0;
  const widthIn = ((adv + track) * size * str.length) / PT_PER_IN;
  const heightIn = (DEFAULT_CAP_RATIO * size) / PT_PER_IN;
  return {
    widthIn: Math.max(0, widthIn),
    heightIn: Math.max(0, heightIn),
    estimated: true,
  };
}

module.exports = {
  loadFont,
  parseFontBuffer,
  measureLine,
  estimateLine,
  advanceEmFor,
  METRICS_VERSION,
};
