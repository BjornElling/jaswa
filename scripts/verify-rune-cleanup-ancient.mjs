import assert from 'node:assert/strict';
import {
  candidateChance, candidateMaxValue, prepareRuneCandidate, presetBuilds,
} from '../app/lib/rune-cleanup-model.ts';

const credit = { gem: null, gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };
const base = { hp: 0, atk: 0, def: 0, spd: 0, criRate: 0, criDmg: 0, res: 0, acc: 0 };
const preset = {
  id: 'ancient-rolls', name: 'Ancient rolls', type: 'No type',
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

function rune(ancient, firstValue, defaultGrade = 'Legend') {
  return {
    id: ancient ? 'ancient' : 'ordinary', setId: 13, setName: 'Violent', slot: 1, stars: 6,
    ancient, defaultGrade, level: 0, mainStatId: 3, mainValue: 0,
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

const ordinary = prepareRuneCandidate(rune(false, 6), preset, build, base, credit);
const ancient = prepareRuneCandidate(rune(true, 7), preset, build, base, credit);
assert.ok(ordinary);
assert.ok(ancient);
assert.equal(candidateMaxValue(ordinary), 1, 'an ordinary max roll stays at 100 %');
assert.ok(candidateMaxValue(ancient) > 1, 'an Ancient max roll is not capped at 100 %');

/* The initial interval is part of the exact Ancient probability input as well:
   the Ancient line starts one point higher, so it needs one fewer ordinary
   upgrade point to clear this shared score target. */
const target = ancient.valuation.value(8, 29) / ancient.ceiling;
/* `candidateChance` accepts the displayed, normalized Max-value threshold;
   convert the shared raw score back through this candidate's denominator. */
const threshold = target;
assert.ok(candidateChance(ancient, threshold) > candidateChance(ordinary, threshold),
  'Ancient initial values must affect the chance calculation');

/* An Ancient initial-roll event is also used for a line added later in the
   candidate projection. This guards the max-value path separately from the
   already-imported line above. */
const ordinaryMagic = prepareRuneCandidate(rune(false, 6, 'Magic'), preset, build, base, credit);
const ancientMagic = prepareRuneCandidate(rune(true, 7, 'Magic'), preset, build, base, credit);
assert.ok(ordinaryMagic);
assert.ok(ancientMagic);
assert.ok(candidateMaxValue(ancientMagic) > candidateMaxValue(ordinaryMagic),
  'Ancient added initial rolls must use the Ancient interval in Max value');

console.log('PASS: Ancient Max value and Chance use Ancient initial roll intervals against ordinary references.');
