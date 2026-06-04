import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ImageLightbox } from '../ImageLightbox';
import './zones.css';

export const PortfolioStrip = ({ images = [] }) => {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  if (images.length === 0) return null;

  return (
    <>
      <div className="pf-strip">
        {images.map((img, i) => (
          <img
            key={img.id || i}
            className="pf-strip-img"
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
