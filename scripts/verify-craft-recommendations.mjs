import assert from 'node:assert/strict';
import { readCraftItem, missingCraftItems, missingCraftGrades, missingCraftLineages } from '../app/lib/rune-craft-items.ts';
import { craftItemApplications, craftVariants, heldCraftHalf, lineageFits, craftedScore } from '../app/lib/rune-craft-end-state.ts';
import { defaultRuneRoles, createRuneRole } from '../app/lib/rune-roles.ts';
import { defaultRunePotentialSettings } from '../app/lib/file-imports.ts';
import { acceptedWorth, brokenWorth } from '../app/lib/rune-cleanup-advice.ts';
import { ordinarySample, prepareRuneCandidate, roleBuilds, newRuneAdviceScope, neutralComparisonCredit } from '../app/lib/rune-cleanup-model.ts';
import { recommendRuneCraft, craftRecommendationRankings, craftStatAlreadyChanged, heldCraftBenchmark, isHeldCraft,
  wantedCraftItems, craftItemKey, reconcileCraftCalculation, extendCraftCalculation } from '../app/lib/rune-craft-recommendations.ts';
import { craftScoreLayout as L } from '../app/lib/compute/webgpu/craft-score-layout.ts';
import { readFileSync } from 'node:fs';

const source = readFileSync('app/lib/compute/craft-score-engine.ts', 'utf8');
assert.equal(L.prices, L.values + L.stats);
assert.equal(L.cap, L.prices + L.stats);
assert.equal(L.discount + 1, L.stride);
for (const key of ['stats', 'values', 'prices', 'cap', 'discount', 'stride', 'workgroup']) {
  assert.ok(source.includes(`\${L.${key}}`), `shader no longer reads the shared ${key}`);
}
const base = new Map(['Attack type', 'Support type', 'Defence type', 'HP type', 'No type'].map((type) =>
  [type, { hp: 11000, atk: 700, def: 650, spd: 104, criRate: 15, criDmg: 50, res: 15, acc: 0 }]));
const roles = defaultRuneRoles();
const settings = defaultRunePotentialSettings;
const runes = [1, 2, 3, 4, 5, 6].flatMap((slot) => [0, 9, 12, 15].flatMap((level) =>
  ordinarySample(slot, 6, 2, level).map((rune, at) => ({ ...rune, id: `${slot}:${level}:${at}`,
    setId: 13, setName: 'Violent', ancient: at === 1 }))));
let id = 0;
const items = [1, 2, 5, 6].flatMap((type) => [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]
  .filter((stat) => type % 2 || stat <= 8).map((stat) => readCraftItem({
    craft_item_id: ++id, craft_type: type, craft_type_id: 130000 + stat * 100 + (type >= 5 ? 15 : 5), amount: 1,
  })));
const noCraft = { gem: null, grind: null, gemGrade: 'Hero', grindGrade: 'Hero' };
const marked = { subProperties: [{ statId: 8, value: 5, grind: 3, gemmed: true }, { statId: 2, value: 8, grind: 0, gemmed: false }] };
for (const kind of ['gem', 'grindstone']) {
  assert.equal(craftStatAlreadyChanged(marked, { kind, statId: 8 }), true);
  assert.equal(craftStatAlreadyChanged(marked, { kind, statId: 2 }), false);
  assert.equal(craftStatAlreadyChanged(marked, { kind, statId: 4 }), false, 'another stat\'s marker must not match');
  assert.equal(craftStatAlreadyChanged({ subProperties: [] }, { kind, statId: 8 }), false);
}
const scope = newRuneAdviceScope();
const families = roles.map((role) => ({ role, builds: roleBuilds(role) }));
function evaluate(rune) {
  let best = null;
  for (const { role, builds } of families) for (const build of builds) {
    const candidate = prepareRuneCandidate(rune, role, build, base.get(role.type), noCraft, neutralComparisonCredit, scope);
    if (!candidate) continue;
    const discount = candidate.rank === 'preferred' ? 1 : candidate.rank === 'acceptable'
      ? acceptedWorth[settings.acceptedRunes - 1] : brokenWorth[settings.brokenRunes - 1];
    if (discount === 0) continue;
    const { plan, options, prices, prefixScore } = candidate.scoring;
    const raw = craftedScore(plan, options, prices, rune.subProperties, prefixScore) / candidate.ceiling * 100;
    const score = Math.min(rune.ancient ? Infinity : 100, raw) * discount;
    if (!best || score > best.score) best = { score, role: role.name, rank: candidate.rank };
  }
  return best;
}
const tie = (a, b) => a.rune.id.localeCompare(b.rune.id) || a.item.id.localeCompare(b.item.id)
  || a.application.target.index - b.application.target.index;
