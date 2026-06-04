import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import './ImageLightbox.css';

export const ImageLightbox = ({ images, initialIndex = 0, onClose }) => {
  const [idx, setIdx] = useState(initialIndex);

  const prev = useCallback(() => setIdx(i => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, prev, next]);

  const image = images[idx];
  const multi = images.length > 1;

  return (
    <motion.div
      className="ilb-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.img
        key={idx}
        className="ilb-image"
        src={image.path}
        alt={image.alt || ''}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      />

      <button className="ilb-close" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>

      {multi && (
        <>
          <button className="ilb-arrow ilb-arrow--prev" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous">
            <ChevronLeft size={22} />
          </button>
          <button className="ilb-arrow ilb-arrow--next" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Next">
            <ChevronRight size={22} />
          </button>
          <div className="ilb-dots">
            {images.map((_, i) => (
              <button
                key={i}
                className={`ilb-dot${i === idx ? ' ilb-dot--active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                aria-label={`Image ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
};
