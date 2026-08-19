import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import useMarketCoverage from './useMarketCoverage';
import { countOf } from '../../lib/marketFormat';
import { frameSrc } from '../../lib/frameSrc';
import './market-coverage.css';

/**
 * What these houses publish, read as one.
 *
 * Ten houses publish ten shot lists, ten image counts and ten application
 * forms, and the documents largely ask for the same things. Read together, the
 * lists come to a handful of distinct frames — one photograph answers every
 * list that asks for that frame — the published counts run across one span, and
 * the forms turn out to ask for the same few facts. That is the whole claim: it
 * is about documents and photographs, never about access, chances or outcomes.
 * Nothing here is scored, ranked, recommended or paid for.
 *
 * Amendment 1 widened the scope past the shot list, and the widening is
 * deliberately lopsided. The frames are read against the talent's own
 * photographs, because a photograph is a thing they either hold or do not. The
 * form facts are not read against them at all: a form field is something a
 * talent *supplies*, not something they are measured against, so that block
 * carries document facts only — no verdict, no tally of what they hold, and
 * never the word "you".
 *
 * The strip is closed by default and costs nothing to sit under. Opening it is
 * what fetches — one preflight for the whole market, cached — so the board's
 * rule holds: a market of any size costs one request to read, one more to open
 * a house, and one more to read everything these houses publish at once.
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

/**
 * The span the published image counts run across.
 *
 * Both bounds or nothing. A market where one house published a floor and
 * nobody published a ceiling is a real market, but a single-sided span has no
 * ruled sentence yet — omitted rather than improvised.
 *
 * `countOf` rather than a bare "images" for the collapsed case, per the
 * verdict-grammar convention the rest of the strip already follows: the noun
 * agrees with the number wherever the number can be one.
 */
function countLine(span) {
  if (!span || Number(span.houses) < 2) return '';
  const { min, max } = span;
  // A single-sided span has no ruled sentence yet — omitted rather than improvised.
  if (min == null || max == null) return '';
  if (min === max) return `Every published count is ${countOf(min, 'image')}.`;
  return `The published counts run ${min} to ${max} images.`;
}

/**
 * The forms' vocabulary, in prose.
 *
 * `marketFormat.js`'s doctrine applied to taxonomy field keys: nothing here
 * invents a fact, and a field the map has never met degrades to its published
 * label rather than vanishing from the sentence. The map's *order* is
 * load-bearing too — it is the reading order inside a count group, which is why
 * the sentence says "a phone number and Instagram" instead of whatever the
 * tally's alphabetising happened to leave behind.
 *
 * No `guardian.*` entry, deliberately: Amendment 1a keeps that cluster out of
 * the list entirely and gives it a sentence of its own, so there is no path by
 * which it could be named twice.
 */
const FIELD_WORDS = Object.freeze({
  'contact.email': 'an email address',
  'applicant.first_name': 'first name',
  'applicant.last_name': 'last name',
  'applicant.full_name': 'name',
  'applicant.date_of_birth': 'date of birth',
  'contact.phone': 'a phone number',
  'social.instagram': 'Instagram',
  'social.tiktok': 'TikTok',
  'measurements.height': 'height',
  'contact.city': 'city',
  'applicant.gender': 'gender',
});

const FIELD_ORDER = Object.keys(FIELD_WORDS);

/** Everything under `guardian.` is one thing to prepare, and one sentence. */
const GUARDIAN_PREFIX = 'guardian.';
const GUARDIAN_WORDS = 'a parent or guardian’s details';

function isGuardian(field) {
  return String(field ?? '').startsWith(GUARDIAN_PREFIX);
}

/** A field the map has never met sorts after every field it has. */
function rankOf(field) {
  const position = FIELD_ORDER.indexOf(field);
  return position === -1 ? FIELD_ORDER.length : position;
}

/**
 * A field the map has never met, said as well as it can be said.
 *
 * The registry's label is already product copy, but it is title-cased for a
 * heading and this sentence needs it mid-clause. Lowercased — unless it carries
 * a capital past its first letter, which is how a proper noun ("Instagram
 * Handle") announces itself and asks to be left alone.
 */
function publishedWord(label) {
  const text = String(label ?? '').trim();
  if (!text) return '';
  return /[A-Z]/.test(text.slice(1)) ? text : text.toLowerCase();
}

/**
 * The tally, folded into the items a person would actually list.
 *
 * One fold, and one removal.
 *
 * The fold: a form asking for a first name and a last name is asking for a
 * name. It happens only when both are on the same number of forms; where the
 * counts differ the forms genuinely disagree, and "name (8)" would invent eight
 * forms that asked for both. It runs before the threshold, so the tail the
 * closing clause refers to is the tail of these items and never half of one
 * that got named.
 *
 * The removal: `guardian.*` never reaches this list at all (Amendment 1a). The
 * cluster is conditional on who is applying, and a condition that arrives as a
 * bare count in a run of unconditional facts is the one place this sentence
 * could mislead. It gets its own sentence, and this function is where the
 * guarantee that it is said once lives.
 */