function rank(rows, metric, count) {
  const seen = new Set();
  return [...rows].sort((a, b) => metric(b) - metric(a) || tie(a, b)).filter((row) => {
    if (seen.has(row.rune.id)) return false; seen.add(row.rune.id); return true;
  }).slice(0, count);
}
function compare(actual, expected) {
  assert.deepEqual(actual.map((row) => [row.rune.id, row.item.id, row.application.target.index]),
    expected.map((row) => [row.rune.id, row.item.id, row.application.target.index]));
  actual.forEach((row, index) => {
    for (const field of ['before', 'after']) assert.ok(Math.abs(row[field].score - expected[index][field].score) < 1e-10);
    assert.ok(row.item.kind === 'grindstone' || row.rune.level >= 12);
  });
}
let comparisons = 0;
for (const kind of ['gem', 'grindstone']) for (const grindAfter of [null, { grade: 'Legend' }]) {
  const request = { runes, items: items.filter((item) => item.kind === kind), missing: [], roles, settings, base,
    roll: 'two-thirds', grindAfter, preferGpu: false };
  const calculation = await recommendRuneCraft(request);
  const actual = { ...craftRecommendationRankings(calculation.candidates, 10), backend: calculation.backend, comparisons: calculation.comparisons };
  const rows = [];
  for (const rune of runes) {
    const before = evaluate(rune);
    if (!before) continue;
    for (const item of request.items.filter((item) => lineageFits(item, rune))) {
      const applications = craftItemApplications(item, rune, request);
      if (!grindAfter) {
        const half = heldCraftHalf(kind, [{ item, stock: 0 }], request.roll);
        const variants = craftVariants({ gem: kind === 'gem' ? half : null, grind: kind === 'grindstone' ? half : null },
          rune.slot, rune.mainStatId, rune.prefixStatId, rune.subProperties, rune.level >= 12, () => true, true)
          .filter((variant) => variant.stock.includes(0));
        assert.deepEqual(applications.map((app) => app.lines), variants.map((variant) => variant.lines));
      }
      for (const application of applications) {
        const after = evaluate({ ...rune, subProperties: application.lines });
        if (!after) continue;
        rows.push({ rune, item, application, before, after, gain: after.score - before.score,
          stat: application.result.value + application.result.grind });
      }
    }
  }
  const positive = rows.filter((row) => row.gain > 1e-10);
  compare(actual.highestScore, rank(positive, (row) => row.after.score, 10));
  compare(actual.highestGain, rank(positive, (row) => row.gain, 10));
  for (const [stat, ranked] of actual.highestStat) {
    compare(ranked, rank(rows.filter((row) => row.item.statId === stat), (row) => row.stat, 10));
    assert.ok(ranked.every((row) => row.item.statId === stat));
  }
  // A filter may need pairs below the original shortlist. It must never ask the engine again.
  for (const count of [1, 5, 10]) {
    const included = new Set(runes.slice(-12).map((rune) => rune.id));
    const cached = calculation.candidates.filter((row) => included.has(row.rune.id));
    const projected = craftRecommendationRankings(cached, count);
    const reference = rows.filter((row) => included.has(row.rune.id) && row.gain > 1e-10);
    compare(projected.highestScore, rank(reference, (row) => row.after.score, count));
    compare(projected.highestGain, rank(reference, (row) => row.gain, count));
  }
  assert.equal(actual.backend, 'cpu');
  comparisons += actual.comparisons;
}
const emptyRequest = { runes: [], items: [], missing: [], roles: [], settings, base, roll: 'maximum', grindAfter: null, preferGpu: false };
assert.equal((await recommendRuneCraft(emptyRequest)).candidates.length, 0);
assert.equal((await recommendRuneCraft({ ...emptyRequest, runes, items })).candidates.length, 0);
const nonImproving = { ...runes[0], subProperties: [{ statId: 8, value: 30, grind: 5, gemmed: false }] };
assert.equal(craftItemApplications(items.find((item) => item.kind === 'grindstone' && item.statId === 8 && item.lineage === 'standard'),
  nonImproving, emptyRequest).length, 0);
