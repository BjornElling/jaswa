/**
 * Future craft must be priced before a rune reveals its fourth line.
 * One-stat fixtures make the Gem guarantee and conditional Grindstone gain
 * hand-calculable, independently of the future sampler.
 */
import assert from 'node:assert/strict';
import { prepareRuneCandidate, roleBuilds, candidateMaxValue, candidateChance,
  candidateExpectedValue, runeRuns } from '../app/domain/runes/cleanup/rune-cleanup-model.ts';
import { playForward, runScore } from '../app/domain/runes/rune-power-up-outcomes.ts';
import { craftItemRoll } from '../app/domain/runes/craft/rune-craft-end-state.ts';
import { initialSubPropertyRange } from '../app/domain/runes/rune-properties.ts';

const role = { id: 'future-craft', name: 'Future craft', type: 'Support type',
  sets: { preferred: ['Violent'], acceptable: [] },
  slots: { slot2: { preferred: [], acceptable: [] }, slot4: { preferred: [], acceptable: [] },
    slot6: { preferred: [], acceptable: [] } },
  targets: { spd: 200 }, artifacts: { hp: false, atk: false, def: false } };
const base = { hp: 10000, atk: 600, def: 600, spd: 100, criRate: 15, criDmg: 50, res: 15, acc: 0 };
const build = roleBuilds(role)[0];
const neutral = { gem: 'three-quarters', gemGrade: 'Hero', grind: 'three-quarters', grindGrade: 'Hero' };
const credits = {
  neither: { ...neutral, gem: null, grind: null },
  grind: { ...neutral, gem: null, grind: 'maximum' },
  gem: { ...neutral, gem: 'maximum', grind: null },
  both: { ...neutral, gem: 'maximum', grind: 'maximum' },
};
const gem = craftItemRoll('gem', 'standard', 8, 'Hero', 'maximum');
const grind = craftItemRoll('grindstone', 'standard', 8, 'Hero', 'maximum');
assert.ok(gem >= initialSubPropertyRange(6, 8, false).maximum);
assert.ok(grind > 0);
const expected = (candidate) => candidateExpectedValue(candidate, () => runeRuns(candidate.future));
const line = (statId, value = 4) => ({ statId, value, gemmed: false, grind: 0 });
function fixture(grade, level) {
  const count = level >= 12 || grade === 'Legend' ? 4 : grade === 'Hero' || level >= 9 ? 3 : 2;
  return { id: `${grade}:${level}`, setId: 13, setName: 'Violent', slot: 5, stars: 6,
    ancient: false, rarity: grade, level, mainStatId: 1, mainValue: 0,
    prefixStatId: null, prefixValue: 0, subProperties: [9, 10, 11, 12].slice(0, count).map((id) => line(id)),
    occupiedId: null, obtainedOrder: 0 };
}
let checks = 0;
for (const grade of ['Rare', 'Hero', 'Legend']) {
  for (const level of [0, 9, 12]) {
    const rune = fixture(grade, level);
    const candidates = Object.fromEntries(Object.entries(credits).map(([key, credit]) => {
      const candidate = prepareRuneCandidate(rune, role, build, base, credit);
      assert.ok(candidate);
      return [key, candidate];
    }));
    const price = candidates.both.scoring.prices[8];
    /* Every starting line is unwanted. Any future SPD reveal is smaller than the
       credited Gem, so each finished outcome can legally carry that same SPD Gem. */
    for (const key of ['gem', 'both']) {
      const candidate = candidates[key];
      const score = (gem + (key === 'both' ? grind : 0)) * price;
      assert.ok(Math.abs(candidate.best - score) < 1e-12, `${grade} +${level}: future Gem absent from Max`);
      const runs = playForward(candidate.future, 512);
      for (let at = 0; at < runs.count; at += 1) {
        assert.ok(Math.abs(runScore(runs, candidate.scoring, at) - score) < 1e-12,
          `${grade} +${level}: completed outcome missed its Gem or Grindstone`);
      }
      assert.equal(candidateChance(candidate, 0.99 * score / candidate.ceiling), 1,
        `${grade} +${level}: guaranteed future craft was treated as a gamble`);
      assert.ok(Math.abs(candidateMaxValue(candidate) - score / candidate.ceiling) < 1e-12);
    }
    /* Before the reveal, SPD is one legal id among the pool, selected without
       replacement. Only that event earns the SPD Grindstone, not every hidden line. */
    const plain = candidates.neither;
    const stoned = candidates.grind;
    const probability = plain.future.pool.includes(8) ? plain.future.additions / plain.future.pool.length : 0;
    const actual = expected(stoned) - expected(plain);
    const wanted = probability * grind * price / plain.ceiling;
    assert.ok(Math.abs(actual - wanted) < 1e-12,
      `${grade} +${level}: future Grindstone expected gain ${actual}, expected ${wanted}`);
    console.log(`${grade} +${level}: Gem and ground Gem guaranteed; hidden-SPD probability ${(100 * probability).toFixed(1)} %; future Grindstone gain ${(100 * actual).toFixed(3)} Max points.`);
    checks += 1;
  }
}
/* No extra Gem gain is guaranteed where the rune already exceeds that Gem.
   A blanket bonus would overvalue this finished rune and count craft twice. */
const strong = { ...fixture('Legend', 12), subProperties: [line(8, 24), line(9), line(10), line(11)] };
const bare = prepareRuneCandidate(strong, role, build, base, credits.neither);
const gemmed = prepareRuneCandidate(strong, role, build, base, credits.gem);
assert.equal(gemmed.best, bare.best);
assert.equal(candidateMaxValue(gemmed), candidateMaxValue(bare));
console.log(`PASS: ${checks} grade/checkpoint fixtures include future craft, with no unconditional or double Gem bonus.`);
