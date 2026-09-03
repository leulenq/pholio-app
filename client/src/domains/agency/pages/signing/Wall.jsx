import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CardMeta } from '../../components/meta';
import {
  SECTIONS, candidateId, ageNotation, heightCmOf, hideBrokenImage,
} from './boardModel';

/**
 * The Wall — the set as faces, at a size where a face can be judged.
 *
 * Vertical ruled sections in DECISION ORDER, never columns. A board meeting
 * walks this top to bottom in one scroll; columns would spend the viewport on
 * the two rungs that are near-empty most of the year and would force a tile
 * small enough that the face stops being readable, which is the only thing
 * this surface exists to show.
 *
 * Tiles are bare images on the cream canvas with type beneath: no card, no
 * border, no shadow, nothing in the corners. Selection is the one gold — a
 * 2px ring outside the image.
 */

/**
 * What the tile says about a candidate beyond the facts: the compliance note,
 * and only the compliance note — restraint revision, 2026-09-01 (house memory
 * and tags belong to the ledger, where a table earns the density).
 */
function tileNotations(candidate) {
  const ageNote = ageNotation(candidate);
  return ageNote ? [{ text: ageNote, tone: 'warning' }] : [];
}

function Tile({
  candidate, standing, selected, focused, busy, index, enter, onSelect, onOpen, onFocus,
}) {
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();
  const id = candidateId(candidate);

  useEffect(() => {
    if (focused && ref.current && document.activeElement !== ref.current) {
      ref.current.focus({ preventScroll: true });
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [focused]);

  const photo = candidate.headshot || candidate.avatar || null;

  return (
    <motion.div
      ref={ref}
      className={`sb-tile${selected ? ' is-selected' : ''}${busy ? ' is-busy' : ''}`}
      role="option"
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      data-id={id}
      onFocus={() => onFocus(id)}
      onClick={(e) => onSelect(id, { additive: e.metaKey || e.ctrlKey, range: e.shiftKey })}
      onDoubleClick={() => onOpen(id)}
      /* The one choreographed moment: a decided tile leaves one section and
         arrives in another, and a stable layoutId inside the wall's
         LayoutGroup lets the same face tween across that break instead of
         blinking out of one grid and into the next. */
      layoutId={reduceMotion ? undefined : `tile-${id}`}
      layout={reduceMotion ? false : 'position'}
      initial={enter && !reduceMotion ? { opacity: 0, y: 4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1], delay: enter ? Math.min(index, 24) * 0.012 : 0 }}
    >
      <div className="sb-tile-frame">
        {photo
          ? <img className="sb-tile-img" src={photo} alt={candidate.name} loading="lazy" onError={hideBrokenImage} />
          : <span className="sb-tile-img sb-tile-img--empty" aria-hidden="true" />}
      </div>
      {/* The name IS the way in — the frame belongs to the face, and a scrim
          over it to carry the word "Open" hides the one thing the tile is for.
          The image still selects; the name opens the record. */}
      <p className="sb-tile-nameline">
        <button
          type="button"
          className="sb-tile-name"
          onClick={(e) => { e.stopPropagation(); onOpen(id); }}
          tabIndex={-1}
        >
          {candidate.name}
        </button>
      </p>
      {/* Height leads, then age: the two gates a booker reads before anything
          else on a wall of faces. Everything below is one grammar with the
          submissions book — same component, different content. */}
      <CardMeta
        className="sb-tile-meta"
        figures={{ heightCm: heightCmOf(candidate), person: candidate }}
        context={{ city: candidate.city || candidate.location }}
        stage={{ text: standing.text, since: standing.since }}
        notations={tileNotations(candidate)}
      />
    </motion.div>
  );
}

function Section({
  section, items, vocab, standingFor, selection, busyIds, enter, onSelect, onOpen, emptyText,
}) {
  if (items.length === 0 && !emptyText) return null;
  const title = section.title(vocab);
  return (
    <section className="sb-section" aria-label={title}>
      <div className="sb-section-rule">
        <span className="sb-section-label">{title}</span>
        <span className="sb-section-count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="sb-section-empty">{emptyText}</p>
      ) : (
        <div className="sb-grid" role="listbox" aria-multiselectable="true" aria-label={title}>
          {items.map((candidate, index) => {
            const id = candidateId(candidate);
            return (
              <Tile
                key={id}
                candidate={candidate}
                standing={standingFor(candidate)}
                selected={selection.isSelected(id)}
                focused={selection.focusedId === id}
                busy={busyIds.has(id)}
                index={index}
                enter={enter}
                onSelect={onSelect}
                onOpen={onOpen}
                onFocus={selection.setFocused}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function WallSkeleton() {
  return (
    <div className="sb-section" aria-hidden="true">
      <div className="sb-section-rule">
        <span className="sb-skel sb-skel--label" />
      </div>
      <div className="sb-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div className="sb-tile sb-tile--skeleton" key={i}>
            <div className="sb-tile-frame" />
            <span className="sb-skel sb-skel--name" />
            <span className="sb-skel sb-skel--meta" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Wall({
  groups, vocab, standingFor, selection, busyIds, enter, onSelect, onOpen,
}) {
  return (
    <div className="sb-wall">
      {SECTIONS.filter((s) => !s.shelf).map((section) => (
        <Section
          key={section.key}
          section={section}
          items={groups[section.key] || []}
          vocab={vocab}
          standingFor={standingFor}
          selection={selection}
          busyIds={busyIds}
          enter={enter}
          onSelect={onSelect}
          onOpen={onOpen}
          /* The one section that states its own emptiness: an empty
             "Needs a decision" is the board's best possible state and has
             to be legible as such, not as a missing section. */
          emptyText={section.key === 'decide' ? 'Nothing needs a decision.' : null}
        />
      ))}
    </div>
  );
}
