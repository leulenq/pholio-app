/**
 * What a house asks for, reduced to what a talent has to act on.
 *
 * `buildAgencyView` is faithful to the registry, and the registry is research:
 * it carries every published clause, every form field, and Pholio's own notes
 * about what it could not verify. Printing that faithfully is how the expanded
 * state became a database inspection screen.
 *
 * This is the presentation-time pass that turns it into a brief. It normalises,
 * deduplicates and drops — it never invents. The underlying dataset is due a
 * rebuild; nothing here is a substitute for that, and each compromise says so.
 */

import { SLOT_STATE } from './specRegistry';

/** Sentence-case a published clause without flattening its proper nouns. */
function asClause(text) {
  const clean = String(text || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * A condition shared by several frames belongs to the shoot, not to a frame.
 *
 * Elite publishes "Close-up, hair pulled back" and "Close-up profile, hair
 * pulled back". As two list items they read as near-duplicates and the actual
 * instruction — hair pulled back, for everything — is buried in both. Split the
 * trailing clause off when more than one frame carries it, and it becomes what
 * it always was: one condition on the whole set.
 *
 * A clause carried by a single frame stays on that frame. Muse's "hair up" and
 * "hair down" are genuinely two different pictures, and merging them would lose
 * the requirement.
 */
export function splitFrames(shots) {
  const parts = shots.map((shot) => {
    const at = shot.label.indexOf(', ');
    return at > 0
      ? { base: shot.label.slice(0, at), tail: shot.label.slice(at + 2), shot }
      : { base: shot.label, tail: null, shot };
  });

  const tally = new Map();
  for (const part of parts) {
    if (!part.tail) continue;
    const key = part.tail.toLowerCase();
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  const shared = new Set([...tally.entries()].filter(([, n]) => n > 1).map(([k]) => k));

  const frames = [];
  const seen = new Set();
  for (const part of parts) {
    const isShared = part.tail && shared.has(part.tail.toLowerCase());
    const label = isShared ? part.base : part.shot.label;
    const key = label.toLowerCase();
    // Two published slots that reduce to the same frame are one frame to shoot.
    if (seen.has(key)) continue;
    seen.add(key);
    frames.push({
      key: part.shot.key,
      label,
      have: part.shot.state === SLOT_STATE.IN_SET,
    });
  }

  // Sentence case, not title case: "hair pulled back" is an instruction, and
  // "Hair Pulled Back" reads like a proper noun.
  const conditions = [...shared].map((tail) => asClause(tail));
  return { frames, conditions };
}

/**
 * The shoot conditions, as two short lists.
 *
 * Modality already sorts these: what the house asks for, and what it refuses.
 * Everything merely permitted is dropped — "Or a bikini" is a fragment of the
 * source sentence and says nothing a talent can act on, and a list of things
 * that are simply allowed is not guidance.
 */
const WANT_MODALITIES = new Set([
  'Required',
  'They ask for this',
  'They prefer this',
  'They encourage this',
]);
const AVOID_MODALITIES = new Set(['Not allowed']);

export function readConditions(setRules, sharedFromFrames = []) {
  const wants = [];
  const avoids = [];

  for (const rule of setRules || []) {
    const text = asClause(rule.text);
    if (!text) continue;
    if (AVOID_MODALITIES.has(rule.modality)) avoids.push(text);
    else if (WANT_MODALITIES.has(rule.modality)) wants.push(text);
  }

  return {
    // A condition lifted off the frames leads, because it governs every frame.
    wants: [...sharedFromFrames, ...wants],
    avoids,
  };
}

/**
 * Only eligibility that says something.
 *
 * `buildAgencyView` reports a rule Pholio could not check as a finding, which
 * is honest bookkeeping and useless as advice — "Age — Pholio can't check this
 * from your profile" tells a talent nothing to do. A published range the talent
 * sits outside of, on the other hand, is the single most important thing on the
 * screen.
 */
export function readStanding(eligibility) {
  const blockers = [];
  const clears = [];
  for (const item of eligibility || []) {
    const sentence = String(item.sentence || '');
    if (/can’t check|can't check/i.test(sentence)) continue;
    if (/outside what they publish/i.test(sentence)) blockers.push(sentence);
    else if (/inside what they publish/i.test(sentence)) clears.push(sentence);
  }
  return { blockers, clears };
}

/** "Six frames" / "At least three frames" / "Three to five frames". */
export function askedFor(shotCount, frameCount) {
  const { minimum, maximum } = shotCount || {};
  if (minimum && maximum && minimum === maximum) return `${minimum} frames`;
  if (minimum && maximum) return `${minimum}–${maximum} frames`;
  if (minimum) return `At least ${minimum} frames`;
  if (maximum) return `Up to ${maximum} frames`;
  return frameCount ? `${frameCount} frames` : null;
}

/**
 * The whole brief, as the surface needs it.
 *
 * Deliberately small: a verdict, the frames, the conditions, anything genuinely
 * blocking, and a footnote of everything else. What the agency's own web form
 * asks for is counted rather than listed — Pholio fills most of it, and a
 * twenty-item inventory of "first name, last name, email…" is not a brief.
 */
export function buildBrief(view) {
  if (!view) return null;
  const { frames, conditions: fromFrames } = splitFrames(view.shots || []);
  const conditions = readConditions(view.setRules, fromFrames);
  const standing = readStanding(view.eligibility);

  const have = frames.filter((frame) => frame.have).length;
  const asked = askedFor(view.shotCount, frames.length);

  return {
    asked,
    frames,
    have,
    conditions,
    standing,
    files: view.files,
    // Counted, not listed.
    formFieldCount: view.formFields?.list?.length || 0,
    unverifiableForm: Boolean(view.formFields?.unverifiable),
  };
}