// Stat ranks must not accidentally become a third score ranking.
const hpRole = { ...createRuneRole('HP and SPD'), targets: { hp: 50000, spd: 180 },
  sets: { preferred: ['Violent'], acceptable: [] } };
const template = runes.find((rune) => !rune.ancient && rune.slot === 1 && rune.level === 15);
const statRunes = [
  { ...template, id: 'high-hp', subProperties: [{ statId: 2, value: 35, grind: 0, gemmed: false }, { statId: 8, value: 10, grind: 0, gemmed: false }] },
  { ...template, id: 'high-spd', subProperties: [{ statId: 2, value: 5, grind: 0, gemmed: false }, { statId: 8, value: 30, grind: 0, gemmed: false }] },
];
const speedStone = items.find((item) => item.kind === 'grindstone' && item.statId === 8 && item.lineage === 'standard');
const statCalculation = await recommendRuneCraft({ ...emptyRequest, runes: statRunes, items: [speedStone], roles: [hpRole] });
const specificStat = craftRecommendationRankings(statCalculation.candidates, 5);
assert.equal(specificStat.highestScore[0].rune.id, 'high-hp');
assert.equal(specificStat.highestStat.get(8)[0].rune.id, 'high-spd');
assert.equal(specificStat.highestStat.get(8)[0].stat, 35);
// What's missing: the catalogue, its held cover, and the bar a missing item must clear.
const heldSpeedStone = items.find((item) => item.kind === 'grindstone' && item.statId === 8 && item.lineage === 'standard');
const heldImmemorialGem = readCraftItem({ craft_item_id: 9901, craft_type: 3, craft_type_id: 990805, amount: 1 });
const box = [heldSpeedStone, heldImmemorialGem];
const missing = missingCraftItems(box, runes);
const has = (kind, lineage, statId, grade) => missing.some((item) => item.kind === kind && item.lineage === lineage
  && item.statId === statId && item.grade === grade && item.setId === 13);
