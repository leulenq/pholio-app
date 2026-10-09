/**
 * Renders one page of a card scene. Units are millimetres throughout, so
 * the same markup is the on-screen preview (scaled with CSS) and the print
 * master (Chromium → PDF at physical size).
 *
 * Scene element types:
 *   photo { x,y,w,h, src, crop:{x,y,w,h}, bleed:{t,r,b,l}, fill }
 *   rect  { x,y,w,h, fill, bleed }
 *   rule  { x,y,w,h, fill }
 *   text  { x,y,w, lines[], font, color, align, leading, rotate }
 *         y is the cap-height top of the first line; the last line sits on
 *         its baseline at the bottom of the box (CSS text-box trimming).
 */
import { textStyle } from './textStyle';
import { cropToStyle } from '../model/crop';

const mm = (v) => `${Math.round(v * 1000) / 1000}mm`;

function bleedBox(el, bleed) {
  const b = el.bleed || {};
  const t = b.t ? bleed : 0;
  const r = b.r ? bleed : 0;
  const bo = b.b ? bleed : 0;
  const l = b.l ? bleed : 0;
  return { left: mm(el.x - l), top: mm(el.y - t), width: mm(el.w + l + r), height: mm(el.h + t + bo) };
}

/**
 * When a photo bleeds, the extra strip must show more of the photograph,
 * not stretch it: expand the crop by the same proportion on that side.
 */
function bleedCrop(crop, el, bleed) {
  const b = el.bleed || {};
  if (!bleed || !(b.t || b.r || b.b || b.l)) return crop;
  const sx = crop.w / el.w;
  const sy = crop.h / el.h;
  const l = b.l ? bleed * sx : 0;
  const r = b.r ? bleed * sx : 0;
  const t = b.t ? bleed * sy : 0;
  const bo = b.b ? bleed * sy : 0;
  let x = crop.x - l;
  let y = crop.y - t;
  let w = crop.w + l + r;
  let h = crop.h + t + bo;
  // If the image has no pixels to spare, scale instead (≤3mm, imperceptible).
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > 1) x = Math.max(0, 1 - w);
  if (y + h > 1) y = Math.max(0, 1 - h);
  return { x, y, w: Math.min(1, w), h: Math.min(1, h) };
}

/**
 * Rotation about a page point: spin = { deg, ox, oy } (mm, page space).
 * `dx/dy` is how far the element's box starts before el.x/el.y (bleed).
 */
function spinStyle(el, dx = 0, dy = 0) {
  if (!el.spin) return null;
  return {
    transform: `rotate(${el.spin.deg}deg)`,
    transformOrigin: `${mm(el.spin.ox - el.x + dx)} ${mm(el.spin.oy - el.y + dy)}`,
  };
}

/** Type filled with a picture or a foil gradient (fill.x/y/w/h = the picture's page rect). */
function fillStyle(el) {
  const f = el.fill;
  if (!f) return null;
  if (f.kind === 'image') {
    return {
      backgroundImage: `url("${f.src}")`,
      backgroundSize: `${mm(f.w)} ${mm(f.h)}`,
      backgroundPosition: `${mm(f.x - el.x)} ${mm(f.y - el.y)}`,
      backgroundRepeat: 'no-repeat',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    };
  }
  if (f.kind === 'gradient') {
    return { backgroundImage: f.css, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' };
  }
  return null;
}

/** CSS mask that fades a photo's edges: fade = { t, r, b, l } in mm. */
function fadeMask(fade, w, h) {
  if (!fade) return null;
  const grads = [];
  const lin = (dir, mmLen, total) => `linear-gradient(${dir}, transparent 0, #000 ${(100 * mmLen) / total}%, #000 100%)`;
  if (fade.t) grads.push(lin('to bottom', fade.t, h));
  if (fade.b) grads.push(lin('to top', fade.b, h));
  if (fade.l) grads.push(lin('to right', fade.l, w));
  if (fade.r) grads.push(lin('to left', fade.r, w));
  if (!grads.length) return null;
  return {
    WebkitMaskImage: grads.join(', '),
    maskImage: grads.join(', '),
    WebkitMaskComposite: grads.map(() => 'source-in').join(', '),
    maskComposite: grads.map(() => 'intersect').join(', '),
  };
}

function Photo({ el, bleed, onSelect, selected, interactive }) {
  const box = bleedBox(el, bleed);
  const crop = el.crop ? bleedCrop(el.crop, el, bleed) : null;
  // A cutout may break out of its frame (a head over a field's edge).
  const free = Boolean(el.cutout && el.breakout);
  const src = el.cutout || el.src;
  return (
    <div
      data-slot={el.slot}
      onPointerDown={interactive && onSelect ? (e) => onSelect(el.slot, e) : undefined}
      style={{
        position: 'absolute',
        ...box,
        overflow: free ? 'visible' : 'hidden',
        background: el.cutout ? undefined : el.fill || '#d9d6d0',
        cursor: interactive ? 'pointer' : undefined,
        outline: selected ? '0.6mm solid #C9A55A' : undefined,
        outlineOffset: selected ? '-0.6mm' : undefined,
        zIndex: el.z ?? 'auto',
        opacity: el.opacity,
        ...(el.fade ? fadeMask(el.fade, el.w, el.h) : {}),
        ...spinStyle(el, el.x - parseFloat(box.left), el.y - parseFloat(box.top)),
      }}
    >
      {src && crop && (
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            maxWidth: 'none',
            display: 'block',
            ...cropToStyle(crop),
            userSelect: 'none',
            filter: el.shadow || undefined,
          }}
        />
      )}
    </div>
  );
}

