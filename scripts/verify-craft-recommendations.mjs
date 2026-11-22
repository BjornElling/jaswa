import assert from 'node:assert/strict';
import { readCraftItem, missingCraftItems, missingCraftGrades, missingCraftLineages } from '../app/domain/runes/craft/rune-craft-items.ts';
import { craftComparison, craftVariants, heldCraftHalf, lineageFits, craftedScore, craftPlan, noCraftCredit,
  gemOptions } from '../app/domain/runes/craft/rune-craft-end-state.ts';
import { defaultRuneRoles, createRuneRole } from '../app/domain/profiles/rune-roles.ts';
import { defaultRunePotentialSettings } from '../app/domain/profiles/preference-defaults.ts';
import { runeRankWorth } from '../app/domain/runes/cleanup/rune-cleanup-advice.ts';
import { ordinarySample, prepareRuneCandidate, roleBuilds, newRuneAdviceScope } from '../app/domain/runes/cleanup/rune-cleanup-model.ts';
import { recommendRuneCraft as recommendWith, craftRecommendationRankings, craftMatchesChangeFilter, heldCraftBenchmark, isHeldCraft,
  wantedCraftItems, craftItemKey, craftRuneKey, reconcileCraftCalculation, craftExtensionRequests, extendCraftCalculation,
  desirableGemStats, onDesirableGemStat } from '../app/domain/runes/craft-advice/rune-craft-recommendations.ts';
import { craftScoreLayout as L } from '../app/domain/runes/craft-advice/craft-score-layout.ts';
import { craftScore } from '../app/domain/runes/craft-advice/craft-score.ts';
import { readFileSync } from 'node:fs';

const source = readFileSync('app/platform/compute/craft-score-engine.ts', 'utf8');
/* The processor reference, which is what every answer below is held to. */
const recommendRuneCraft = (request, progress) => recommendWith(request,
  async (jobs) => ({ result: Float64Array.from(jobs, craftScore), backend: 'cpu' }), progress);
assert.equal(L.prices, L.values + L.stats);
assert.equal(L.discount, L.prices + L.stats);
assert.equal(L.discount + 1, L.stride);
assert.ok(!('cap' in L) && !source.includes('min('), 'a craft score must never be capped');
for (const key of ['stats', 'values', 'prices', 'discount', 'stride', 'workgroup']) {
  assert.ok(source.includes(`\${L.${key}}`), `shader no longer reads the shared ${key}`);
}
const base = new Map(['Attack type', 'Support type', 'Defence type', 'HP type', 'No type'].map((type) =>
  [type, { hp: 11000, atk: 700, def: 650, spd: 104, criRate: 15, criDmg: 50, res: 15, acc: 0 }]));
const roles = defaultRuneRoles();
const settings = defaultRunePotentialSettings;
const credit = settings.craftCredit;
const runes = [1, 2, 3, 4, 5, 6].flatMap((slot) => [0, 9, 12, 15].flatMap((level) =>
  ordinarySample(slot, 6, 2, level).map((rune, at) => ({ ...rune, id: `${slot}:${level}:${at}`,
    setId: 13, setName: 'Violent', ancient: at === 1 }))));
let id = 0;
const items = [1, 2, 5, 6].flatMap((type) => [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]
  .filter((stat) => type % 2 || stat <= 8).map((stat) => readCraftItem({
    craft_item_id: ++id, craft_type: type, craft_type_id: 130000 + stat * 100 + (type >= 5 ? 15 : 5), amount: 1,
  })));
