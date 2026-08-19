import { describe, expect, test } from 'vitest';
import { SLOT_STATE } from '../specRegistry';
import { askedFor, buildBrief, readConditions, readStanding, splitFrames } from '../briefModel';

const shot = (label, state = SLOT_STATE.NEEDED) => ({ key: label, label, state });

describe('splitFrames', () => {
  test('a condition several frames share becomes a condition, not part of each name', () => {
    // Elite publishes these two. As list items they read as near-duplicates,
    // and the actual instruction is buried inside both.
    const { frames, conditions } = splitFrames([
      shot('Close-up, hair pulled back'),
      shot('Close-up profile, hair pulled back'),
      shot('Full length'),
    ]);

    expect(frames.map((f) => f.label)).toEqual(['Close-up', 'Close-up profile', 'Full length']);
    // Sentence case: it is an instruction, not a proper noun.
    expect(conditions).toEqual(['Hair pulled back']);
  });

  test('a condition only one frame carries stays on that frame', () => {
    // Muse's "hair up" and "hair down" are two different pictures. Lifting them
    // out would lose the requirement entirely.
    const { frames, conditions } = splitFrames([
      shot('Close-up, hair down'),
      shot('Close-up, hair up'),
      shot('Full length'),
    ]);

    expect(frames.map((f) => f.label)).toEqual([
      'Close-up, hair down',
      'Close-up, hair up',
      'Full length',
    ]);
    expect(conditions).toEqual([]);
  });

  test('two published slots that reduce to the same frame are one frame to shoot', () => {
    const { frames } = splitFrames([
      shot('Full length, hair pulled back'),
      shot('Full length, hair pulled back'),
      shot('Close-up, hair pulled back'),
    ]);

    expect(frames.map((f) => f.label)).toEqual(['Full length', 'Close-up']);
  });

  test('what is already in the set is carried through', () => {
    const { frames } = splitFrames([shot('Full length', SLOT_STATE.IN_SET), shot('Close-up')]);
    expect(frames.map((f) => f.have)).toEqual([true, false]);
  });
});

describe('readConditions', () => {
  const rules = [
    { text: 'Form fitted clothing', modality: 'Required' },
    { text: 'Do not wear any makeup', modality: 'Not allowed' },
    { text: 'No smiles', modality: 'Not allowed' },
    // A fragment of the source sentence. It says nothing actionable.
    { text: 'Or a bikini', modality: 'Allowed' },
  ];

  test('sorts published clauses by what they ask and what they refuse', () => {
    const { wants, avoids } = readConditions(rules);
    expect(wants).toEqual(['Form fitted clothing']);
    expect(avoids).toEqual(['Do not wear any makeup', 'No smiles']);
  });

  test('merely permitted clauses are dropped', () => {
    const { wants, avoids } = readConditions(rules);
    expect([...wants, ...avoids]).not.toContain('Or a bikini');
  });

  test('a condition lifted off the frames leads, because it governs all of them', () => {
    const { wants } = readConditions(rules, ['Hair pulled back']);
    expect(wants[0]).toBe('Hair pulled back');
  });
});

describe('readStanding', () => {
  test('drops findings that only report what Pholio could not check', () => {
    const { blockers, clears } = readStanding([
      { sentence: 'Age — Pholio can’t check this from your profile.' },
    ]);
    expect(blockers).toEqual([]);
    expect(clears).toEqual([]);
  });

  test('a published range the talent sits outside is kept, and separated', () => {
    const { blockers, clears } = readStanding([
      { sentence: 'Height — your profile sits outside what they publish.' },
      { sentence: 'Age — your profile is inside what they publish.' },
    ]);
    expect(blockers).toHaveLength(1);
    expect(clears).toHaveLength(1);
  });
});

describe('askedFor', () => {
  test('a fixed count reads as a count, not as "exactly N shots"', () => {
    expect(askedFor({ minimum: 6, maximum: 6 })).toBe('6 frames');
  });

  test('an open-ended minimum says so plainly', () => {
    expect(askedFor({ minimum: 3, maximum: null })).toBe('At least 3 frames');
  });

  test('a range reads as a range', () => {
    expect(askedFor({ minimum: 3, maximum: 5 })).toBe('3–5 frames');
  });

  test('no published count falls back to what they actually list', () => {
    expect(askedFor(null, 4)).toBe('4 frames');
    expect(askedFor(null, 0)).toBeNull();
  });
});

describe('buildBrief', () => {
  test('counts the frames a talent has against the frames that remain', () => {
    const brief = buildBrief({
      shots: [
        shot('Close-up, hair pulled back', SLOT_STATE.IN_SET),
        shot('Close-up profile, hair pulled back'),
      ],
      shotCount: { minimum: 2, maximum: 2 },
      setRules: [],
      eligibility: [],
      formFields: { list: ['a', 'b', 'c'], unverifiable: true },
    });

    expect(brief.asked).toBe('2 frames');
    expect(brief.have).toBe(1);
    // Their form is counted, never listed — Pholio fills most of it anyway.
    expect(brief.formFieldCount).toBe(3);
    expect(brief.frames).toHaveLength(2);
  });

  test('returns nothing for nothing', () => {
    expect(buildBrief(null)).toBeNull();
  });
});
