/**
 * Deterministic guard for the event order used by Rune Clean-up probability.
 *
 * The level-0 distinction is easy to lose if additions and improvements are
 * reduced to two totals: a future line must not receive an earlier improvement.
 * These fixtures keep exactly one stat valuable, so their expected probabilities
 * are hand-calculable and independent of the production branch enumerator.
 */
import assert from 'node:assert/strict';
import {
  candidateChance, chanceRuns, prepareRuneCandidate, roleBuilds,
} from '../app/lib/rune-cleanup-model.ts';
import { remainingEvents } from '../app/lib/rune-properties.ts';

const credit = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };
const base = { hp: 0, atk: 0, def: 0, spd: 0, criRate: 0, criDmg: 0, res: 0, acc: 0 };
const role = {
  id: 'probability-order', name: 'Probability order', type: 'No type',
  sets: { preferred: ['Violent'], acceptable: [] },
  slots: {
    slot2: { preferred: [], acceptable: [] },
    slot4: { preferred: [], acceptable: [] },
    slot6: { preferred: [], acceptable: [] },
  },
  artifacts: { hp: false, atk: false, def: false },
  targets: { spd: 1 },
};
const build = roleBuilds(role)[0];
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
  assert.deepEqual(remainingEvents(0, grade).events, expectedEvents[grade], `${grade} event order`);
  const rune = {
    id: `probability-${grade}`, setId: 13, setName: 'Violent', slot: 1, stars: 6,
    ancient: false, rarity: grade, level: 0, mainStatId: 3, mainValue: 0,
    prefixStatId: null, prefixValue: 0,
    subProperties: Array.from({ length: bornCount[grade] }, (_, index) => ({
      statId: index === 0 ? 8 : otherStats[index - 1],
      value: index === 0 ? 4 : 0,
      gemmed: false, grind: 0,
    })),
    occupiedId: null, obtainedOrder: 1,
  };
  /* The rune is read bare, and the bar is stated in SPD — 7.5 points, a quarter of
     five maximum rolls — then put on the candidate's own scale, whatever the canonical
     ruler's perfect rune carries. The rationals depend on the SPD and nothing else. */
  const candidate = prepareRuneCandidate(rune, role, build, base, credit);
  assert.ok(candidate, `${grade} fixture should be judgeable`);
  /* The starting SPD line is 4 points. Reaching 7.5 therefore requires at least one
     later SPD improvement; an added SPD line rolls at most 6. Additions are worth zero
     otherwise in this fixture. */
  const bar = candidate.valuation.value(8, 7.5) / candidate.ceiling;
  const answer = candidateChance(candidate, bar);
  /* Two of the five are certainties and stay exact: a Normal rune has no improvement
     to give its SPD line and can never reach the bar, and a Magic rune's one
     improvement has nowhere else to go. The engine settles those on the reachable
     best and worst without drawing a single sample, which is what makes them exact.

     The other three are counted, so the band is the counting's own: `chanceRuns`
     draws of a share this size sit within four standard errors of the truth all but
     six times in a hundred thousand. The rationals are still the reference — they
     are worked out from the event order by hand, not read off the engine. */
  const expected = expectedChance[grade];
  if (expected === 0 || expected === 1) {
    assert.equal(answer, expected, `${grade} chance should be exactly ${expected}, got ${answer}`);
  } else {
    const band = 4 * Math.sqrt(expected * (1 - expected) / chanceRuns);
    assert.ok(Math.abs(answer - expected) <= band,
      `${grade} chance should be ${expected} ± ${band.toFixed(4)}, got ${answer}`);
  }
  /* The same rune must always print the same number. The draws are a hash of the rune
     itself, so this holds across calls, across the order runes are judged in, and
     between one calculation of a box and the next. */
  assert.equal(candidateChance(candidate, bar), answer, `${grade} chance is not repeatable`);
}

console.log(`PASS: level-0 probability follows each grade's event order, exactly at the`
  + ` certainties and within four standard errors of ${chanceRuns.toLocaleString('en')} draws elsewhere.`);