const noCraft = noCraftCredit;
const marked = { subProperties: [{ statId: 8, value: 5, grind: 3, gemmed: true }, { statId: 2, value: 8, grind: 0, gemmed: false }] };
for (const gemChange of ['yes', 'no']) {
  const choice = { grinded: [], gemChange };
  assert.equal(craftMatchesChangeFilter(marked, { kind: 'gem', statId: 8 }, choice), true,
    'keeping a converted stat permits a better same-stat Gem');
  assert.equal(craftMatchesChangeFilter(marked, { kind: 'gem', statId: 4 }, choice), gemChange === 'yes',
    'only No forbids replacing the converted stat');
  assert.equal(craftMatchesChangeFilter({ subProperties: [] }, { kind: 'gem', statId: 8 }, choice), true,
    'the first Gem has no converted stat to protect');
}
for (const grinded of [[], ['yes'], ['no'], ['yes', 'no']]) {
  const choice = { grinded, gemChange: 'no' };
  assert.equal(craftMatchesChangeFilter(marked, { kind: 'grindstone', statId: 8 }, choice), grinded.length !== 1 || grinded[0] === 'yes');
  assert.equal(craftMatchesChangeFilter(marked, { kind: 'grindstone', statId: 2 }, choice), grinded.length !== 1 || grinded[0] === 'no');
}
const scope = newRuneAdviceScope(credit);
const families = roles.map((role) => ({ role, builds: roleBuilds(role) }));
function evaluate(rune) {
  let best = null;
  for (const { role, builds } of families) for (const build of builds) {
    const candidate = prepareRuneCandidate(rune, role, build, base.get(role.type), noCraft, scope);
    if (!candidate) continue;
    const discount = runeRankWorth(settings, candidate.rank);
    if (discount === 0) continue;
    const { plan, options, prices, prefixScore } = candidate.scoring;
    const raw = craftedScore(plan, options, prices, rune.subProperties, prefixScore) / candidate.ceiling * 100;
    const score = raw * discount;
    if (!best || score > best.score) best = { score, role: role.name, rank: candidate.rank };
  }
  return best;
}
const tie = (a, b) => a.rune.id.localeCompare(b.rune.id) || a.item.id.localeCompare(b.item.id)
  || a.application.target.index - b.application.target.index;
/* The engine and this oracle price a rune in different orders of arithmetic, so two
   runes worth the same can differ in the last bit; within a billionth they are a tie. */
