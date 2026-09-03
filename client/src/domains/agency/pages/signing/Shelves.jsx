import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { CardMeta } from '../../components/meta';
import { SECTIONS, candidateId, heightCmOf, hideBrokenImage } from './boardModel';

/**
 * The shelves — On file, Passed, Closed.
 *
 * Most inbound ends here, which is exactly why it must not occupy the wall.
 * Collapsed, a shelf is one line: the outcome, a count, and a stack of faces
 * so the volume is visible without being loud. Expanded, it is a ledger of
 * rows carrying the date the outcome was recorded — the record, not the
 * queue. Reopening happens through the verdict bar like every other decision.
 */

function ShelfRow({ candidate, standing, selected, focused, onSelect, onOpen, onFocus }) {
  const ref = useRef(null);
  const id = candidateId(candidate);

  useEffect(() => {
    if (focused && ref.current && document.activeElement !== ref.current) {
      ref.current.focus({ preventScroll: true });
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [focused]);

  const photo = candidate.headshot || candidate.avatar || null;

  return (
    <li
      ref={ref}
      className={`sb-shelf-row${selected ? ' is-selected' : ''}`}
      role="option"
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      data-id={id}
      onFocus={() => onFocus(id)}
      onClick={(e) => onSelect(id, { additive: e.metaKey || e.ctrlKey, range: e.shiftKey })}
      onDoubleClick={() => onOpen(id)}
    >
      {photo
        ? <img className="sb-face" src={photo} alt="" loading="lazy" onError={hideBrokenImage} />
        : <span className="sb-face sb-face--empty" aria-hidden="true" />}
      <span className="sb-shelf-name">{candidate.name}</span>
      {/* A shelf is the record, not the queue: the figures, the outcome and
          the date it was recorded. Only the compliance note travels down here
          — house memory and tags belong to the wall, where decisions are
          still being made. */}
      <CardMeta
        className="sb-shelf-meta"
        figures={{ heightCm: heightCmOf(candidate), person: candidate }}
        context={{ city: candidate.city || candidate.location }}
        stage={{ text: standing.text, since: standing.since }}
        notations={candidate.isMinor ? [{ text: 'Under 18', tone: 'warning' }] : []}
      />
    </li>
  );
}

function Shelf({ section, items, vocab, standingFor, selection, onSelect, onOpen }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;
  const title = section.title(vocab);

  return (
    <div className="sb-shelf">
      <button
        type="button"
        className="sb-shelf-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sb-shelf-title">{title}</span>
        <span className="sb-shelf-count">{items.length}</span>
        <span className="sb-shelf-faces" aria-hidden="true">
          {items.slice(0, 8).map((c) => {
            const photo = c.headshot || c.avatar || null;
            return (
              <span
                key={candidateId(c)}
                className="sb-shelf-face"
                style={photo ? { backgroundImage: `url(${photo})` } : undefined}
              />
            );
          })}
        </span>
        <ChevronDown size={15} className={`sb-shelf-chev${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            className="sb-shelf-list"
            role="listbox"
            aria-multiselectable="true"
            aria-label={title}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {items.map((candidate) => {
              const id = candidateId(candidate);
              return (
                <ShelfRow
                  key={id}
                  candidate={candidate}
                  standing={standingFor(candidate)}
                  selected={selection.isSelected(id)}
                  focused={selection.focusedId === id}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onFocus={selection.setFocused}
                />
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Shelves({ groups, vocab, standingFor, selection, onSelect, onOpen }) {
  const shelves = SECTIONS.filter((s) => s.shelf);
  const total = shelves.reduce((n, s) => n + (groups[s.key]?.length || 0), 0);
  if (total === 0) return null;

  return (
    <div className="sb-shelves">
      {shelves.map((section) => (
        <Shelf
          key={section.key}
          section={section}
          items={groups[section.key] || []}
          vocab={vocab}
          standingFor={standingFor}
          selection={selection}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
