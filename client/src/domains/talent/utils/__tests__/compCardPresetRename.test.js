import { describe, expect, test } from 'vitest';
import { buildCompCardPresetRenamePayload } from '../compCardPresetRename';

describe('buildCompCardPresetRenamePayload', () => {
  test('changes only the name while preserving the saved card configuration', () => {
    const preset = {
      name: 'Commercial LA',
      payload: {
        name: 'Commercial LA',
        seed: 'seed:commercial',
        layoutFamily: 'mosaic-horizontal',
        styleVariant: 'linework',
        lockHeroId: 'hero-1',
        lockGridIds: ['grid-1', null, 'grid-3', null],
        board: 'Commercial',
        market: 'Los Angeles',
        structure: 'split',
        treatment: 'classic',
        edition: 'ledger',
      },
    };

    expect(buildCompCardPresetRenamePayload(preset, '  Commercial West  ')).toEqual({
      ...preset.payload,
      name: 'Commercial West',
    });
  });

  test('rejects a blank saved-card name', () => {
    expect(() => buildCompCardPresetRenamePayload({ payload: {} }, '   ')).toThrow(
      'Enter a name for this saved card.',
    );
  });
});