function rank(rows, metric, count) {
  const seen = new Set();
  return [...rows].sort((a, b) => {
    const difference = metric(b) - metric(a);
    return Math.abs(difference) > 1e-9 ? difference : tie(a, b);
  }).filter((row) => {
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
/* The premise, written out afresh rather than read from the engine: a Gem is judged on
   lines every one of which carries the credited stone of the rune's lineage where
   that raises it, before and after alike; a Grindstone on the rune as it stands. */
const legendStones = new Map(['standard', 'ancient'].map((lineage) => [lineage,
  craftPlan(lineage, { ...credit, gem: noCraftCredit.gem })]));
const premised = (kind, lines, rune) => kind === 'gem'
  ? lines.map((line) => ({ ...line, grind: Math.max(line.grind,
    legendStones.get(rune.ancient ? 'ancient' : 'standard').grind[line.statId]) })) : lines;
let comparisons = 0;
for (const kind of ['gem', 'grindstone']) for (const roll of ['two-thirds', 'maximum']) {
  const request = { runes, items: items.filter((item) => item.kind === kind), missing: [], roles, settings, base,
    roll, preferGpu: false };
  const calculation = await recommendRuneCraft(request);
  // Ignore removes a rune/kind/stat, never the rune. Rank the retained pairs
  // again so a less valuable, unignored stat can become that rune's best answer.
  const alternatives = new Map();
  for (const row of calculation.candidates.filter((row) => row.gain > 1e-10)) {
    const group = alternatives.get(row.rune.id) ?? [];
    group.push(row); alternatives.set(row.rune.id, group);
  }
  const multipleStats = [...alternatives.values()].find((group) => new Set(group.map((row) => row.item.statId)).size > 1);
  assert.ok(multipleStats, `${kind}: the fixture must offer a second improving stat`);
  const best = craftRecommendationRankings(multipleStats, 1).highestGain[0];
  const retained = multipleStats.filter((row) => row.item.statId !== best.item.statId);
  const next = craftRecommendationRankings(retained, 1).highestGain[0];
  assert.equal(next.rune.id, best.rune.id, 'ignoring the best craft must keep the same rune eligible for its next improving stat');
  assert.notEqual(next.item.statId, best.item.statId);
  assert.ok(next.gain > 0 && next.gain <= best.gain);
  const actual = { ...craftRecommendationRankings(calculation.candidates, 10), backend: calculation.backend, comparisons: calculation.comparisons };
  const rows = [];
  for (const rune of runes) {
    const before = evaluate({ ...rune, subProperties: premised(kind, rune.subProperties, rune) });
    if (!before) continue;
    for (const item of request.items.filter((item) => lineageFits(item, rune))) {
      const comparison = craftComparison(item, rune, request.roll, credit);
      assert.deepEqual(comparison.baseline, premised(kind, rune.subProperties, rune), 'the baseline left the premise');
      const applications = comparison.applications;
      const half = heldCraftHalf(kind, [{ item, stock: 0 }], request.roll);
      const variants = craftVariants({ gem: kind === 'gem' ? half : null, grind: kind === 'grindstone' ? half : null },
        rune.slot, rune.mainStatId, rune.prefixStatId, rune.subProperties, rune.level >= 12, () => true, true)
        .filter((variant) => variant.stock.includes(0));
      assert.deepEqual(applications.map((app) => app.lines), variants.map((variant) => premised(kind, variant.lines, rune)));
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
const emptyRequest = { runes: [], items: [], missing: [], roles: [], settings, base, roll: 'maximum', preferGpu: false };
assert.equal((await recommendRuneCraft(emptyRequest)).candidates.length, 0);
assert.equal((await recommendRuneCraft({ ...emptyRequest, runes, items })).candidates.length, 0);
const nonImproving = { ...runes[0], subProperties: [{ statId: 8, value: 30, grind: 5, gemmed: false }] };
assert.equal(craftComparison(items.find((item) => item.kind === 'grindstone' && item.statId === 8 && item.lineage === 'standard'),
  nonImproving, emptyRequest.roll, credit).applications.length, 0);

/* The case that exposed the unequal premise: a Bruiser SPD rune with ATK 8 %. ATK
   ground by the same stone outweighs HP + ground, so an HP + Gem must not take the ATK
   line, and every Gem gain must be the Gem's own — never a stone the replaced line
   could have taken too. */
{
  const bruiser = roles.find((role) => role.id === 'bruiser');
  const blade = { id: 'bruiser-blade', setId: 4, setName: 'Blade', slot: 2, stars: 6, ancient: false, rarity: 'Hero',
    level: 12, mainStatId: 8, mainValue: 31, prefixStatId: null, prefixValue: 0, occupiedId: null, obtainedOrder: 0,
    subProperties: [{ statId: 9, value: 6, grind: 0, gemmed: false }, { statId: 10, value: 11, grind: 0, gemmed: false },
      { statId: 2, value: 21, grind: 0, gemmed: false }, { statId: 4, value: 8, grind: 0, gemmed: false }] };
  const hpGem = readCraftItem({ craft_item_id: 9950, craft_type: 1, craft_type_id: 40104, amount: 1 });
  assert.equal(hpGem.kind === 'gem' && hpGem.statId === 1 && hpGem.setId === 4 && hpGem.grade === 'Hero', true,
    'the fixture item is not a Hero Blade HP + Gem');
  const bruiserBase = new Map([['No type', { hp: 10435, atk: 718, def: 611, spd: 104, criRate: 17, criDmg: 50, res: 17, acc: 4 }]]);
  const answer = await recommendRuneCraft({ ...emptyRequest, runes: [blade], items: [hpGem], roles: [bruiser], base: bruiserBase, roll: 'average' });
  assert.deepEqual(answer.candidates.map((row) => row.application.target.index), [1],
    'the HP + Gem belongs on the CRI Dmg line; on ATK % it only won the stone ATK could have had');
}
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

/* A Gem only with the stat the placement rule chooses (RUNE-CRAFT-ITEMS.md §5.1).
   The oracle asks `craftedScore` itself, on the reference rune, in every role
   reading Gems & Grinds judges a rune in, and keeps the reading worth most: the
   rule Rune Clean-up applies, so the two views cannot name different stats. */
assert.equal(desirableGemStats([]).size, 0);
function ruleStat(rune) {
  const lineage = rune.ancient ? 'ancient' : 'standard';
  const referencePlan = craftPlan(lineage, credit);
  const referenceBare = craftPlan(lineage, { ...credit, gem: noCraftCredit.gem });
  let best = null;
  for (const { role, builds } of families) for (const build of builds) {
    const candidate = prepareRuneCandidate(rune, role, build, base.get(role.type), noCraft, scope);
    if (!candidate) continue;
    const discount = runeRankWorth(settings, candidate.rank);
    if (discount === 0) continue;
    const { prices, prefixScore } = candidate.scoring;
    const onScale = (score) => score / candidate.ceiling * 100 * discount;
    const report = { replaced: -1, statId: -1 };
    const options = gemOptions(referencePlan, prices, rune.slot, rune.mainStatId, rune.prefixStatId);
    const gemmed = onScale(craftedScore(referencePlan, options, prices, rune.subProperties, prefixScore, undefined, report));
    const bare = onScale(craftedScore(referenceBare, options, prices, rune.subProperties, prefixScore));
    if (report.statId < 0 || gemmed <= bare) continue;
    if (!best || gemmed > best.score + 1e-9) best = { score: gemmed, stats: new Set([report.statId]) };
    else if (Math.abs(gemmed - best.score) <= 1e-9) best.stats.add(report.statId);
  }
  return best?.stats ?? new Set();
}
const desirable = desirableGemStats(whole.candidates);
let judged = 0;
for (const [runeId, stats] of desirable) {
  const rune = runes.find((entry) => entry.id === runeId);
  if (rune.level < 12) { assert.equal(stats.size, 0, 'a Gem stat was chosen below +12'); continue; }
  const expected = ruleStat(rune);
  assert.ok([...stats].every((stat) => expected.has(stat)) && (stats.size > 0) === (expected.size > 0),
    `${runeId}: Gems & Grinds chose ${[...stats]}, the placement rule ${[...expected]}`);
  judged += stats.size > 0 ? 1 : 0;
}
assert.ok(judged > 10, 'too few runes had a Gem stat to compare');
assert.ok(whole.candidates.filter((row) => row.item.kind === 'grindstone').every((row) => onDesirableGemStat(row, desirable)));
/* Neither the page's roll, the grind after, nor the box decides the stat. */
const choiceOf = (answer) => JSON.stringify([...new Map(answer.candidates.map((row) => [row.rune.id, row.gemChoice])).entries()].sort());
const otherAsk = await recommendRuneCraft({ ...emptyRequest, runes, items: box, missing, roles, roll: 'minimum', grindAfter: { grade: 'Hero' } });
assert.equal(choiceOf(otherAsk), choiceOf(whole), 'the roll or the grind after moved the Gem stat');
/* Ignoring the chosen stat on a rune hands the choice to the next stat in the rule's order. */
const ranked = whole.candidates.find((row) => row.gemChoice.length > 1 && row.gemChoice[0].score > row.gemChoice[1].score);
assert.ok(ranked, 'no rune ranks two Gem stats');
const waived = desirableGemStats(whole.candidates, (runeId, statId) => runeId === ranked.rune.id && statId === ranked.gemChoice[0].statId);
assert.equal(waived.get(ranked.rune.id)?.has(ranked.gemChoice[1].statId), true, 'ignoring the chosen stat did not promote the next one');
/* A held Gem of any other stat is never suggested. */
for (const row of whole.candidates) if (row.item.kind === 'gem') {
  assert.equal(onDesirableGemStat(row, desirable), desirable.get(row.rune.id)?.has(row.item.statId) ?? false);
}
/* Can change gem'ed stat? No narrows the choice before its top is read. The rune
   that exposed it: an ancient Blade CRI Dmg rune with a CRI Rate 5 Gem, where the
   placement rule wants SPD. Read after the top, the rule kept SPD, No refused it,
   and the Ancient CRI Rate Gem that raises the rune was shown nowhere. */
{
  const gemmedBlade = { id: 'gemmed-blade', setId: 4, setName: 'Blade', slot: 4, stars: 6, ancient: true, rarity: 'Hero',
    level: 15, mainStatId: 10, mainValue: 80, prefixStatId: null, prefixValue: 0, occupiedId: null, obtainedOrder: 0,
    subProperties: [{ statId: 3, value: 39, gemmed: false, grind: 21 }, { statId: 9, value: 5, gemmed: true, grind: 0 },
      { statId: 4, value: 20, gemmed: false, grind: 8 }, { statId: 2, value: 7, gemmed: false, grind: 5 }] };
  const criGem = readCraftItem({ craft_item_id: 9951, craft_type: 5, craft_type_id: 40914, amount: 1 });
  assert.equal(criGem.kind === 'gem' && criGem.statId === 9 && criGem.lineage === 'ancient' && criGem.grade === 'Hero', true,
    'the fixture item is not an Ancient Hero Blade CRI Rate Gem');
  const answer = await recommendRuneCraft({ ...emptyRequest, runes: [gemmedBlade], items: [criGem], roles, roll: 'average' });
  const [row] = answer.candidates;
  assert.ok(row && row.after.score > row.before.score, 'the Ancient CRI Rate Gem no longer raises the fixture rune');
  assert.equal(row.gemChoice[0].statId, 8, 'the fixture rune no longer wants SPD first; it no longer tests the case');
  /* Yes is a permission: it may add the placement rule's stat, never take away the
     better roll No offers. Read as the rule alone, Yes showed nothing here. */
  assert.equal(onDesirableGemStat(row, desirableGemStats(answer.candidates, undefined, 'yes')), true,
    'Yes hid a better roll of the gem\'ed stat that No suggests');
  assert.equal(desirableGemStats(answer.candidates, undefined, 'yes').get(row.rune.id)?.has(8), true,
    'Yes no longer offers the placement rule\'s own stat');
  assert.equal(onDesirableGemStat(row, desirableGemStats(answer.candidates, undefined, 'no')), true,
    'No must leave a better roll of the gem\'ed stat as the rune\'s choice');
}
/* No leaves a rune without a Gem to the placement rule alone: a first Gem is
   never steered onto a line whose stat it repeats unless that is the best stat. */
assert.ok(runes.every((rune) => rune.subProperties.every((line) => !line.gemmed)), 'the sample runes must carry no Gem');
assert.deepEqual(desirableGemStats(whole.candidates, undefined, 'no'), desirable, 'No changed the Gem stat of a rune that carries no Gem');

/* The craft credit is the user's (Settings › Gems & Grindstones). Where it assumes no
   Gem, the placement rule has no Gem to choose with: it names no stat, so every held
   Gem that raises its rune stands on its own gain instead of vanishing. A Gem is then
   judged on lines ground by the credit's stone alone. */
{
  const noGem = { ...settings, craftCredit: { ...credit, gem: { ...credit.gem, grade: 'none' } } };
  const gemsOnly = box.filter((item) => item.kind === 'gem');
  const answer = await recommendRuneCraft({ ...emptyRequest, runes, items: gemsOnly, missing, roles, settings: noGem, roll: 'two-thirds' });
  assert.ok(answer.candidates.length > 0, 'a credit without a Gem left nothing to judge');
  assert.ok(answer.candidates.every((row) => row.gemChoice === null), 'a credit without a Gem still named a Gem stat');
  const open = desirableGemStats(answer.candidates);
  assert.ok(answer.candidates.every((row) => onDesirableGemStat(row, open)), 'a Gem was hidden by a rule that names no stat');
  /* And the premise follows the credit's stone: none of it, and the Gem is read on the rune as it stands. */
  const bare = { ...settings, craftCredit: noCraftCredit };
  const plain = await recommendRuneCraft({ ...emptyRequest, runes, items: gemsOnly, roles, settings: bare, roll: 'two-thirds' });
  for (const row of plain.candidates) {
    assert.deepEqual(craftComparison(row.item, row.rune, 'two-thirds', noCraftCredit).baseline, row.rune.subProperties,
      'with no stone credited a Gem was read on ground lines');
  }
}

/* A changed account is answered from what is already known — the box and the
   runes alike, as live sync changes both. A stack gone takes its rows, a stack
   spent down keeps its rows under its new size, a rune gone or changed takes its
   rows, and only what is new is judged — and the result is exactly a fresh
   calculation's. */
const sorted = (rows) => JSON.stringify(rows.map((row) => [row.rune.id, row.rune.subProperties[0]?.value, row.item.id, row.item.amount,
  row.after.score, row.stat]).sort());
const firstBox = items.slice(0, 20);
const firstRunes = runes.slice(0, 36);
const firstAnswer = await recommendRuneCraft({ ...emptyRequest, runes: firstRunes, items: firstBox, roles, roll: 'two-thirds' });
const remembered = { key: 'context', items: firstBox.map(craftItemKey), runes: firstRunes.map(craftRuneKey), result: firstAnswer };
const spent = firstBox.slice(2).find((item) => firstAnswer.candidates.some((row) => row.item === item));
const powered = firstRunes.slice(2).find((rune) => rune.subProperties.length && firstAnswer.candidates.some((row) => row.rune === rune));
assert.ok(spent && powered, 'the first answer judged nothing to change');
const secondBox = [...firstBox.slice(2).map((item) => item === spent ? { ...item, amount: 7 } : item), ...items.slice(20, 26)];
const changed = { ...powered, subProperties: powered.subProperties.map((line, at) => at === 0 ? { ...line, value: line.value + 1 } : line) };
const secondRunes = [...firstRunes.slice(2).map((rune) => rune === powered ? changed : rune), ...runes.slice(36, 44)];
const reconciled = reconcileCraftCalculation(remembered, secondBox, secondRunes);
assert.deepEqual(reconciled.addedItems.map((item) => item.id), items.slice(20, 26).map((item) => item.id), 'only the new stacks are asked about');
assert.deepEqual(reconciled.addedRunes.map((rune) => rune.id), [changed, ...runes.slice(36, 44)].map((rune) => rune.id),
  'only the new and the changed runes are asked about');
const secondRequest = { ...emptyRequest, runes: secondRunes, items: secondBox, roles, roll: 'two-thirds' };
const asks = craftExtensionRequests(secondRequest, reconciled);
assert.equal(asks.length, 2, 'new runes and new items are two questions');
const answers = await Promise.all(asks.map((ask) => recommendRuneCraft(ask)));
const published = extendCraftCalculation(remembered, answers, secondBox, secondRunes);
const extended = reconcileCraftCalculation(published, secondBox, secondRunes);
assert.equal(extended.addedItems.length + extended.addedRunes.length, 0, 'an extended answer has judged the whole account');
const fresh = await recommendRuneCraft(secondRequest);
assert.equal(sorted(published.result.candidates), sorted(fresh.candidates), 'the published snapshot itself must be complete');
assert.deepEqual(published.items, secondBox.map(craftItemKey), 'obsolete item keys must be retired');
assert.deepEqual(published.runes, secondRunes.map(craftRuneKey), 'obsolete rune keys must be retired');
assert.equal(sorted(extended.result.candidates), sorted(fresh.candidates), 'an extended answer differs from a fresh one');
assert.ok(extended.result.candidates.some((row) => row.item.amount === 7), 'a spent-down stack keeps its rows under its new size');
assert.ok(!extended.result.candidates.some((row) => firstBox.slice(0, 2).includes(row.item)), 'a stack gone left a row behind');
assert.ok(!extended.result.candidates.some((row) => firstRunes.slice(0, 2).includes(row.rune) || row.rune === powered),
  'a rune gone or changed left a row behind');
/* Returning to a previous rune or box must ask again: the old snapshot was
   retired, so an old key cannot suppress a necessary extension. */
const returning = reconcileCraftCalculation(published, firstBox, firstRunes);
const returningAnswers = await Promise.all(craftExtensionRequests({ ...secondRequest, items: firstBox, runes: firstRunes }, returning)
  .map((ask) => recommendRuneCraft(ask)));
const returned = extendCraftCalculation(published, returningAnswers, firstBox, firstRunes);
assert.equal(sorted(returned.result.candidates), sorted(firstAnswer.candidates), 'a returning account differs from a fresh answer');
const cleared = extendCraftCalculation(returned, [], [], []);
assert.deepEqual(cleared.items, []);
assert.deepEqual(cleared.runes, []);
assert.deepEqual(cleared.result.candidates, [], 'an empty account must publish an empty answer');
console.log(`PASS: What's missing judged ${missing.length} absent items on ${runes.length} runes in ${Math.round(missingMs)} ms without moving a held answer.`);
console.log(`PASS: ${comparisons.toLocaleString('en-US')} craft/build comparisons agree with exhaustive role readings; every optimizer variant, stat-specific ranking and empty case holds.`);
