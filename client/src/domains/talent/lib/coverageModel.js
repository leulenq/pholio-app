/**
 * The market's shot lists, read as one.
 *
 * Every house in the researched market publishes its own digitals list, and the
 * lists overlap almost completely: a full length on all of them, a waist-up and
 * a close-up on most, one distinctive ask apiece. Ten published lists come to
 * roughly ten distinct frames, which is one afternoon against a plain wall.
 * That is a fact about the houses' own documents, and this is the pass that
 * demonstrates it from those documents rather than asserting it.
 *
 * It is the recovered `buildMarketView` (`git show 39dac647`) re-cut from routes
 * to houses, and it keeps that engine's contract, which is `briefModel.js`'s
 * contract: it normalises, deduplicates and drops — it never invents. Nothing
 * here originates a string; every label is a canonical taxonomy label and every
 * name is the house's own.
 *
 * Amendment 1 widened it past the shot list. The same evaluations already carry
 * each house's published image count and the fields its application form asks
 * for, and measured across the ten published specs the forms overlap harder
 * than the shot lists do — an email address on 9 of 10, a date of birth on 8.
 * Both are read here, and both are read the same way the frames are: as facts
 * about documents.
 *
 * Three things it deliberately does not do:
 *
 *  - It does not recommend. The recovered engine returned a `recommendation`
 *    field naming the shot to take next. The sort carries the identical
 *    information as fact, and a field with that name is how a reading surface
 *    acquires an advice-voice.
 *  - It does not let a personal verdict into the form facts. A form field is
 *    something a talent *supplies*, not something they are measured against, so
 *    nothing in `formFacts` carries an outcome and nothing counts what the
 *    talent already holds. That is the amendment's ruling and it is also why
 *    the form findings are read whatever their outcome: an outcome is a fact
 *    about the talent, and a `guardian.name` field that reads `not_applicable`
 *    because this reader is 25 is still a field four of these forms ask for.
 *  - It does not read a count out of prose. `shotCountSpan` is built from
 *    structured `minimum` / `maximum` values only. Wilhelmina publishes a count
 *    whose bounds are both null — the sentence exists, the numbers do not — and
 *    turning that sentence into a number is the "never invents" line.
 *
 * `missing` stays shot frames and nothing else, which is why every sentence
 * built on it is scoped to a *shot list* and never to a house's requirements.
 */

import {
  CATEGORY,
  OUTCOME,
  canonicalShotLabel,
  fieldLabel,
  readFindings,
  shotFindings,
} from './specRegistry';

/** The series a single house publishes, deduped, in the order its routes list them. */
function seriesIdsOf(house) {
  const ids = (house?.routes || []).map((route) => route?.seriesId).filter(Boolean).map(String);
  return [...new Set(ids)];
}

/**
 * Every series the market publishes, once, in a stable order.
 *
 * This is a fetch key before it is a list — React Query hashes it into the
 * cache entry, and the preflight endpoint chunks on it — so the same market has
 * to produce the same array whichever order the directory arrived in. Uniq and
 * sort belong here rather than at each call site, where one caller forgetting
 * either silently doubles the market's request count.
 */
export function coverageSeriesIds(houses) {
  return [...new Set((houses || []).flatMap(seriesIdsOf))].sort();
}

/**
 * The frame identity, for every published shot.
 *
 * `matchKey` is the cross-house identity: two houses that published the same
 * requirement in different words share it, so "full length" is one row across
 * the whole market. `slotKey` is the fallback for a slot nothing can be
 * compared against, and it is never null (`readFinding`), so no published shot
 * can fall out of this view unnoticed.
 *
 * The asymmetry is the point and not a bug: Elite's "Close-up, hair pulled
 * back" and Muse's "Close-up, hair up" carry different match keys because they
 * are different pictures, and merging them would tell a talent they had shot
 * something they had not.
 */
function frameKeyOf(finding) {
  return finding.matchKey || finding.slotKey;
}

/** The photograph preflight matched to a slot, if it matched one. */
function assignedImageId(finding) {
  return finding.assignments.find((entry) => entry?.imageId)?.imageId || null;
}

/**
 * The lowest published floor and the highest published ceiling, over any set of
 * counts. Applied once to fold a house's routes and once to fold the market's
 * houses — the same fold at both levels is what keeps the counting unit houses
 * rather than routes without the two ever being able to drift apart.
 *
 * A bound nothing published stays null rather than borrowing the other one.
 */
function spanOf(counts) {
  const minimums = counts.map((count) => count.min).filter((value) => value != null);
  const maximums = counts.map((count) => count.max).filter((value) => value != null);
  return {
    min: minimums.length ? Math.min(...minimums) : null,
    max: maximums.length ? Math.max(...maximums) : null,
  };
}

