/**
 * Current quality contract: genuine Max-value anchors, one drop-grade mix,
 * and the same rune body at every selling checkpoint. The complete-funnel
 * holdout and all 625 settings combinations live in verify-rune-slot-policy-matrix.
 */
import assert from 'node:assert/strict';
import { defaultRuneRoles, withRefreshedMetrics } from '../app/lib/rune-roles.ts';
import { defaultRunePotentialSettings } from '../app/lib/file-imports.ts';
import { ordinarySample } from '../app/lib/rune-cleanup-model.ts';
import { runeAdvice, qualityThresholds, slotFloorMaxValues } from '../app/lib/rune-cleanup-advice.ts';
import { slotMainProperties } from '../app/lib/rune-properties.ts';

/* This holds the quality gates themselves; the user's speed exception is checked separately. */
const qualitySettings = { ...defaultRunePotentialSettings, neverSellPreGrindSpeed: false };

const base = new Map([
  ['Attack type', { hp: 9708, atk: 808, def: 568, spd: 105, criRate: 18, criDmg: 50, res: 15, acc: 4 }],
  ['Support type', { hp: 10856, atk: 639, def: 648, spd: 104, criRate: 15, criDmg: 50, res: 18, acc: 3 }],
  ['Defence type', { hp: 10280, atk: 595, def: 749, spd: 103, criRate: 16, criDmg: 50, res: 17, acc: 5 }],
  ['HP type', { hp: 11836, atk: 653, def: 592, spd: 104, criRate: 16, criDmg: 50, res: 18, acc: 4 }],
]);
assert.deepEqual(qualityThresholds, [0.45, 0.55, 0.65, 0.75, 0.85]);
const roles = defaultRuneRoles();
const population = [];
for (const slot of [1, 2, 3, 4, 5, 6]) {
  const bodies = [0, 9, 12].map((level) => ordinarySample(slot, 6, 672, level, 'drop', 50_000));
  const counts = { Rare: 0, Hero: 0, Legend: 0 };
  for (let at = 0; at < bodies[0].length; at += 1) {
    const initial = bodies[0][at];
    counts[initial.defaultGrade] += 1;
    for (const checkpoint of bodies.slice(1)) {
      const rune = checkpoint[at];
      assert.equal(rune.mainStatId, initial.mainStatId);
      assert.equal(rune.defaultGrade, initial.defaultGrade);
      assert.equal(rune.setName, initial.setName);
      assert.equal(rune.prefixStatId, initial.prefixStatId);
      assert.equal(rune.prefixValue, initial.prefixValue);
      assert.ok(initial.subProperties.every((line, index) => rune.subProperties[index].statId === line.statId));
    }
  }
  assert.equal(counts.Legend, 168);
  assert.equal(counts.Hero, slot % 2 === 1 ? 504 : 336);
  assert.equal(counts.Rare, slot % 2 === 1 ? 0 : 168);
  const mainCounts = slotMainProperties[slot].map((main) => bodies[0].filter((rune) => rune.mainStatId === main).length);
  assert.equal(Math.max(...mainCounts), Math.min(...mainCounts));
  population.push(...bodies.flatMap((runes) => runes.slice(0, 24)));
}
for (let runeQuality = 1; runeQuality <= 5; runeQuality += 1) {
  const settings = { ...qualitySettings, runeQuality };
  const result = await runeAdvice(population, roles, settings, base);
  assert.equal(result.size, population.length);
  for (const row of result.values()) {
    if (!row.role) continue;
    assert.ok(row.floorMaxValue >= qualityThresholds[runeQuality - 1]);
    if (row.verdict !== 'sell') assert.ok(row.maxValue >= row.floorMaxValue);
  }
  console.log(`Quality ${runeQuality}: ${(100 * qualityThresholds[runeQuality - 1]).toFixed(0)} % minimum; slot floors`,
    slotFloorMaxValues(roles, settings, base).map((value) => (100 * value).toFixed(1)).join(' / '));
}
assert.equal((await runeAdvice([], roles, qualitySettings, base)).size, 0);
assert.ok([...(await runeAdvice(population, [], qualitySettings, base)).values()]
  .every((row) => row.verdict === 'sell' && row.role === null));
/* A slot unable to carry the only requested stat must stay unusable. Balancing
   never invents a useful property or rescues a zero-value rune. */
const defOnly = withRefreshedMetrics({ ...roles[0], id: 'def-only', name: 'DEF only',
  targets: { def: 3000 }, slots: {
    slot2: { preferred: ['Def%'], acceptable: [] }, slot4: { preferred: ['Def%'], acceptable: [] },
    slot6: { preferred: ['Def%'], acceptable: [] },
  } });
const barred = ordinarySample(1, 6, 24, 12, 'drop');
assert.ok([...(await runeAdvice(barred, [defOnly], { ...qualitySettings,
  gemRoll: null, grindstoneRoll: null }, base)).values()].every((row) => row.verdict === 'sell'));
/* A beginner's reference is evidence about the common scale, not a separate
   scoring path. Finished Hero and Rare runes must remain usable at the first stop. */
const beginnerBase = new Map([...base,
  ['No type', { hp: 10404, atk: 720, def: 608, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }],
]);
const beginnerRunes = [5, 6].flatMap((stars) => [1, 2, 3, 4, 5, 6]
  .flatMap((slot) => ordinarySample(slot, stars, 672, 12, 'drop', 900_000)));
const beginner = await runeAdvice(beginnerRunes, roles,
  { ...qualitySettings, runeQuality: 1 }, beginnerBase);
const nextStop = await runeAdvice(beginnerRunes, roles,
  { ...qualitySettings, runeQuality: 2 }, beginnerBase);
for (const stars of [5, 6]) for (const grade of ['Rare', 'Hero']) {
  const group = beginnerRunes.filter((rune) => rune.stars === stars && rune.defaultGrade === grade);
  const kept = group.filter((rune) => beginner.get(rune.id)?.verdict === 'keep').length;
  assert.ok(kept > 0, `${stars}-star ${grade} runes must have viable beginner keepers.`);
  console.log(`Beginner ${stars}-star ${grade}: ${kept} / ${group.length} finished runes kept.`);
}
for (const rune of beginnerRunes) if (nextStop.get(rune.id)?.verdict === 'keep') {
  assert.equal(beginner.get(rune.id)?.verdict, 'keep', 'The second quality stop must not re-admit a beginner Sell.');
}
console.log('PASS: real quality anchors, uniform mains, mixed grades, checkpoint identity and empty inputs.');
