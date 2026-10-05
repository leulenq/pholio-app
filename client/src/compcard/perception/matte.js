/**
 * Subject matting — a print-grade alpha matte of the person.
 *
 * MODNet (Apache-2.0, trimap-free portrait matting) runs in WebAssembly at
 * a working resolution; the matte is then upsampled to print resolution and
 * refined against the full-resolution photograph with a guided filter, so
 * the edge follows real hair rather than a blurred mask.
 *
 * Output: a decontaminated RGBA cutout (PNG data URL), aligned 1:1 with the
 * source image — the photo with the subject's own edge colours and the
 * matte as alpha, ready to composite on any ground.
 */
import * as ort from 'onnxruntime-web/wasm';
import { loadImage } from './analyze';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
const asset = (p) => `${BASE.replace(/\/$/, '')}/compcard/${p}`;

let sessionPromise = null;
function session() {
  if (!sessionPromise) {
    // The loader (.mjs) is bundled by Vite; only the binary is served as-is.
    ort.env.wasm.wasmPaths = { wasm: asset('ort/ort-wasm-simd-threaded.wasm') };
    ort.env.wasm.numThreads = 1;
    sessionPromise = ort.InferenceSession.create(asset('models/modnet.onnx'), { executionProviders: ['wasm'] }).catch((e) => {
      sessionPromise = null;
      throw e;
    });
  }
  return sessionPromise;
}

const round32 = (v) => Math.max(32, Math.round(v / 32) * 32);

/** Box filter via integral image (radius r) on a Float32Array w×h. */
function boxFilter(src, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const s = I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return out;
}

/** Guided filter (He et al.): refine alpha p using guide I (luma). */
function guidedFilter(I, p, w, h, r, eps) {
  const n = w * h;
  const meanI = boxFilter(I, w, h, r);
  const meanP = boxFilter(p, w, h, r);
  const Ip = new Float32Array(n);
  const II = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    Ip[i] = I[i] * p[i];
    II[i] = I[i] * I[i];
  }
  const corrIp = boxFilter(Ip, w, h, r);
  const corrII = boxFilter(II, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = corrII[i] - meanI[i] * meanI[i];
    const covIp = corrIp[i] - meanI[i] * meanP[i];
    a[i] = covIp / (varI + eps);
    b[i] = meanP[i] - a[i] * meanI[i];
  }
  const meanA = boxFilter(a, w, h, r);
  const meanB = boxFilter(b, w, h, r);
  const q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = Math.max(0, Math.min(1, meanA[i] * I[i] + meanB[i]));
  return q;
}

/**
 * Matte one image.
 * @param src     image URL
 * @param opts    { work: model short side (px), out: output long side (px), refine: bool }
 * @returns { url, width, height, coverage }  url = PNG data URL (alpha = matte)
 */
