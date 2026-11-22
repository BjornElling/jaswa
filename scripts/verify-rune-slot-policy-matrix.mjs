/** Each adjacent policy stop can only narrow the set of qualifying shared futures. */
import assert from 'node:assert/strict';
import { defaultRuneRoles } from '../app/domain/profiles/rune-roles.ts';
import { defaultRunePotentialSettings } from '../app/domain/profiles/preference-defaults.ts';
import { ordinarySample } from '../app/domain/runes/cleanup/rune-cleanup-model.ts';
import { calculatedRuneVerdict, readingAllowance, runeAdvice } from '../app/domain/runes/cleanup/rune-cleanup-advice.ts';
import { referenceBodies, referenceKey, referenceScores } from '../app/domain/runes/cleanup/rune-quality-reference.ts';

const fields = ['runeQuality', 'powerUpPolicy', 'acceptedRunes', 'brokenRunes'];
const role = defaultRuneRoles()[0];
const roles = [role, { ...role, id: 'other', targets: { hp: 28000, spd: 220 } }];
const base = new Map([[role.type, { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }]]);
const runes = [1, 2, 3, 4, 5, 6].map((slot) => ({
  ...ordinarySample(slot, 6, 1, slot % 2 === 0 ? 9 : 12, 'drop')[0],
  setName: slot % 2 ? 'Intangible' : 'Violent',
}));
const cache = new Map();
const references = { get(piece, prices, credit) {
  const key = referenceKey(piece, prices, credit);
  if (!cache.has(key)) cache.set(key, {
    key, scores: referenceScores(referenceBodies(piece.slot, piece.stars, piece.main, 256), prices, credit),
  });
  return cache.get(key);
} };
const options = { references, candidateRuns: 32 };
const settings = { ...defaultRunePotentialSettings, neverSellPreGrindSpeed: false, neverSellPotentialValue: false,
  neverSellEngravedPlacements: false, neverSellReappTargets: false };
const answers = new Map();
for (const quality of [1, 2, 3, 4, 5]) for (const power of [1, 2, 3, 4, 5]) {
  for (const accepted of [1, 2, 3, 4, 5]) for (const broken of [1, 2, 3, 4, 5]) {
    const stops = [quality, power, accepted, broken];
    const policy = { ...settings, ...Object.fromEntries(fields.map((field, index) => [field, stops[index]])) };
    const advice = await runeAdvice(runes, roles, policy, base, undefined, options);
    for (const [index, value] of stops.entries()) {
      if (value === 1) continue;
      const neighbor = stops.with(index, value - 1);
      const previous = answers.get(neighbor.join());
      for (const [id, row] of advice) {
        assert.ok(row.chance <= previous.get(id).chance);
        if (calculatedRuneVerdict(row) !== 'sell') assert.notEqual(calculatedRuneVerdict(previous.get(id)), 'sell');
      }
    }
    answers.set(stops.join(), advice);
  }
}
for (const rank of ['preferred', 'acceptable', 'broken']) {
  const shares = [1, 2, 3, 4, 5].map((intangibleRunes) => readingAllowance({ ...settings, intangibleRunes }, rank, true));
  assert.deepEqual(shares, shares.toSorted((a, b) => a - b));
}
const single = await runeAdvice(runes, [role], settings, base, undefined, options);
const combined = await runeAdvice(runes, roles, settings, base, undefined, options);
const duplicated = await runeAdvice(runes, [roles[1], role, { ...role, id: 'copy' }], settings, base, undefined, options);
for (const [id, row] of single) {
  assert.ok(combined.get(id).chance >= row.chance);
  assert.equal(combined.get(id).chance, duplicated.get(id).chance);
}
console.log('PASS: every adjacent stop of the 625-cell policy matrix narrows or preserves the same shared events.');
