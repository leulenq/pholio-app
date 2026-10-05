import { describe, expect, it } from 'vitest';
import { requiredRegion, solveCrop } from '../model/crop';

// Deterministic PRNG so failures reproduce.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomSubject(r) {
  const width = 600 + Math.floor(r() * 3400);
  const height = 600 + Math.floor(r() * 3400);
  const fw = 0.06 + r() * 0.4;
  const fh = Math.min(0.5, fw * (width / height) * 1.35);
  const fx = r() * (1 - fw);
  const fy = 0.05 + r() * (0.6 - fh);
  const headTop = Math.max(0, fy - fh * (0.2 + r() * 0.5));
  const chin = fy + fh;
  const bodyBottom = Math.min(1, chin + r() * (1 - chin));
  const feetInFrame = r() > 0.5 && bodyBottom < 0.97;
  return {
    width,
    height,
    aspect: width / height,
    known: true,
    people: 1,
    face: { box: { x: fx, y: fy, w: fw, h: fh }, eyeY: fy + fh * 0.4, cx: fx + fw / 2, yaw: r() * 2 - 1, size: fh },
    head: { x0: Math.max(0, fx - fw * 0.2), x1: Math.min(1, fx + fw * 1.2), y0: headTop, y1: Math.min(1, chin + fh * 0.08) },
    body: { x0: Math.max(0, fx - fw * r() * 2), x1: Math.min(1, fx + fw + fw * r() * 2), y0: headTop, y1: bodyBottom },
    shoulderY: Math.min(1, chin + fh * 0.6),
    hipY: r() > 0.5 ? Math.min(1, chin + fh * 2.5) : null,
    joints: r() > 0.5 ? [{ x: fx, y: Math.min(1, chin + fh * 4) }] : [],
    framing: feetInFrame ? 'full-length' : 'half',
    feetInFrame,
  };
}

const ROLES = ['beauty', 'portrait', 'figure', 'full', 'whole'];

describe('crop solver guarantee', () => {
  it('never cuts the protected region, for any subject, frame, window or user adjustment', () => {
    const r = rng(42);
    let feasible = 0;
    for (let i = 0; i < 6000; i++) {
      const s = randomSubject(r);
      const aspect = 0.4 + r() * 1.4;
      const role = ROLES[Math.floor(r() * ROLES.length)];
      const safe = r() > 0.7 ? { x0: 0, y0: r() * 0.35, x1: 1, y1: 1 } : undefined;
      const adjust = r() > 0.5 ? { x: r(), y: r(), zoom: 0.5 + r() * 2.5 } : undefined;
      const c = solveCrop(s, aspect, { role, frameHeightIn: 2 + r() * 7, safe, adjust });
      if (!c.feasible) continue;
      feasible++;
      const R = requiredRegion(s, role);
      const sf = safe || { x0: 0, y0: 0, x1: 1, y1: 1 };
      const e = 1e-3;
      // Crop lies inside the image.
      expect(c.x).toBeGreaterThanOrEqual(-e);
      expect(c.y).toBeGreaterThanOrEqual(-e);
      expect(c.x + c.w).toBeLessThanOrEqual(1 + e);
      expect(c.y + c.h).toBeLessThanOrEqual(1 + e);
      // Aspect is exact.
      expect(Math.abs((c.w * s.width) / (c.h * s.height) - aspect)).toBeLessThan(1e-6);
      // Protected region inside the safe part of the crop.
      const clamp = (v) => Math.max(0, Math.min(1, v));
      expect(clamp(R.x0)).toBeGreaterThanOrEqual(c.x + sf.x0 * c.w - e);
      expect(clamp(R.x1)).toBeLessThanOrEqual(c.x + sf.x1 * c.w + e);
      expect(clamp(R.y0)).toBeGreaterThanOrEqual(c.y + sf.y0 * c.h - e);
      expect(clamp(R.y1)).toBeLessThanOrEqual(c.y + sf.y1 * c.h + e);
    }
    expect(feasible).toBeGreaterThan(2000);
  });

  it('keeps hair above the forehead on a portrait', () => {
    const s = randomSubject(rng(7));
    const c = solveCrop(s, 0.8, { role: 'portrait' });
    if (c.feasible) expect(c.y).toBeLessThanOrEqual(s.head.y0 + 1e-6);
  });

  it('reports infeasible instead of cutting a full length into a wide frame', () => {
    const s = {
      width: 1000, height: 3000, aspect: 1 / 3, known: true,
      face: { box: { x: 0.45, y: 0.05, w: 0.1, h: 0.04 }, eyeY: 0.065, cx: 0.5, yaw: 0, size: 0.04 },
      head: { x0: 0.43, x1: 0.57, y0: 0.03, y1: 0.095 },
      body: { x0: 0.3, x1: 0.7, y0: 0.03, y1: 0.97 },
      feetInFrame: true, joints: [],
    };
    expect(solveCrop(s, 1.5, { role: 'full' }).feasible).toBe(false);
  });

  it('protects the centre when nothing is known about the photo', () => {
    const c = solveCrop({ width: 2000, height: 3000, aspect: 2 / 3, known: false }, 0.75, { role: 'portrait' });
    expect(c.feasible).toBe(true);
    expect(c.x).toBeLessThanOrEqual(0.1 + 1e-6);
    expect(c.x + c.w).toBeGreaterThanOrEqual(0.9 - 1e-6);
  });
});
