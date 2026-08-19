import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import useMarketCoverage from './useMarketCoverage';
import { countOf } from '../../lib/marketFormat';
import { frameSrc } from '../../lib/frameSrc';
import './market-coverage.css';

/**
 * The market's shot lists, read as one.
 *
 * Ten houses publish ten shot lists and the lists largely ask for the same
 * pictures. Read together they come to a handful of distinct frames, and one
 * photograph answers every list that asks for that frame. That is the whole
 * claim: it is about lists and photographs, never about access, chances or
 * outcomes. Nothing here is scored, ranked, recommended or paid for.
 *
 * The strip is closed by default and costs nothing to sit under. Opening it is
 * what fetches — one preflight for the whole market, cached — so the board's
 * rule holds: a market of any size costs one request to read, one more to open
 * a house, and one more to read all the lists at once.
 *
 * It stays on the cream when open. The solid-ink panel is the signature of a
 * house; a derived reading of every house must not be able to pass for one.
 */

const EASE = [0.22, 1, 0.36, 1];
const SPRING = { type: 'spring', stiffness: 55, damping: 16 };

/**
 * "Ford" · "Ford and Muse" · "Ford, Muse and Elite".
 *
 * Serial comma omitted deliberately — the completes sentence is set in the
 * board's British register, and the names are proper nouns that never need the
 * comma to disambiguate.
 */
function joinPhrases(items) {
  const list = (items || []).map((item) => String(item ?? '').trim()).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * Which houses' shot lists this one frame is the last gap on — said as a fact
 * about two things the talent can check: their photographs, and a published
 * list. Never as a countdown, never scoped wider than the shot list.
 */
function completesLine(names) {
  if (!names || names.length === 0) return '';
  if (names.length === 1) return `The only frame on ${names[0]}’s shot list not in your set.`;
  return `The only frame on the shot lists of ${joinPhrases(names)} not in your set.`;
}

function Row({ frame, houseCount, image, index, reduce }) {
  const src = frame.inSet ? frameSrc(image) : '';
  const completes = frame.inSet ? '' : completesLine(frame.completes);

  return (
    <motion.li
      className={`mcov-row${frame.inSet ? ' mcov-row--in' : ''}`}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { ...SPRING, delay: Math.min(index, 6) * 0.03 }}
    >
      {/*
        The photograph is the answer to "have I got this one" — so where there
        is no photograph the frame is simply left empty, the way a digitals
        sheet leaves a slot empty. No icon, no dashed outline, no word for the
        absence: the count line and the completes line already say it.
      */}
      <span className="mcov-frame">
        {src ? <img className="mcov-frame__img" src={src} alt="" aria-hidden /> : null}
      </span>

      <span className="mcov-row__body">
        <span className="mcov-label">{frame.label}</span>
        {frame.inSet ? <span className="hb-sr">In your set.</span> : null}
        {completes ? <span className="mcov-completes">{completes}</span> : null}
      </span>

      {/* Document membership, with the denominator that keeps it honest. */}
      <span className="mcov-count">
        On {frame.listCount} of {countOf(houseCount, 'list')}.
      </span>
    </motion.li>
  );
}

function Panel({ coverage, images, isLoading, error, refetch, reduce }) {
  const byId = useMemo(() => {
    const map = new Map();
    for (const image of images || []) {
      if (image?.id != null) map.set(String(image.id), image);
    }
    return map;
  }, [images]);

  if (isLoading) {
    return (
      <p className="mcov-wait" role="status">
        <Loader2 size={15} className="app-spin" aria-hidden />
        Reading what the houses publish…
      </p>
    );
  }

  if (error) {
    return (
      <p className="mcov-wait" role="alert">
        The market&rsquo;s lists couldn&rsquo;t be read.
        <button type="button" className="mcov-retry" onClick={() => refetch?.()}>
          Try again
        </button>
      </p>
    );
  }

  if (!coverage) return null;

  const houses = coverage.houses || [];
  const frames = coverage.frames || [];
  const totals = coverage.totals || {};
  const houseCount = Number(totals.housesWithLists) || 0;
  const frameCount = Number(totals.frames) || frames.length;
  const inSet = Number(totals.inSet) || 0;

  if (houseCount < 2 || !frames.length) {
    // One list is that house's own brief, and duplicating it here is clutter —
    // the band that holds it is named and left to do the reading.
    const named = houseCount === 1 ? houses.find((house) => house.hasShotList) : null;
    if (named) {
      return (
        <p className="mcov-verdict">
          One house here publishes a shot list — {named.name}. Its own band reads it in full.
        </p>
      );
    }
    if (houseCount > 0) return null;
    return (
      <p className="mcov-verdict">
        None of these houses publish a shot list. Open a house to see what it does ask for.
      </p>
    );
  }

  return (
    <>
      {/*
        One sentence, two numbers. Completion is not a louder register — it is
        the same sentence with a different number.
      */}
      <p className="mcov-verdict">
        {countOf(houseCount, 'house')} publish a shot list; together the lists come to{' '}
        {countOf(frameCount, 'frame')}.{' '}
        <em>
          {inSet === 0
            ? 'None of them shot yet.'
            : inSet >= frameCount
              ? `All ${frameCount} in your set.`
              : `${inSet} of ${frameCount} already in your set.`}
        </em>
      </p>

      <ul className="mcov-list">
        {frames.map((frame, index) => (
          <Row
            key={frame.key}
            frame={frame}
            houseCount={houseCount}
            image={frame.imageId ? byId.get(String(frame.imageId)) : null}
            index={index}
            reduce={reduce}
          />
        ))}
      </ul>

      {/*
        The re-scope, in the same breath as the list. A matching set is a fact
        about photographs and published documents — it is not standing with any
        house, and the house's own band is where its full brief lives.
      */}
      <p className="mcov-note">
        Each list is the house&rsquo;s own, read from what it publishes, with repeated asks
        shown once — one photograph answers every list that asks for that frame. A matching
        set is a fact about your photographs, not standing with any house: each house also
        publishes measurements, forms and terms of its own, and reads submissions on its own
        judgment. Open a house for its full brief.
      </p>
    </>
  );
}

export default function MarketCoverage({ houses = [], images = [] }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  // Closed, nothing has been asked for. Opening is the fetch.
  const { coverage, isLoading, error, refetch } = useMarketCoverage(houses, {
    images,
    enabled: open,
  });

  return (
    <section className="mcov" aria-labelledby="mcov-title">
      <div className="mcov-head">
        {/* The reading register, not the poster register — a preface to the
            board, never something that could be read as a house's name. */}
        <h2 className="mcov-line" id="mcov-title">
          The market&rsquo;s shot lists, read as one.
        </h2>
        <button
          type="button"
          className="mcov-toggle"
          aria-expanded={open}
          aria-controls="mcov-panel"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          {open ? 'Close' : 'Read'}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="mcov-panel"
            className="mcov-panel"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.42, ease: EASE }}
          >
            <div className="mcov-panel__inner">
              <Panel
                coverage={coverage}
                images={images}
                isLoading={isLoading}
                error={error}
                refetch={refetch}
                reduce={reduce}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
