import React from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useMedia } from '../hooks/useMedia';
import './MediaWorkspace.css';

const ARRIVE = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

function metadataFor(image) {
  if (!image?.metadata) return {};
  if (typeof image.metadata === 'object') return image.metadata;
  try { return JSON.parse(image.metadata); } catch { return {}; }
}

function isHiddenFromMarket(image) {
  const m = metadataFor(image);
  return (
    m.visibility === 'private' ||
    image?.exclude_from_public ||
    image?.exclude_from_agency ||
    image?.status === 'archived'
  );
}

export default function MediaWorkspace() {
  const { images } = useMedia();
  const frames = images || [];

  React.useEffect(() => { document.title = 'Portfolio | Pholio'; }, []);

  const visibleCount = frames.filter((img) => !isHiddenFromMarket(img)).length;

  return (
    <div className="mw-root">
      <div className="mw-wrap">
        <motion.header className="mw-masthead" {...ARRIVE}>
          <div className="mw-masthead__copy">
            <span className="mw-kicker">Portfolio</span>
            <h1 className="mw-h1">Portfolio</h1>
            <p className="mw-sub">
              Curate the frames agencies see — then compose your comp card from them.
            </p>
            <span className="mw-meta mw-masthead__meta">
              {frames.length} {frames.length === 1 ? 'frame' : 'frames'} · {visibleCount} visible to agencies
            </span>
          </div>
          <button type="button" className="mw-btn-gold" disabled>
            <Plus size={15} aria-hidden="true" /> Add images
          </button>
        </motion.header>

        {/* Movement I — Library (Task 2) */}
        <section aria-label="Frame library" />

        <div className="mw-divider" aria-hidden="true" />

        {/* Movement II — Comp card (Task 3) */}
        <section aria-label="Comp card" />
      </div>
    </div>
  );
}
