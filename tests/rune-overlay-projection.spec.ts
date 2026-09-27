import { expect, test } from '@playwright/test';
import { runeOverlayProjection } from '../app/lib/rune-overlay-projection';
import type { RunePotentialSettings } from '../app/lib/types';
import type { Rune } from '../app/lib/runes';

const settings: RunePotentialSettings = {
  powerUpPolicy: 3, runeQuality: 3, enchantedGems: 1, grindstones: 1,
  gemGrade: 'Hero', grindstoneGrade: 'Hero', acceptedRunes: 3, brokenRunes: 3,
  intangibleRunes: 1, keepMoreForLargerSets: false,
};

test('projects a Rare level-0 rune as two existing rolls followed by two reveals', () => {
  const rune: Rune = {
    id: 'rare-level-zero', setId: 13, setName: 'Violent', slot: 2, stars: 6,
    ancient: false, defaultGrade: 'Rare', level: 0, mainStatId: 4, mainValue: 0,
    prefixStatId: null, prefixValue: 0,
    subProperties: [
      { statId: 8, value: 5, gemmed: false, grind: 0, rolls: 0 },
      { statId: 2, value: 5, gemmed: false, grind: 0, rolls: 0 },
    ],
    occupiedId: null, obtainedOrder: 1,
  };

  const projection = runeOverlayProjection(rune, settings);
  expect(projection.events.map(({ kind }) => kind)).toEqual(['roll', 'roll', 'add', 'add']);
  expect(projection.remainingRolls).toBe(2);
  expect(projection.remainingAdditions).toBe(2);
  expect(projection.rows.find((row) => row.statId === 8)).toMatchObject({
    current: 5, rolls: 0, remainingRolls: 2, remainingAdditions: 2, maximum: 17,
  });
  expect(projection.projectionLevel).toBe(15);
});
