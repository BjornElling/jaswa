import assert from 'node:assert/strict';
import {
  candidateChance, candidateMaxValue, prepareRuneCandidate, roleBuilds,
} from '../app/lib/rune-cleanup-model.ts';

const credit = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };
const base = { hp: 0, atk: 0, def: 0, spd: 0, criRate: 0, criDmg: 0, res: 0, acc: 0 };
const role = {
  id: 'ancient-rolls', name: 'Ancient rolls', type: 'No type',
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

function rune(ancient, firstValue, rarity = 'Legend') {
  return {
    id: ancient ? 'ancient' : 'ordinary', setId: 13, setName: 'Violent', slot: 1, stars: 6,
    ancient, rarity, level: 0, mainStatId: 3, mainValue: 0,
    prefixStatId: null, prefixValue: 0,
    subProperties: [
      { statId: 8, value: firstValue, gemmed: false, grind: 0 },
      { statId: 2, value: 0, gemmed: false, grind: 0 },
      { statId: 4, value: 0, gemmed: false, grind: 0 },
      { statId: 9, value: 0, gemmed: false, grind: 0 },
    ],
    occupiedId: null, obtainedOrder: 1,
  };
}

const ordinary = prepareRuneCandidate(rune(false, 6), role, build, base, credit);
const ancient = prepareRuneCandidate(rune(true, 7), role, build, base, credit);
assert.ok(ordinary);
assert.ok(ancient);
assert.equal(candidateMaxValue(ordinary), 1, 'an ordinary max roll stays at 100 %');
assert.ok(candidateMaxValue(ancient) > 1, 'an Ancient max roll is not capped at 100 %');

/* The initial interval is part of the Ancient probability input as well: the Ancient
   line starts one point higher, so it needs one fewer ordinary upgrade point to clear
   a shared score target.

   The bar is set where both runes have real odds against it. It used to ask for 29
   SPD, which is two points off the very best either can reach — an event of 2.4 parts
   in ten thousand for the ordinary rune and 7.2 for the Ancient one. Those are the
   right numbers and the odds are now counted rather than enumerated
   (`RUNE-CLEANUP-MATH.md` §7), so four thousand runs cannot tell them apart: it is
   one hit against three, and drawing none of either is an ordinary Tuesday. A check
   that reads a difference the calculation does not claim to resolve is measuring the
   dice, not the engine. Twenty SPD is comfortably inside what both can do, and the
   Ancient rune's extra point is worth a clear margin there.

   `candidateChance` accepts the displayed, normalised Max-value threshold, so the
   shared raw score is converted back through this candidate's own denominator. */
const threshold = ancient.valuation.value(8, 17) / ancient.ceiling;
const ancientChance = candidateChance(ancient, threshold);
const ordinaryChance = candidateChance(ordinary, threshold);
assert.ok(ancientChance > ordinaryChance + 0.04,
  `Ancient initial values must affect the chance calculation: ${ordinaryChance} -> ${ancientChance}`);
assert.ok(ancientChance > 0.05 && ancientChance < 0.95,
  `the Ancient fixture must sit where the odds can be read: ${ancientChance}`);

/* An Ancient initial-roll event is also used for a line added later in the
   candidate projection. This guards the max-value path separately from the
   already-imported line above. */
const ordinaryMagic = prepareRuneCandidate(rune(false, 6, 'Magic'), role, build, base, credit);
const ancientMagic = prepareRuneCandidate(rune(true, 7, 'Magic'), role, build, base, credit);
assert.ok(ordinaryMagic);
assert.ok(ancientMagic);
assert.ok(candidateMaxValue(ancientMagic) > candidateMaxValue(ordinaryMagic),
  'Ancient added initial rolls must use the Ancient interval in Max value');

console.log('PASS: Ancient Max value and Chance use Ancient initial roll intervals against ordinary references.');
