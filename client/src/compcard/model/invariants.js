/**
 * Professional invariants every composed card must satisfy. Used by the
 * test battery and available to the studio as a last line of defence.
 *
 *  - crop:     no photo crops the protected region of its subject
 *  - covered:  no type sits over a subject's head or body
 *  - safe:     all type inside the print-safe area (4mm inside trim)
 *  - collide:  no two text blocks overlap
 *  - size:     no type below 6pt (5.8 allowed for tracked caps)
 *  - content:  front carries the name; back carries stats (when any) and contact
 *  - ppi:      photos print at ≥150ppi
 */
import { requiredRegion } from './crop';

const SAFE = 4;
const PT = 25.4 / 72;

function textBox(el, measure) {
  if (el.rotate) return { x0: el.x, y0: el.y, x1: el.x + el.w, y1: el.y + el.h };
  const widths = el.lines.map((l) => measure(l, el.font).width);
  const width = Math.max(...widths);
  const cap = measure(el.lines[0] || 'H', el.font).cap;
  const h = cap + (el.lines.length - 1) * (el.leading || el.font.size * PT * 1.25);
  let x0 = el.x;
  const boxW = el.w;
  if (el.align === 'right') x0 = el.x + boxW - width;
  if (el.align === 'center') x0 = el.x + (boxW - width) / 2;
  // Descenders below the last baseline matter only if the last line has any.
  const last = el.lines[el.lines.length - 1] || '';
  const desc = /[gjpqy,;()Q]/.test(last) && el.font.caps !== 'small' ? 0.22 : 0.02;
  return { x0, y0: el.y, x1: x0 + width, y1: el.y + h + el.font.size * PT * desc, desc: el.font.size * PT * desc };
}

const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Map an image-normalised region through a crop into page coordinates. */
export function regionOnPage(r, crop, el) {
  return {
    x0: el.x + ((r.x0 - crop.x) / crop.w) * el.w,
    x1: el.x + ((r.x1 - crop.x) / crop.w) * el.w,
    y0: el.y + ((r.y0 - crop.y) / crop.h) * el.h,
    y1: el.y + ((r.y1 - crop.y) / crop.h) * el.h,
  };
}

