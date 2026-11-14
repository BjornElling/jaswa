import { describe, expect, it } from 'vitest';
import { readMonsterPreferences } from './monster-preferences';

describe('monster preference reading', () => {
  it('salvages stat targets and rune slots one key or slot at a time', () => {
    const read = readMonsterPreferences({
      scenario: {
        '17': {
          unitId: '17',
          statTargets: { hp: 0, atk: 1200, def: -1, unknown: 4 },
          statCeilings: { spd: 200, acc: -1, unknown: 4 },
          runeSlots: {
            slot2: [],
            slot4: ['HP%', 'not a slot main'],
            slot6: ['Def%'],
          },
        },
      },
    });

    expect(read.scenario?.['17'].statTargets).toEqual({ hp: 0, atk: 1200 });
    expect(read.scenario?.['17'].statCeilings).toEqual({ spd: 200 });
    expect(read.scenario?.['17'].runeSlots).toEqual({ slot2: [], slot6: ['Def%'] });
  });

  it('does not turn an unreadable-only slot object into a cleared choice', () => {
    const read = readMonsterPreferences({
      scenario: {
        '17': { unitId: '17', label: 'Kept copy', runeSlots: { slot4: ['not a slot main'] } },
      },
    });

    expect(read.scenario?.['17']).toEqual({ unitId: '17', label: 'Kept copy' });
  });
});
