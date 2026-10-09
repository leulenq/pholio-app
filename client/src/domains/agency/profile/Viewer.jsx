import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { frameLabel, frameWhen, src } from './read';

/** Full screen, one photograph at a time. Click to look closer. */
export function Viewer({ frames, start, onClose }) {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(null);
  const n = frames.length;
  const go = useCallback((d) => { setZoom(null); setI((x) => (x + d + n) % n); }, [n]);

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [go, onClose]);

  const img = frames[i];
  if (!img) return null;

  // Measured against the untransformed box, so magnification stays under the cursor.
  const aim = (e) => {
    const el = e.currentTarget;
    const box = el.parentElement.getBoundingClientRect();
    const c = (v) => Math.min(100, Math.max(0, v)).toFixed(1);
    return `${c(((e.clientX - box.left - el.offsetLeft) / el.offsetWidth) * 100)}% ${c(((e.clientY - box.top - el.offsetTop) / el.offsetHeight) * 100)}%`;
  };

  return createPortal(
    <motion.div
      className="pf-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Photographs"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <button type="button" className="pf-viewer__close" onClick={onClose} aria-label="Close"><X size={20} strokeWidth={1.25} /></button>
      <div className="pf-viewer__stage" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.img
            key={i}
            src={src(img)}
            alt={frameLabel(img)}
            draggable={false}
            className={zoom ? 'is-zoom' : undefined}
            style={zoom ? { transformOrigin: zoom } : undefined}
            onClick={(e) => setZoom(zoom ? null : aim(e))}
            onMouseMove={zoom ? (e) => setZoom(aim(e)) : undefined}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        </AnimatePresence>
      </div>
      <div className="pf-viewer__foot">
        <span>{frameLabel(img)}{frameWhen(img) && ` · ${frameWhen(img).toLowerCase()}`}</span>
        {n > 1 && (
          <span className="pf-viewer__nav">
            <button type="button" onClick={() => go(-1)} aria-label="Previous"><ArrowLeft size={18} strokeWidth={1.25} /></button>
            <span>{String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}</span>
            <button type="button" onClick={() => go(1)} aria-label="Next"><ArrowRight size={18} strokeWidth={1.25} /></button>
          </span>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
