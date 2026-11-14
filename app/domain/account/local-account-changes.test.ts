import { describe, expect, it } from 'vitest';
import { readLocalAccountChanges, withFirstObservedPlacements, withRemovedPreset } from './local-account-changes';

describe('local account changes', () => {
  it('keeps first observations immutable and records preset removal separately', () => {
    const first = withFirstObservedPlacements(undefined, { scenario: { rune: 'monster' } });
    const next = withRemovedPreset(first, 'preset-1');
    expect(next).toEqual({
      firstObservedPlacements: { scenario: { rune: 'monster' } },
      removedPresetIds: ['preset-1'],
    });
    expect(first).toEqual({ firstObservedPlacements: { scenario: { rune: 'monster' } } });
  });

  it('drops one malformed projection field without rejecting the other', () => {
    expect(readLocalAccountChanges({
      firstObservedPlacements: { scenario: { rune: 'monster', bad: 4 } },
      removedPresetIds: ['preset-1', 3, ''],
    })).toEqual({
      firstObservedPlacements: { scenario: { rune: 'monster' } },
      removedPresetIds: ['preset-1'],
    });
  });
});