export async function matteImage(src, opts = {}) {
  const work = opts.work || 640;
  const outLong = opts.out || 1800;
  const [img, sess] = await Promise.all([loadImage(src), session()]);
  const W0 = img.naturalWidth;
  const H0 = img.naturalHeight;

  // Model input: short side ≈ work, both sides multiples of 32.
  const s = work / Math.min(W0, H0);
  const mw = round32(W0 * s);
  const mh = round32(H0 * s);
  const c = document.createElement('canvas');
  c.width = mw;
  c.height = mh;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, mw, mh);
  const px = cx.getImageData(0, 0, mw, mh).data;
  const input = new Float32Array(3 * mw * mh);
  for (let i = 0; i < mw * mh; i++) {
    input[i] = (px[i * 4] / 255 - 0.5) / 0.5;
    input[mw * mh + i] = (px[i * 4 + 1] / 255 - 0.5) / 0.5;
    input[2 * mw * mh + i] = (px[i * 4 + 2] / 255 - 0.5) / 0.5;
  }
  const feeds = { [sess.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, mh, mw]) };
  const result = await sess.run(feeds);
  const alpha = result[sess.outputNames[0]].data; // [1,1,mh,mw]

  // Upsample to output resolution.
  const k = Math.min(1, outLong / Math.max(W0, H0));
  const ow = Math.round(W0 * k);
  const oh = Math.round(H0 * k);
  const small = document.createElement('canvas');
  small.width = mw;
  small.height = mh;
  const sctx = small.getContext('2d');
  const sd = sctx.createImageData(mw, mh);
  for (let i = 0; i < mw * mh; i++) {
    const v = Math.round(Math.max(0, Math.min(1, alpha[i])) * 255);
    sd.data[i * 4] = v;
    sd.data[i * 4 + 1] = v;
    sd.data[i * 4 + 2] = v;
    sd.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(sd, 0, 0);
  const big = document.createElement('canvas');
  big.width = ow;
  big.height = oh;
  const bctx = big.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, ow, oh);
  const up = bctx.getImageData(0, 0, ow, oh).data;
  let p = new Float32Array(ow * oh);
  for (let i = 0; i < ow * oh; i++) p[i] = up[i * 4] / 255;

  if (opts.refine !== false) {
    // Guide: full-resolution luminance of the photograph.
    const g = document.createElement('canvas');
    g.width = ow;
    g.height = oh;
    const gctx = g.getContext('2d', { willReadFrequently: true });
    gctx.drawImage(img, 0, 0, ow, oh);
    const gp = gctx.getImageData(0, 0, ow, oh).data;
    const I = new Float32Array(ow * oh);
    for (let i = 0; i < ow * oh; i++) I[i] = (0.299 * gp[i * 4] + 0.587 * gp[i * 4 + 1] + 0.114 * gp[i * 4 + 2]) / 255;
    const r = Math.max(2, Math.round(Math.max(ow, oh) / 600));
    p = guidedFilter(I, p, ow, oh, r, 4e-5);
  }

  let cov = 0;
  const A = new Float32Array(ow * oh);
  // Tighten the matte: MODNet leaves a low-alpha haze beyond the real hair
  // edge. A smoothstep between 0.16 and 0.84 removes the haze and keeps
  // strands crisp.
  const lo = opts.lo ?? 0.16;
  const hi = opts.hi ?? 0.84;
  for (let i = 0; i < ow * oh; i++) {
    const t = Math.max(0, Math.min(1, (p[i] - lo) / (hi - lo)));
    A[i] = t * t * (3 - 2 * t);
    cov += A[i];
  }

  // Foreground colour decontamination: at the edge, replace the photo's
  // colour (subject mixed with old backdrop) with the subject's own colour,
  // estimated as an alpha-weighted blur of the solid interior nearby.
  const src2 = document.createElement('canvas');
  src2.width = ow;
  src2.height = oh;
  const s2 = src2.getContext('2d', { willReadFrequently: true });
  s2.drawImage(img, 0, 0, ow, oh);
  const rgb = s2.getImageData(0, 0, ow, oh);
  const R = new Float32Array(ow * oh);
  const G = new Float32Array(ow * oh);
  const B = new Float32Array(ow * oh);
  const W2 = new Float32Array(ow * oh);
  for (let i = 0; i < ow * oh; i++) {
    // Weight by alpha^3: lean on confidently-subject pixels.
    const w = A[i] * A[i] * A[i];
    W2[i] = w;
    R[i] = rgb.data[i * 4] * w;
    G[i] = rgb.data[i * 4 + 1] * w;
    B[i] = rgb.data[i * 4 + 2] * w;
  }
  const rad = Math.max(3, Math.round(Math.max(ow, oh) / 260));
  const bw = boxFilter(W2, ow, oh, rad);
  const br = boxFilter(R, ow, oh, rad);
  const bg = boxFilter(G, ow, oh, rad);
  const bb = boxFilter(B, ow, oh, rad);
  const cut = s2.createImageData(ow, oh);
  for (let i = 0; i < ow * oh; i++) {
    const a = A[i];
    let r = rgb.data[i * 4];
    let g2 = rgb.data[i * 4 + 1];
    let b2 = rgb.data[i * 4 + 2];
    if (a > 0 && a < 0.97 && bw[i] > 1e-4) {
      // Blend toward the estimated foreground as alpha falls.
      const t = Math.min(1, (0.97 - a) / 0.6);
      r = r * (1 - t) + (br[i] / bw[i]) * t;
      g2 = g2 * (1 - t) + (bg[i] / bw[i]) * t;
      b2 = b2 * (1 - t) + (bb[i] / bw[i]) * t;
    }
    cut.data[i * 4] = r;
    cut.data[i * 4 + 1] = g2;
    cut.data[i * 4 + 2] = b2;
    cut.data[i * 4 + 3] = Math.round(a * 255);
  }
  s2.putImageData(cut, 0, 0);
  return { url: src2.toDataURL('image/png'), width: ow, height: oh, coverage: cov / (ow * oh) };
}
