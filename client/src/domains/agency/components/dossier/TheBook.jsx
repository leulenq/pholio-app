import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { ImageLightbox } from '../ImageLightbox';
import { isDigitalSlot } from '../../../../shared/utils/profileReadinessImages';
import { SHOT_LABELS, IMAGE_TYPE_LABELS } from '../../../../shared/constants/frameTaxonomy';
import { Quiet } from './DossierPrimitives';
import { titleCase } from './dossierModel';
import './dossier.css';

/**
 * The Book — everything the talent actually sent, in the order they sent it.
 *
 * Book and digitals are different objects with opposite rules (styled work vs.
 * raw reference), so they are filterable but never merged into one anonymous
 * gallery. The comp card sits beside them because that is the artefact a
 * booker forwards to a client.
 */
const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'book', label: 'Book' },
  { key: 'digital', label: 'Digitals' },
];

function frameCaption(img) {
  const shot = img.shot_type ? SHOT_LABELS[img.shot_type] || titleCase(img.shot_type) : null;
  const type = img.image_type ? IMAGE_TYPE_LABELS[img.image_type] || titleCase(img.image_type) : null;
  return [shot, type].filter(Boolean).join(' · ') || null;
}

export function TheBook({ images = [], submissionPackage, openIndex, onOpenChange }) {
  const [filter, setFilter] = useState('all');
  const [internalIndex, setInternalIndex] = useState(null);

  const index = openIndex !== undefined ? openIndex : internalIndex;
  const setIndex = onOpenChange || setInternalIndex;

  const counts = useMemo(() => {
    const digital = images.filter(isDigitalSlot).length;
    return { all: images.length, digital, book: images.length - digital };
  }, [images]);

  const shown = useMemo(() => {
    if (filter === 'digital') return images.filter(isDigitalSlot);
    if (filter === 'book') return images.filter((img) => !isDigitalSlot(img));
    return images;
  }, [images, filter]);

  const compCard = submissionPackage?.compCard || null;

  if (images.length === 0) {
    return <Quiet>This submission carries no frames.</Quiet>;
  }

  return (
    <div className="dx-book">
      <div className="dx-book__filters" role="group" aria-label="Filter frames">
        {FILTERS.filter((f) => counts[f.key] > 0).map((f) => (
          <button
            key={f.key}
            type="button"
            className={`dx-filter${filter === f.key ? ' is-on' : ''}`}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
          >
            {f.label}
            <span className="dx-filter__n">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      <div className="dx-book__grid">
        {shown.map((img) => {
          const caption = frameCaption(img);
          return (
            <button
              type="button"
              className="dx-frame"
              key={img.id}
              onClick={() => setIndex(images.indexOf(img))}
            >
              <img src={img.path || img.url} alt={img.alt || caption || 'Frame'} loading="lazy" />
              {caption && <span className="dx-frame__cap">{caption}</span>}
            </button>
          );
        })}
      </div>

      {compCard?.viewUrl && (
        <div className="dx-card">
          <div className="dx-card__preview">
            <iframe
              src={compCard.viewUrl}
              title={`${compCard.name || 'Comp card'} preview`}
              scrolling="no"
              tabIndex={-1}
            />
          </div>
          <div className="dx-card__copy">
            <h3 className="dx-card__title">Comp card sent with this submission</h3>
            <p className="dx-card__meta">
              {[compCard.board, compCard.market].filter(Boolean).join(' · ') || compCard.name || 'Comp card'}
            </p>
            <a className="dx-link" href={compCard.viewUrl} target="_blank" rel="noreferrer">
              Open the card <ArrowUpRight size={13} aria-hidden />
            </a>
          </div>
        </div>
      )}

      <AnimatePresence>
        {index != null && (
          <ImageLightbox
            images={images}
            initialIndex={index}
            onClose={() => setIndex(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default TheBook;
