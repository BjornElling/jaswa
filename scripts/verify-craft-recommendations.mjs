import assert from 'node:assert/strict';
import { readCraftItem } from '../app/lib/rune-craft-items.ts';
import { craftItemApplications, craftVariants, heldCraftHalf, lineageFits, craftedScore } from '../app/lib/rune-craft-end-state.ts';
import { defaultRuneRoles, createRuneRole } from '../app/lib/rune-roles.ts';
import { defaultRunePotentialSettings } from '../app/lib/file-imports.ts';
import { acceptedWorth, brokenWorth } from '../app/lib/rune-cleanup-advice.ts';
import { ordinarySample, prepareRuneCandidate, roleBuilds, newRuneAdviceScope, neutralComparisonCredit } from '../app/lib/rune-cleanup-model.ts';
import { recommendRuneCraft, craftRecommendationRankings, craftStatAlreadyChanged } from '../app/lib/rune-craft-recommendations.ts';
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
  const request = { runes, items: items.filter((item) => item.kind === kind), roles, settings, base,
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
const emptyRequest = { runes: [], items: [], roles: [], settings, base, roll: 'maximum', grindAfter: null, preferGpu: false };
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
console.log(`PASS: ${comparisons.toLocaleString('en-US')} craft/build comparisons agree with exhaustive role readings; every optimizer variant, stat-specific ranking and empty case holds.`);
