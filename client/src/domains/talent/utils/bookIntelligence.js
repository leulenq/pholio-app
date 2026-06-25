/**
 * Pholio Intelligence for The Book.
 * Reads portfolio gap analysis into calm, assistive refinements.
 */

const SUGGESTIONS = {
  min_count: {
    title: 'Build the range',
    text: 'A tighter sequence of varied frames gives agencies more to read.',
  },
  headshot: {
    title: 'Anchor with a clean headshot',
    text: 'A direct headshot gives the set its first reference point.',
  },
  fullbody: {
    title: 'Add a full-length frame',
    text: 'Clear proportion keeps the book easy to evaluate.',
  },
  side_profile: {
    title: 'Add a profile view',
    text: 'A side view clarifies shape, posture, and casting proportion.',
  },
  smile: {
    title: 'Add warmth',
    text: 'A natural smile broadens the commercial read.',
  },
  back: {
    title: 'Complete the angles',
    text: 'A back view rounds out the standard digitals set.',
  },
  editorial: {
    title: 'Place editorial range',
    text: 'Mark the strongest styled frame so editorial range is easy to find.',
  },
  lifestyle: {
    title: 'Place lifestyle range',
    text: 'A lifestyle read gives agencies a broader casting lane.',
  },
};

const PRIORITY = [
  'min_count',
  'headshot',
  'fullbody',
  'side_profile',
  'smile',
  'back',
  'editorial',
  'lifestyle',
];

export function buildBookIntelligence(analysis) {
  const checks = analysis?.checks || [];

  const suggestions = PRIORITY.filter((id) =>
    checks.some((item) => item.id === id && !item.met),
  ).map((id) => ({ id, ...SUGGESTIONS[id] }));

  const signalChecks = checks.filter((item) => item.id !== 'min_count');
  const covered = signalChecks.filter((item) => item.met).length;
  const total = signalChecks.length;

  return {
    suggestions,
    covered,
    total,
    isComplete: analysis?.isComplete ?? false,
  };
}
