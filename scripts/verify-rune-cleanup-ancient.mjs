import assert from 'node:assert/strict';
import {
  candidateChance, candidateMaxValue, chanceRuns, newRuneAdviceScope, prepareRuneCandidate, roleBuilds,
} from '../app/domain/runes/cleanup/rune-cleanup-model.ts';
import { defaultCraftCredit, noCraftCredit } from '../app/domain/runes/craft/rune-craft-end-state.ts';

/* Settings' starting credit, and the ruler's, as Rune Clean-up reads a rune. */
const credit = defaultCraftCredit;
const scope = () => newRuneAdviceScope(defaultCraftCredit);
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

/* Read the way the page reads it, where a perfect ordinary line is exactly 100 %. */
const ordinary = prepareRuneCandidate(rune(false, 6), role, build, base, credit, scope());
const ancient = prepareRuneCandidate(rune(true, 7), role, build, base, credit, scope());
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

   `candidateChance` accepts the displayed, normalised Potential threshold, so the
   shared raw score is converted back through this candidate's own denominator. */
const threshold = ancient.valuation.value(8, 17) / ancient.ceiling;
const ancientChance = candidateChance(ancient, threshold);
const ordinaryChance = candidateChance(ordinary, threshold);
assert.ok(ancientChance > ordinaryChance + 0.04,
  `Ancient initial values must affect the chance calculation: ${ordinaryChance} -> ${ancientChance}`);
assert.ok(ancientChance > 0.05 && ancientChance < 0.95,
  `the Ancient fixture must sit where the odds can be read: ${ancientChance}`);

/* **A line an Ancient rune gains by power-up rolls from the ordinary table.** Only its
   born lines are Ancient. The user's own Hero and Rare Ancient runes at +12 and +15
   carry added lines below the Ancient minimum — SPD 4, ACC 4, HP % 5 — which no born
   Ancient line can be, while Legend Ancient runes, which gain none, never do. This
   asserted the opposite until October 2026.

   So two Magic runes with the same born SPD line, one Ancient and one not, have the
   same future: one ordinary improvement and three ordinary additions. With the role
   paying for every type the slot allows, any Ancient interval on an addition would
   lift the Ancient rune's Potential above the ordinary one's. */
const everything = { ...role, id: 'ancient-added', targets: { hp: 1, atk: 1, spd: 1, criRate: 1, criDmg: 1, res: 1, acc: 1 } };
const everyBuild = roleBuilds(everything)[0];
const magic = (ancient) => ({ ...rune(ancient, 6, 'Magic'), subProperties: [rune(ancient, 6).subProperties[0]] });
/* Read bare: an Ancient rune takes Ancient craft items, which is a legality rule of
   its own and would move the two apart for a reason that has nothing to do with
   which table an added line rolls from. */
const bare = noCraftCredit;
const ordinaryMagic = prepareRuneCandidate(magic(false), everything, everyBuild, base, bare, scope());
const ancientMagic = prepareRuneCandidate(magic(true), everything, everyBuild, base, bare, scope());
assert.ok(ordinaryMagic);
assert.ok(ancientMagic);
assert.ok(Math.abs(candidateMaxValue(ancientMagic) - candidateMaxValue(ordinaryMagic)) < 1e-12,
  `an Ancient rune's added lines must roll the ordinary table: ${candidateMaxValue(ordinaryMagic)} -> ${candidateMaxValue(ancientMagic)}`);
/* The Chance is counted, and the Ancient flag is part of a rune's seed, so the two
   draw different runs: they agree within the counting's own spread, not exactly. An
   Ancient interval on three additions would put them a long way outside it. */
const addedBar = 0.35;
const ordinaryAdded = candidateChance(ordinaryMagic, addedBar);
const ancientAdded = candidateChance(ancientMagic, addedBar);
const addedBand = 4 * Math.sqrt(2 * Math.max(0.0001, ordinaryAdded * (1 - ordinaryAdded)) / chanceRuns);
assert.ok(ordinaryAdded > 0.05 && ordinaryAdded < 0.95, `the added-line fixture must sit where the odds can be read: ${ordinaryAdded}`);
assert.ok(Math.abs(ancientAdded - ordinaryAdded) <= addedBand,
  `an Ancient rune's added lines must roll the ordinary table in Chance too: ${ordinaryAdded} -> ${ancientAdded}`);

console.log('PASS: Ancient born lines use the Ancient interval, added lines the ordinary one, and craft tables follow rune lineage.');