function formItems(formFacts) {
  const fields = (formFacts?.fields || []).filter(
    (entry) => entry?.field && !isGuardian(entry.field),
  );
  const order = new Map(fields.map((entry, position) => [entry.field, position]));
  const byField = new Map(fields.map((entry) => [entry.field, entry]));
  const spent = new Set();
  const items = [];

  const first = byField.get('applicant.first_name');
  const last = byField.get('applicant.last_name');
  let namedAt = null;
  if (first && last && first.houses === last.houses) {
    spent.add(first.field);
    spent.add(last.field);
    namedAt = Number(first.houses) || 0;
    items.push({
      text: 'name',
      houses: namedAt,
      rank: rankOf('applicant.first_name'),
      order: order.get(first.field),
    });
  }

  const full = byField.get('applicant.full_name');
  if (full) {
    spent.add(full.field);
    // Two taxonomy spellings of one fact: a market that publishes both is not
    // asking for two names at the same count.
    if (namedAt === null || (Number(full.houses) || 0) !== namedAt) {
      items.push({
        text: 'name',
        houses: Number(full.houses) || 0,
        rank: rankOf('applicant.full_name'),
        order: order.get(full.field),
      });
    }
  }

  for (const entry of fields) {
    if (spent.has(entry.field)) continue;
    const text = FIELD_WORDS[entry.field] || publishedWord(entry.label);
    if (!text) continue;
    items.push({
      text,
      houses: Number(entry.houses) || 0,
      rank: rankOf(entry.field),
      order: order.get(entry.field),
    });
  }

  return items;
}

/**
 * What the forms ask for, in one sentence.
 *
 * Grouped by count descending, because the count is the whole point: the same
 * few facts, on nearly every form. The first group carries the denominator so
 * the numbers after it are read against something, exactly as the row counts
 * are.
 *
 * Everything under the threshold stays in the sentence as the closing clause —
 * nothing is hidden, and the clause is a literal description of the fields it
 * did not name. There is no verdict here and no counting of what the reader
 * holds: a form field is supplied, not satisfied.
 */
function formSentence(formFacts) {
  const threshold = Number(formFacts?.shownThreshold) || 0;
  const formsPublished = Number(formFacts?.formsPublished) || 0;

  const named = formItems(formFacts)
    .filter((item) => item.houses >= threshold)
    .sort((left, right) =>
      right.houses - left.houses || left.rank - right.rank || left.order - right.order);
  if (!named.length) return '';

  const groups = [];
  for (const item of named) {
    const open = groups[groups.length - 1];
    if (open && open.houses === item.houses) open.texts.push(item.text);
    else groups.push({ houses: item.houses, texts: [item.text] });
  }

  const items = groups
    .map((group, position) => {
      const count = position === 0 ? `${group.houses} of ${formsPublished}` : `${group.houses}`;
      return `${joinPhrases(group.texts)} (${count})`;
    })
    .join(', ');

  return (
    `The application forms ask for the same few facts: ${items}, along with each ` +
    'form’s own remaining fields — open a house for its list.'
  );
}

/**
 * The guardian cluster, in a sentence of its own.
 *
 * Amendment 1a. It is exempt from the threshold because the threshold is a
 * readability rule, and readability is the wrong trade for the one class of
 * field whose omission has a real cost — a minor's parent preparing an
 * application, reading "each form's own remaining fields" and learning nothing.
 *
 * A sentence rather than an item because the fact is conditional on who is
 * applying, and the condition belongs in the same breath as the fact. "Minors"
 * stays unnumbered: houses draw that line at different ages, and each house's
 * own brief is where its line lives. The count stays exactly as published.
 */
function minorsSentence(formFacts) {
  const guardians = (formFacts?.fields || []).filter(
    (entry) => entry?.field && isGuardian(entry.field),
  );
  if (!guardians.length) return '';

  // The fold: no form asks for a guardian's phone without asking who the
  // guardian is, so the cluster's count is the highest count among its fields.
  const houses = Math.max(...guardians.map((entry) => Number(entry.houses) || 0));
  if (!houses) return '';

  const published = countOf(formFacts?.formsPublished, 'form');
  return `For minors, ${houses} of the ${published} also ask for ${GUARDIAN_WORDS}.`;
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

  const countSentence = countLine(coverage.shotCountSpan);
  const formsLine = coverage.formFacts ? formSentence(coverage.formFacts) : '';
  const minorsLine = coverage.formFacts ? minorsSentence(coverage.formFacts) : '';

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

      {/*
        The second fact about the same documents, said at the volume of a
        footnote. Structured bounds only — a house that wrote its ask in prose
        contributes nothing rather than contributing a guess.
      */}
      {countSentence ? <p className="mcov-span">{countSentence}</p> : null}

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
        The other pile of documents. The forms overlap harder than the shot
        lists do, and knowing the short list once is the same prepare-once
        proposition — arrived at from application forms instead of digitals.

        No photographs, no verdict, no second person. This block is about what
        ten forms ask for, and nothing about the reader.

        Either sentence is enough to open it. A market whose only shared fact is
        the guardian cluster still has that fact said out loud — the whole point
        of exempting it from the threshold.
      */}
      {formsLine || minorsLine ? (
        <div className="mcov-forms">
          <h3 className="mcov-sub">Their forms</h3>
          {formsLine ? <p className="mcov-forms__line">{formsLine}</p> : null}
          {minorsLine ? <p className="mcov-forms__line">{minorsLine}</p> : null}
        </div>
      ) : null}

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
            board, never something that could be read as a house's name. The
            scope outgrew "shot lists"; the sentence still names only published
            documents and one act of reading them. */}
        <h2 className="mcov-line" id="mcov-title">
          What these houses publish, read as one.
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
