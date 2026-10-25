/**
 * A Gem that keeps a line's property keeps its Grindstone (`RUNE-CANONICAL.md` §8).
 *
 * The rule is written in four places that build a gemmed line — the Clean-up end
 * state, the optimizer's variants, the Gems & Grinds planner and the shader — and
 * the calibration check only ever built runes that were gemmed *or* ground. This
 * holds the case the player meets: a line already gemmed and ground, re-gemmed to
 * the same property, with no stone credited, so the kept stone can only have come
 * from the line itself.
 */
import assert from 'node:assert/strict';
import { assumedCraftHalf, heldCraftHalf, craftedLines, craftedScore, craftPlan, craftVariants, gemOptions, priceList }
  from '../app/lib/rune-craft-end-state.ts';
import { craftValueRange } from '../app/lib/rune-craft-items.ts';
import { craftItemApplications, craftItemFit } from '../app/lib/rune-craft-end-state.ts';
const craftCandidate = (item, rune, options) => craftItemApplications(item, rune, options)[0] ?? null;

const ATK_PERCENT = 4;
const HP_PERCENT = 2;
const SPD = 8;
const credit = { gem: 'maximum', gemGrade: 'Hero', grind: null, grindGrade: 'Hero' };
const gemRoll = craftValueRange('gem', 'standard', ATK_PERCENT, 'Hero').maximum;
const stone = 7;

const line = (statId, value, gemmed = false, grind = 0) => ({ statId, value, gemmed, grind });
const rune = (subProperties) => ({
  id: 'regem', setId: 13, setName: 'Violent', slot: 1, stars: 6, ancient: false, rarity: 'Legend',
  level: 12, mainStatId: 3, mainValue: 0, prefixStatId: null, prefixValue: 0, subProperties,
  occupiedId: null, obtainedOrder: 0,
});
const plan = craftPlan('standard', credit);
const valuing = (wanted) => ({ value: (statId, amount) => (statId === wanted ? amount : 0) });

let checks = 0;
for (const [label, first] of [
  ['gemmed and ground', line(ATK_PERCENT, 8, true, stone)],
  ['rolled and ground', line(ATK_PERCENT, 6, false, stone)],
]) {
  const lines = [first, line(HP_PERCENT, 10), line(9, 5), line(12, 4)];
  const prices = priceList(valuing(ATK_PERCENT));
  const options = gemOptions(plan, prices, 1, 3, null);

  const ended = craftedLines(plan, options, prices, lines, 0);
  assert.deepEqual(ended[0], line(ATK_PERCENT, gemRoll, true, stone), `${label}: Clean-up dropped the stone`);
  assert.equal(craftedScore(plan, options, prices, lines, 0), gemRoll + stone + 0, `${label}: Clean-up priced the line bare`);

  const variant = craftVariants({ gem: assumedCraftHalf('gem', 'standard', 'Hero', 'maximum'), grind: null },
    1, 3, null, lines, true, (statId) => statId === ATK_PERCENT, false)
    .find((each) => each.gemmedAt === 0 && each.lines[0].statId === ATK_PERCENT);
  assert.ok(variant, `${label}: the optimizer offered no same-property Gem`);
  assert.equal(variant.lines[0].grind, stone, `${label}: the optimizer dropped the stone`);

  const item = { id: 'gem', kind: 'gem', lineage: 'standard', setId: 13, setName: 'Violent', statId: ATK_PERCENT,
    statName: 'ATK %', grade: 'Hero', amount: 1, range: craftValueRange('gem', 'standard', ATK_PERCENT, 'Hero') };
  const candidate = craftCandidate(item, rune(lines), { grindAfter: null, roll: 'maximum' });
  assert.equal(candidate.target.index, 0);
  assert.deepEqual(candidate.result, line(ATK_PERCENT, gemRoll, true, stone), `${label}: Gems & Grinds dropped the stone`);
  checks += 3;
}