function Text({ el }) {
  const style = textStyle(el.font);
  const lines = el.lines || [el.text];
  const common = {
    ...style,
    color: el.color,
    opacity: el.opacity,
    mixBlendMode: el.blend,
    lineHeight: el.leading ? mm(el.leading) : 1,
    whiteSpace: 'pre',
    textAlign: el.align || 'left',
    textBoxTrim: 'trim-both',
    textBoxEdge: 'cap alphabetic',
    margin: 0,
  };
  if (el.rotate) {
    // Rotated text: lay it out unrotated (length = el.h) then turn it.
    // -90 reads bottom-to-top (spine on the left), 90 top-to-bottom.
    const transform = el.rotate === -90 ? `translateY(${mm(el.h)}) rotate(-90deg)` : `translateX(${mm(el.w)}) rotate(90deg)`;
    return (
      <div style={{ position: 'absolute', left: mm(el.x), top: mm(el.y), width: mm(el.w), height: mm(el.h), zIndex: el.z ?? 'auto' }}>
        <div style={{ ...common, ...fillStyle(el), position: 'absolute', left: 0, top: 0, width: mm(el.h), transformOrigin: '0 0', transform }}>
          {lines.join('\n')}
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...common, ...fillStyle(el), position: 'absolute', left: mm(el.x), top: mm(el.y), width: el.w != null ? mm(el.w) : undefined, zIndex: el.z ?? 'auto', ...spinStyle(el) }}>
      {lines.join('\n')}
    </div>
  );
}

export default function CardPage({ page, format, showBleed = false, onSelectSlot, selectedSlot, interactive = false }) {
  const bleed = showBleed ? format.bleed : 0;
  const W = format.w + bleed * 2;
  const H = format.h + bleed * 2;
  return (
    <div
      className="cc-page"
      data-page={page.name}
      style={{ position: 'relative', width: mm(W), height: mm(H), overflow: 'hidden', background: page.paper, flex: 'none' }}
    >
      <div style={{ position: 'absolute', left: mm(bleed), top: mm(bleed), width: mm(format.w), height: mm(format.h) }}>
        {page.elements.map((el, i) => {
          if (el.type === 'photo') return <Photo key={i} el={el} bleed={bleed} onSelect={onSelectSlot} selected={selectedSlot && el.slot === selectedSlot} interactive={interactive} />;
          if (el.type === 'text') return <Text key={i} el={el} />;
          if (el.type === 'rect' || el.type === 'rule') {
            const box = bleedBox(el, bleed);
            return <div key={i} style={{ position: 'absolute', ...box, background: el.gradient || el.fill, zIndex: el.z ?? 'auto', opacity: el.opacity, boxShadow: el.boxShadow, ...spinStyle(el, el.x - parseFloat(box.left), el.y - parseFloat(box.top)) }} />;
          }
          if (el.type === 'svg') {
            return <div key={i} style={{ position: 'absolute', left: mm(el.x), top: mm(el.y), width: mm(el.w), height: mm(el.h), zIndex: el.z || 2 }} dangerouslySetInnerHTML={{ __html: el.svg }} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}
