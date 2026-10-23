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
import { assumedCraftHalf, craftedLines, craftedScore, craftPlan, craftVariants, gemOptions, priceList }
  from '../app/lib/rune-craft-end-state.ts';
import { craftValueRange } from '../app/lib/rune-craft-items.ts';
import { craftCandidate, craftItemFit } from '../app/lib/rune-craft-plan.ts';

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

console.log(`PASS: ${checks} checks — a same-property Gem keeps the line's stone in Clean-up, Rune Optimization and Gems & Grinds; a property change starts bare; a converted rune offers only its converted line.`);