export function checkCard(result, { measure, subjects }) {
  const out = [];
  const { scene } = result;
  const W = scene.format.w;
  const H = scene.format.h;
  for (const page of scene.pages) {
    const texts = page.elements.filter((e) => e.type === 'text').map((e) => ({ el: e, box: textBox(e, measure) }));
    const photos = page.elements.filter((e) => e.type === 'photo');
    // Type deliberately layered BEHIND a cutout of the same photograph only
    // has to keep clear of the face; the silhouette in front is the point.
    const order = new Map(page.elements.map((e, i) => [e, i]));
    const behindCutout = (t, ph) => page.elements.some((e) => e.type === 'photo' && e.cutout && e.imageId === ph.imageId && order.get(e) > order.get(t.el));

    for (const t of texts) {
      if (t.el.font.size < (t.el.font.caps || t.el.font.tracking > 0.1 ? 5.8 : 6) - 1e-6) out.push({ rule: 'size', page: page.name, detail: `${t.el.font.size.toFixed(2)}pt "${t.el.lines[0]}"` });
      const b = t.box;
      if (b.x0 < SAFE - 0.05 || b.y0 < SAFE - 0.05 || b.x1 > W - SAFE + 0.05 || b.y1 - b.desc > H - SAFE + 0.05) {
        out.push({ rule: 'safe', page: page.name, detail: `"${t.el.lines[0]}" ${b.x0.toFixed(1)},${b.y0.toFixed(1)}–${b.x1.toFixed(1)},${b.y1.toFixed(1)}` });
      }
    }
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        if (overlap(texts[i].box, texts[j].box)) out.push({ rule: 'collide', page: page.name, detail: `"${texts[i].el.lines[0]}" × "${texts[j].el.lines[0]}"` });
      }
    }
    for (const ph of photos) {
      const s = ph.imageId ? subjects.get(ph.imageId) : null;
      if (!s || !ph.crop) continue;
      // A letterboxed photo is a layout failure: the frame should have held a photo that fits.
      if (ph.contained) out.push({ rule: 'letterbox', page: page.name, detail: ph.slot });
      if (ph.contained || ph.decorative) continue; // shown whole, or a layer mirroring a checked photo
      if (s.known) {
        const r = requiredRegion(s, ph.role);
        const c = ph.crop;
        const e = 0.004;
        const ok = (Math.max(0, r.x0) >= c.x - e) && (Math.min(1, r.x1) <= c.x + c.w + e) && (Math.max(0, r.y0) >= c.y - e) && (Math.min(1, r.y1) <= c.y + c.h + e);
        if (!ok) out.push({ rule: 'crop', page: page.name, detail: `${ph.slot} role=${ph.role}` });
        // Type over the subject.
        if (s.head) {
          const protectedR = regionOnPage({ x0: s.head.x0, x1: s.head.x1, y0: s.head.y0, y1: s.head.y1 }, c, ph);
          const bodyR = regionOnPage({ x0: s.body.x0, x1: s.body.x1, y0: s.body.y0, y1: s.body.y1 }, c, ph);
          const faceR = s.face ? regionOnPage({ x0: s.face.box.x, x1: s.face.box.x + s.face.box.w, y0: s.face.box.y, y1: s.face.box.y + s.face.box.h }, c, ph) : null;
          for (const t of texts) {
            if (!overlap(t.box, { x0: ph.x, y0: ph.y, x1: ph.x + ph.w, y1: ph.y + ph.h })) continue;
            if (ph.cutout && ph.decorative) continue;
            if (behindCutout(t, ph)) {
              if (faceR && overlap(t.box, faceR)) out.push({ rule: 'covered', page: page.name, detail: `"${t.el.lines[0]}" behind face in ${ph.slot}` });
              continue;
            }
            if (overlap(t.box, protectedR)) out.push({ rule: 'covered', page: page.name, detail: `"${t.el.lines[0]}" over head in ${ph.slot}` });
            else if (overlap(t.box, bodyR)) out.push({ rule: 'covered', page: page.name, detail: `"${t.el.lines[0]}" over body in ${ph.slot}`, soft: true });
          }
        }
      }
      if (ph.ppi != null && ph.ppi < 150) out.push({ rule: 'ppi', page: page.name, detail: `${ph.slot} ${Math.round(ph.ppi)}ppi`, soft: true });
    }
  }
  const front = scene.pages.find((p) => p.name === 'front');
  const back = scene.pages.find((p) => p.name === 'back');
  const norm = (t) => String(t).toLowerCase().replace(/\u2032/g, "'").replace(/\u2033/g, '"');
  const allText = (p) => norm(p.elements.filter((e) => e.type === 'text').flatMap((e) => e.lines).join(' '));
  const nameWords = (result.nameShown || '').toLowerCase().split(/\s+/).filter(Boolean);
  // Front: at least the first name (agencies often print only that).
  // Back: the full name.
  if (front && nameWords.length && !allText(front).includes(nameWords[0])) out.push({ rule: 'content', page: 'front', detail: 'name missing' });
  if (back && nameWords.some((w) => !allText(back).includes(w))) out.push({ rule: 'content', page: 'back', detail: 'full name missing' });
  if (back && result.stats.items.length && !result.stats.items.every((it) => allText(back).includes(norm(it.value)))) {
    out.push({ rule: 'content', page: 'back', detail: 'a stat is missing' });
  }
  const c = result.contact;
  const contactBits = c.mode === 'agency' ? [c.agencyName] : c.lines;
  if (back && contactBits.length && !contactBits.every((b) => allText(back).includes(String(b).toLowerCase()))) out.push({ rule: 'content', page: 'back', detail: 'contact missing' });
  return out;
}