/* A Gem that changes the property starts the line bare: the stone belonged to ATK %. */
{
  const lines = [line(ATK_PERCENT, 8, true, stone), line(HP_PERCENT, 10), line(9, 5), line(12, 4)];
  const prices = priceList(valuing(SPD));
  const ended = craftedLines(plan, gemOptions(plan, prices, 1, 3, null), prices, lines, 0);
  assert.equal(ended[0].statId, SPD);
  assert.equal(ended[0].grind, 0, 'a Gem changing the property kept the old stone');
  checks += 1;
}

/* One converted line at a time: a rune carrying one offers that line alone. */
{
  const gemmedRune = rune([line(ATK_PERCENT, 8, true, stone), line(HP_PERCENT, 10), line(9, 5), line(12, 4)]);
  const spd = { id: 'spd', kind: 'gem', lineage: 'standard', setId: 13, setName: 'Violent', statId: SPD,
    statName: 'SPD', grade: 'Hero', amount: 1, range: craftValueRange('gem', 'standard', SPD, 'Hero') };
  const fit = craftItemFit(spd, gemmedRune);
  assert.ok(fit.fits);
  assert.deepEqual(fit.targets.map((target) => target.index), [0], 'a second line was offered to a Gem');
  const hp = { ...spd, id: 'hp', statId: HP_PERCENT, statName: 'HP %',
    range: craftValueRange('gem', 'standard', HP_PERCENT, 'Hero') };
  assert.deepEqual(craftItemFit(hp, gemmedRune), { fits: false, block: 'duplicate' });
  checks += 1;
}

/* The base-value constraint holds even when a ceiling makes less SPD desirable.
   Natural SPD 10 and gemmed SPD 10 both refuse Hero SPD 8, with or without a
   stone. Held stock and theoretical assumptions answer the same game question. */
for (const gemmed of [false, true]) for (const grind of [0, 5]) {
  for (const value of [7, 8, 10]) {
    const lines = [line(SPD, value, gemmed, grind), line(HP_PERCENT, 8), line(9, 6), line(12, 8)];
    const item = { id: 'hero-speed', kind: 'gem', lineage: 'standard', setId: 13, setName: 'Violent',
      statId: SPD, statName: 'SPD', grade: 'Hero', amount: 1,
      range: craftValueRange('gem', 'standard', SPD, 'Hero') };
    for (const roll of ['minimum', 'average', 'maximum']) {
      const supplies = [assumedCraftHalf('gem', 'standard', 'Hero', roll),
        heldCraftHalf('gem', [{ item, stock: 0 }], roll)];
      for (const gem of supplies) for (const ceiling of [false, true]) {
        const variants = craftVariants({ gem, grind: null }, 1, 3, null, lines, true,
          (statId) => statId === SPD, false, () => ceiling);
        assert.ok(variants.some((variant) => variant.gemmedAt === -1), 'no Gem must remain an option');
        for (const variant of variants) {
          if (variant.gemmedAt !== 0 || variant.lines[0].statId !== SPD) continue;
          assert.ok(variant.lines[0].value > value, 'same-stat Gems must strictly raise the base value');
          assert.equal(variant.lines[0].grind, grind, 'the existing stone must survive');
        }
        checks += 1;
      }
      const candidate = craftCandidate(item, rune(lines), { grindAfter: null, roll });
      if (candidate) assert.ok(candidate.result.value > value, 'the craft planner offered a non-improving same-stat Gem');
      const prices = priceList(valuing(SPD));
      const localPlan = craftPlan('standard', { ...credit, gem: roll });
      const ended = craftedLines(localPlan, gemOptions(localPlan, prices, 1, 3, null), prices, lines, 0);
      assert.ok(ended[0].value >= value, 'Clean-up lowered a same-stat base value');
      assert.equal(ended[0].grind, grind);
      checks += 2;
    }
  }
}
assert.deepEqual(craftVariants({ gem: null, grind: null }, 1, 3, null, [], true, () => true, false),
  [{ lines: [], gemmedAt: -1, stock: [] }], 'an empty rune and supply must remain unchanged');

console.log(`PASS: ${checks} checks — natural and converted lines only accept a higher same-stat Gem base value; ceilings cannot override it; existing stones survive.`);
