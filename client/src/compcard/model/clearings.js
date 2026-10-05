/**
 * Found space — where in a cropped photograph type can live.
 *
 * Builds a page-resolution map of a framed photograph: for every cell, the
 * colours under it, how busy it is, and whether it belongs to the subject's
 * head or face (never covered). Then searches type blocks over that map,
 * checking every cell under every candidate for worst-case contrast.
 */
import { contrast } from './palette';

const CELL = 2.5; // mm

/**
 * @param item   pool item (subject + perception)
 * @param crop   image-normalised crop
 * @param frame  page rect the photo fills
 * @param guard  extra mm around the head
 */
export function spaceMap(item, crop, frame, guard = 4, inks = { dark: [18, 18, 18], light: [250, 250, 248] }) {
  const tone = item?.perception?.tone;
  const s = item?.subject;
  if (!tone || !s?.known) return null;
  const cols = Math.ceil(frame.w / CELL);
  const rows = Math.ceil(frame.h / CELL);
  const cells = new Array(cols * rows);
  // Head (with hair) in page coordinates, padded.
  const toPage = (ix, iy) => ({ x: frame.x + ((ix - crop.x) / crop.w) * frame.w, y: frame.y + ((iy - crop.y) / crop.h) * frame.h });
  const head = s.head ? [toPage(s.head.x0, s.head.y0), toPage(s.head.x1, s.head.y1)] : null;
  const face = s.face ? [toPage(s.face.box.x, s.face.box.y), toPage(s.face.box.x + s.face.box.w, s.face.box.y + s.face.box.h)] : null;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = frame.x + (c + 0.5) * CELL;
      const py = frame.y + (r + 0.5) * CELL;
      const ix = crop.x + ((px - frame.x) / frame.w) * crop.w;
      const iy = crop.y + ((py - frame.y) / frame.h) * crop.h;
      const tx = Math.max(0, Math.min(tone.cols - 1, Math.floor(ix * tone.cols)));
      const ty = Math.max(0, Math.min(tone.rows - 1, Math.floor(iy * tone.rows)));
      let blocked = false;
      for (const b of [head, face]) {
        if (b && px > b[0].x - guard && px < b[1].x + guard && py > b[0].y - guard && py < b[1].y + guard) blocked = true;
      }
      const color = tone.color[ty][tx];
      cells[r * cols + c] = { color, detail: tone.detail[ty][tx], blocked, cd: contrast(inks.dark, color), cl: contrast(inks.light, color) };
    }
  }
  return { cols, rows, cells, frame, cell: CELL };
}

/** Check a page rectangle against the map. Returns null if unusable. */
export function readRect(map, rect, minContrast) {
  const { frame, cols, rows, cells, cell } = map;
  const c0 = Math.max(0, Math.floor((rect.x - frame.x) / cell));
  const c1 = Math.min(cols - 1, Math.floor((rect.x + rect.w - frame.x) / cell));
  const r0 = Math.max(0, Math.floor((rect.y - frame.y) / cell));
  const r1 = Math.min(rows - 1, Math.floor((rect.y + rect.h - frame.y) / cell));
  let worstDark = Infinity;
  let worstLight = Infinity;
  let detail = 0;
  let n = 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cl = cells[r * cols + c];
      if (cl.blocked) return null;
      worstDark = Math.min(worstDark, cl.cd);
      worstLight = Math.min(worstLight, cl.cl);
      detail += cl.detail;
      n++;
      if (worstDark < minContrast && worstLight < minContrast) return null;
    }
  }
  if (!n) return null;
  const ink = worstDark >= worstLight ? 'dark' : 'light';
  return { ink, contrast: Math.max(worstDark, worstLight), worstDark, worstLight, detail: detail / n };
}
