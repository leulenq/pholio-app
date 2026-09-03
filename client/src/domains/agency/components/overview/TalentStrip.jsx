import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CardMeta } from '../meta';

const DRAG_THRESHOLD = 6;

// Horizontal media strip of talent — content-backed and scrollable.
export default function TalentStrip({ title, talents, onSelect, viewAllTo }) {
  const stripRef = useRef(null);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;

    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };

    let tracking = false;
    let dragging = false;
    let startX = 0;
    let startScrollLeft = 0;
    let suppressClick = false;

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      tracking = true;
      dragging = false;
      suppressClick = false;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
    };

    const onPointerMove = (e) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      if (!dragging && Math.abs(dx) > DRAG_THRESHOLD) {
        dragging = true;
        el.classList.add('ov-strip--dragging');
        el.setPointerCapture(e.pointerId);
      }
      if (dragging) {
        e.preventDefault();
        el.scrollLeft = startScrollLeft - dx;
      }
    };

    const endPointer = (e) => {
      if (!tracking) return;
      if (dragging) suppressClick = true;
      tracking = false;
      dragging = false;
      el.classList.remove('ov-strip--dragging');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };

    const onClickCapture = (e) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endPointer);
      el.removeEventListener('pointercancel', endPointer);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, [talents.length]);

  return (
    <section className="ov-module">
      <div className="ov-module-head">
        <h2 className="ov-module-title">{title}</h2>
        {viewAllTo && <Link to={viewAllTo} className="ov-module-link">View all</Link>}
      </div>
      {talents.length === 0 ? (
        <div className="ov-empty">No new applicants to preview.</div>
      ) : (
        <div className="ov-strip" ref={stripRef}>
          {talents.map((t) => (
            /* A div with the button role, matching the submissions book card:
               CardMeta renders block elements, which a real <button> may not
               contain. */
            <div
              key={t.id}
              className="ov-strip-card"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(t);
                }
              }}
            >
              <span className="ov-strip-photo">
                <span className="ov-strip-img" style={{ backgroundImage: t.photo ? `url(${t.photo})` : 'none' }} />
              </span>
              <span className="ov-strip-name">{t.name}</span>
              {/* One grammar with the submissions book and the signing wall:
                  height, age, city, and nothing a card cannot know. */}
              <CardMeta
                className="ov-strip-meta"
                figures={{ heightCm: t.heightCm, age: t.age }}
                context={{ city: t.city }}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