assert.ok(missing.length > 0 && missing.every((item) => item.amount === 0 && item.range && item.setId === 13));
assert.ok(missing.every((item) => missingCraftGrades.includes(item.grade) && missingCraftLineages.includes(item.lineage)));
assert.equal(has('grindstone', 'standard', 8, heldSpeedStone.grade), false, 'a held stone is not missing');
assert.equal(has('gem', 'standard', 8, 'Legend'), false, 'a held Immemorial gem covers the set\'s own gem');
assert.equal(has('gem', 'ancient', 8, 'Legend'), true, 'an Immemorial gem never covers an Ancient rune');
assert.equal(has('grindstone', 'standard', 9, 'Legend'), false, 'no CRI Rate stone exists');
assert.equal(missingCraftItems(box, []).length, 0, 'no runes, nothing to chase');
const started = performance.now();
const whole = await recommendRuneCraft({ ...emptyRequest, runes, items: box, missing, roles, roll: 'two-thirds' });
const missingMs = performance.now() - started;
const heldOnly = await recommendRuneCraft({ ...emptyRequest, runes, items: box, roles, roll: 'two-thirds' });
const reading = (rows) => JSON.stringify(rows.map((row) => [row.rune.id, row.item.id, row.after.score]));
assert.equal(reading(whole.candidates.filter(isHeldCraft)), reading(heldOnly.candidates), 'asking about missing items moved a held answer');
const benchmark = heldCraftBenchmark(whole.candidates);
const wanting = whole.candidates.filter((row) => !isHeldCraft(row));
for (const kind of ['gem', 'grindstone']) {
  const own = wanting.filter((row) => row.item.kind === kind);
  const ranked = craftRecommendationRankings(own, 10, benchmark);
  for (const row of [...ranked.highestScore, ...ranked.highestGain]) {
    const box = Math.max(row.before.score, ...heldOnly.candidates
      .filter((held) => held.rune.id === row.rune.id && held.item.kind === kind).map((held) => held.after.score));
    assert.ok(row.after.score > box, 'a missing item listed without beating the box');
    assert.equal(benchmark.score(row), box);
  }
  const wanted = wantedCraftItems(own, 50, benchmark);
  assert.ok(ranked.highestScore.length > 0 && wanted.length > 0, `${kind}: nothing missing was found to beat the box`);
  assert.ok(wanted.every((entry, at) => at === 0 || wanted[at - 1].runes >= entry.runes));
  assert.equal(wanted.reduce((total, entry) => total + entry.runes, 0),
    new Set(own.filter((row) => row.after.score > benchmark.score(row)).map((row) => row.rune.id)).size,
    'every improvable rune names exactly one wanted item');
}
assert.deepEqual(wantedCraftItems([], 5, benchmark), []);

/* A changed box is answered from what is already known: a stack gone takes its
   rows, a stack spent down keeps its rows under its new size, and an item new to
   the box is judged alone — and the result is exactly a fresh calculation's. */
const sorted = (rows) => JSON.stringify(rows.map((row) => [row.rune.id, row.item.id, row.item.amount, row.after.score, row.stat]).sort());
const firstBox = items.slice(0, 20);
const firstAnswer = await recommendRuneCraft({ ...emptyRequest, runes, items: firstBox, roles, roll: 'two-thirds' });
const remembered = { key: 'context', items: firstBox.map(craftItemKey), result: firstAnswer };
const spent = firstBox.slice(2).find((item) => firstAnswer.candidates.some((row) => row.item === item));
assert.ok(spent, 'the first box judged nothing to spend down');
const secondBox = [...firstBox.slice(2).map((item) => item === spent ? { ...item, amount: 7 } : item), ...items.slice(20, 26)];
const reconciled = reconcileCraftCalculation(remembered, secondBox);
assert.deepEqual(reconciled.added.map((item) => item.id), items.slice(20, 26).map((item) => item.id), 'only the new stacks are asked about');
const extension = await recommendRuneCraft({ ...emptyRequest, runes, items: reconciled.added, roles, roll: 'two-thirds' });
const extended = reconcileCraftCalculation(extendCraftCalculation(remembered, extension, reconciled.added), secondBox);
assert.equal(extended.added.length, 0, 'an extended answer has judged the whole box');
const fresh = await recommendRuneCraft({ ...emptyRequest, runes, items: secondBox, roles, roll: 'two-thirds' });
assert.equal(sorted(extended.result.candidates), sorted(fresh.candidates), 'an extended answer differs from a fresh one');
assert.ok(extended.result.candidates.some((row) => row.item.amount === 7), 'a spent-down stack keeps its rows under its new size');
assert.ok(!extended.result.candidates.some((row) => firstBox.slice(0, 2).includes(row.item)), 'a stack gone left a row behind');
console.log(`PASS: What's missing judged ${missing.length} absent items on ${runes.length} runes in ${Math.round(missingMs)} ms without moving a held answer.`);
console.log(`PASS: ${comparisons.toLocaleString('en-US')} craft/build comparisons agree with exhaustive role readings; every optimizer variant, stat-specific ranking and empty case holds.`);