/**
 * A published image count, when the house published numbers rather than a
 * sentence about numbers.
 *
 * `rules.shots.count` carries `minimum` and `maximum` independently, and either
 * may be null on its own: Elite Japan publishes a floor of 5 and no ceiling,
 * Elite Global a ceiling of 3 and no floor, Wilhelmina neither. A count with
 * neither is a house that wrote its ask in prose, and prose is not parsed here
 * — it contributes nothing rather than contributing a guess.
 */
function publishedCount(findings) {
  const bounds = findings.filter(
    (finding) =>
      finding.categoryKey === CATEGORY.SHOT_COUNT &&
      (finding.minimum != null || finding.maximum != null),
  );
  return bounds.length
    ? spanOf(bounds.map((finding) => ({ min: finding.minimum, max: finding.maximum })))
    : null;
}

/**
 * The fields a house's application form asks for.
 *
 * Read whatever the outcome says. Every other reading in this file is a fact
 * about the talent's photographs; this one is a fact about a form, and a form
 * asks what it asks whether or not the reader can answer it. Filtering by
 * outcome would quietly delete the guardian cluster from every adult's screen —
 * `guardian.name` is `appliesWhen age < 18` on four of the ten specs — and the
 * amendment's sentence names it explicitly.
 */
function formFindings(findings) {
  return findings.filter((finding) => finding.categoryKey === CATEGORY.APPLICATION_FIELDS);
}

/**
 * One house's list, folded out of however many routes it has.
 *
 * Elite Paris and Elite Tokyo are one house to a talent (`foldBrands` in
 * `marketDirectory.js`), and both ask for a full length. That is one frame to
 * shoot, so a house's routes are deduped by frame key before anything is
 * counted — the count in "On 6 of 9 lists" is houses, never routes, or a brand
 * with three offices would outvote three separate houses.
 *
 * A frame is in the set for the house when ANY of its routes matched a
 * photograph to it. Per-route evaluations can genuinely disagree: preflight
 * assigns each image to at most one slot, so a shorter list can place a
 * photograph a longer list had already spent. Reading a photograph the talent
 * demonstrably holds as held is the honest resolution of that.
 */
function readHouse(house, evaluationFor, labels) {
  const seriesIds = seriesIdsOf(house);
  const detail = new Map();
  const counts = [];
  // Deduped per house by field key, so a brand whose two offices both ask for an
  // email address is one form asking for an email address.
  const formFields = new Set();
  let publishesForm = false;

  for (const seriesId of seriesIds) {
    const findings = readFindings(evaluationFor(seriesId));

    const count = publishedCount(findings);
    if (count) counts.push(count);

    for (const finding of formFindings(findings)) {
      publishesForm = true;
      // A field the registry could not name is still a form Pholio has read;
      // it just cannot be listed, so it counts the house and nothing more.
      if (finding.field) formFields.add(finding.field);
    }

    for (const finding of shotFindings(findings)) {
      const key = frameKeyOf(finding);
      if (!detail.has(key)) {
        detail.set(key, {
          key,
          label: canonicalShotLabel(finding, labels),
          inSet: false,
          imageId: null,
        });
      }
      const frame = detail.get(key);
      if (finding.outcome === OUTCOME.SATISFIED) {
        frame.inSet = true;
        frame.imageId = frame.imageId || assignedImageId(finding);
      }
    }
  }

  const covered = [...detail.values()].filter((frame) => frame.inSet).length;

  return {
    detail,
    // Folded to one span per house before anything is compared across houses:
    // a brand with three offices publishing a count is one house publishing a
    // count, the same way it is one house asking for a full length.
    count: counts.length ? spanOf(counts) : null,
    form: { publishesForm, fields: formFields },
    house: {
      houseKey: house?.key ?? null,
      name: house?.name || '',
      seriesIds,
      // A house Pholio has researched but that publishes no shots is not a
      // house with an empty list; it is a house the verdict does not count.
      hasShotList: detail.size > 0,
      frames: new Set(detail.keys()),
      covered,
      // Distinct uncovered SHOT frames. Nothing else is in this number, and
      // everything the surface says about it is scoped to the shot list.
      missing: detail.size - covered,
    },
  };
}

/**
 * The span the published counts run across.
 *
 * One house's count is that house's brief, not a fact about the market, so the
 * line does not exist below two — the same threshold, for the same reason, as
 * the strip's own render condition. Above it the span is the plainest possible
 * reading of the documents: the lowest floor anybody published and the highest
 * ceiling anybody published, with no average, no typical, and no house named.
 */
function readCountSpan(read) {
  const published = read.map((entry) => entry.count).filter(Boolean);
  if (published.length < 2) return null;
  return { ...spanOf(published), houses: published.length };
}

