/**
 * Deterministic guard for the event order used by Rune Clean-up probability.
 *
 * The level-0 distinction is easy to lose if additions and improvements are
 * reduced to two totals: a future line must not receive an earlier improvement.
 * These fixtures keep exactly one stat valuable, so their expected probabilities
 * are hand-calculable and independent of the production branch enumerator.
 */
import assert from 'node:assert/strict';
import { candidateChance, prepareRuneCandidate, presetBuilds } from '../app/lib/rune-cleanup-model.ts';
import { remainingEvents } from '../app/lib/rune-properties.ts';
import { runeDefaultGradeOrder } from '../app/lib/runes.ts';

const credit = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };
const base = { hp: 0, atk: 0, def: 0, spd: 0, criRate: 0, criDmg: 0, res: 0, acc: 0 };
const preset = {
  id: 'probability-order', name: 'Probability order', type: 'No type',
  sets: { preferred: ['Violent'], acceptable: [] },
  slots: {
    slot2: { preferred: [], acceptable: [] },
    slot4: { preferred: [], acceptable: [] },
    slot6: { preferred: [], acceptable: [] },
  },
  artifacts: { hp: false, atk: false, def: false },
  targets: { spd: 1 }, runeShare: 1,
};
const build = presetBuilds(preset)[0];
const bornCount = { Normal: 0, Magic: 1, Rare: 2, Hero: 3, Legend: 4 };
const expectedEvents = {
  Normal: ['add', 'add', 'add', 'add'],
  Magic: ['roll', 'add', 'add', 'add'],
  Rare: ['roll', 'roll', 'add', 'add'],
  Hero: ['roll', 'roll', 'roll', 'add'],
  Legend: ['roll', 'roll', 'roll', 'roll'],
};
const expectedChance = { Normal: 0, Magic: 1, Rare: 3 / 4, Hero: 19 / 27, Legend: 175 / 256 };
const otherStats = [2, 4, 6];

for (const grade of Object.keys(expectedEvents)) {
  const initial = runeDefaultGradeOrder(grade);
  assert.deepEqual(remainingEvents(0, initial).events, expectedEvents[grade], `${grade} event order`);
  const rune = {
    id: `probability-${grade}`, setId: 13, setName: 'Violent', slot: 1, stars: 6,
    ancient: false, defaultGrade: grade, level: 0, mainStatId: 3, mainValue: 0,
    prefixStatId: null, prefixValue: 0,
    subProperties: Array.from({ length: bornCount[grade] }, (_, index) => ({
      statId: index === 0 ? 8 : otherStats[index - 1],
      value: index === 0 ? 4 : 0,
      gemmed: false, grind: 0,
    })),
    occupiedId: null, obtainedOrder: 1,
  };
  const candidate = prepareRuneCandidate(rune, preset, build, base, credit);
  assert.ok(candidate, `${grade} fixture should be judgeable`);
  /* The starting SPD line is 4/6 max-roll units. Reaching 25 % of this
     one-stat ceiling therefore requires at least one later SPD improvement.
     Additions are worth zero in this fixture. */
  assert.ok(Math.abs(candidateChance(candidate, 0.25) - expectedChance[grade]) < 1e-12,
    `${grade} chance should be ${expectedChance[grade]}, got ${candidateChance(candidate, 0.25)}`);
}

console.log('PASS: level-0 probability follows each grade\'s event order.');
