import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ImageLightbox } from '../ImageLightbox';
import './zones.css';

export const PortfolioGrid = ({ images = [] }) => {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  if (images.length === 0) {
    return <p className="pf-grid-empty">No portfolio images yet.</p>;
  }

  return (
    <>
      <div className={`pf-grid${images.length === 1 ? ' pf-grid--single' : ''}`}>
        {images.map((img, i) => (
          <img
            key={img.id || i}
            className="pf-grid-img"
            src={img.path}
            alt={img.alt || ''}
            onClick={() => setLightboxIndex(i)}
          />
        ))}
      </div>
      <AnimatePresence>
        {lightboxIndex !== null && (
          <ImageLightbox
            images={images}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};