/**
 * What the application forms ask for, tallied by house.
 *
 * The overlap is the information here — nine of ten forms ask for an email
 * address — and it is the same "prepare once" proposition as the union shot
 * list, arrived at from a different pile of documents. Every field is reported,
 * including the long tail: `shownThreshold` is the cutoff the surface applies
 * when it collapses the tail into a closing clause, computed here so the
 * sentence and the number it is drawn from cannot disagree, but the engine
 * hands over the whole tally and lets the surface decide what to say.
 *
 * Nothing in here is measured against the talent. There is no outcome, no
 * count of what they hold, and no field ordered by whether they hold it.
 *
 * Unlike the count span this is not gated at two houses. The amendment gates
 * the count line explicitly and leaves this one alone, and the strip's own
 * render condition is already the market-size gate; null here means no house
 * published a form at all, not that too few did.
 */
function readFormFacts(read, labels) {
  const withForms = read.filter((entry) => entry.form.publishesForm);
  if (!withForms.length) return null;

  const tally = new Map();
  for (const entry of withForms) {
    for (const field of entry.form.fields) {
      if (!tally.has(field)) {
        tally.set(field, { field, label: fieldLabel(labels, field), houses: 0 });
      }
      tally.get(field).houses += 1;
    }
  }

  return {
    fields: [...tally.values()].sort(
      (left, right) => right.houses - left.houses || left.label.localeCompare(right.label),
    ),
    formsPublished: withForms.length,
    // Half, rounded up: with 9 forms the cutoff is 5, so a field on 5 forms is
    // named and a field on 4 falls into the tail.
    shownThreshold: Math.ceil(withForms.length / 2),
  };
}

/**
 * Everything these houses publish, read as one.
 *
 * The union list of frames, and — since Amendment 1 — the span their published
 * image counts run across and the fields their forms ask for. All three come
 * out of the same evaluations, which is to say out of the one preflight request
 * the strip already makes: no second fetch, and nothing derived that the
 * documents do not already say.
 *
 * @param {object}   input
 * @param {object[]} input.houses         `buildHouses` output, in board order
 * @param {Function} input.evaluationFor  seriesId -> `evaluationDto`, or null
 * @param {object}   input.labels         the taxonomy label pack
 */
export function buildCoverage({ houses = [], evaluationFor = () => null, labels = {} } = {}) {
  const read = (houses || []).map((house) => readHouse(house, evaluationFor, labels));

  const rows = new Map();
  for (const { house, detail } of read) {
    for (const frame of detail.values()) {
      if (!rows.has(frame.key)) {
        // The first house to publish a frame names it. Houses sharing a
        // `matchKey` published the same requirement, so they agree on the
        // canonical label; where they only share a `slotKey` there is one
        // house, so there is nothing to disagree with.
        rows.set(frame.key, {
          key: frame.key,
          label: frame.label,
          inSet: false,
          imageId: null,
          houseKeys: [],
          missingFor: [],
        });
      }
      const row = rows.get(frame.key);
      // One push per house, because `detail` is already one entry per frame.
      row.houseKeys.push(house.houseKey);
      if (frame.inSet) {
        row.inSet = true;
        row.imageId = row.imageId || frame.imageId;
      } else {
        row.missingFor.push(house);
      }
    }
  }

  const frames = [...rows.values()]
    .map((row) => ({
      key: row.key,
      label: row.label,
      inSet: row.inSet,
      imageId: row.imageId,
      houseKeys: row.houseKeys,
      listCount: row.houseKeys.length,
      /*
        The completes fact, and the bug it exists to prevent.

        The original ledger counted every house missing a frame and called them
        all unlocked by it — so a talent who went and shot it found that
        precisely zero lists had been finished, because the other five were
        still missing something else. A frame completes a house only when it is
        that house's *sole* remaining gap, which is exactly `missing === 1` on a
        house that has not covered it. Anything weaker is `listCount`, and the
        surface says it as its own separate sentence.

        Named in board order: the reader meets these houses in that order, and
        the completes clause is read against the list below it.
      */
      completes: row.missingFor.filter((house) => house.missing === 1).map((house) => house.name),
    }))
    /*
      The sort is the information (§1 not-built #3). Unshot frames first, the
      ones that finish somebody's list ahead of the ones merely on many lists,
      then the most-asked, then alphabetical so the list never reshuffles
      between reads. No imperative is required to say what to shoot first, and
      none is offered.
    */
    .sort(
      (left, right) =>
        Number(left.inSet) - Number(right.inSet) ||
        right.completes.length - left.completes.length ||
        right.listCount - left.listCount ||
        left.label.localeCompare(right.label),
    );

  const withLists = read.filter(({ house }) => house.hasShotList);

  return {
    houses: read.map(({ house }) => house),
    frames,
    shotCountSpan: readCountSpan(read),
    formFacts: readFormFacts(read, labels),
    totals: {
      // The denominator in "On 6 of 9 lists" and the subject of the verdict:
      // houses that actually publish a list, not houses on the board.
      housesWithLists: withLists.length,
      frames: frames.length,
      inSet: frames.filter((frame) => frame.inSet).length,
    },
  };
}

export default buildCoverage;
