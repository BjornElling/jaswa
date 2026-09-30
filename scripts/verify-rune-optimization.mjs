/**
 * **The Rune Optimization search is exact, and this is what holds it to that.**
 *
 * `docs/RUNE-OPTIMIZATION.md` §4 and §6 promise that everything between the filters
 * and the depth's cut — the dominance reduction, the upper bound, the set pruning,
 * the item stock and the split between workers — drops no build that could have made
 * the table. A promise like that fails silently: a bound that is one point too tight
 * prunes the best build and the table simply shows the second best as if it were the
 * first.
 *
 * So random small accounts are searched two ways and the tables compared:
 *
 * 1. **The search** — `prepareRuneOptimization` at the `complete` depth, then
 *    `searchRuneBuilds`, once whole and once split into three parts and merged.
 * 2. **Brute force** — every combination of the unreduced candidates, each written
 *    out as an export rune record and scored by `calculateMonsterTotals`, the stat
 *    sheet the Monsters page shows, with builds, the Intangible rule, targets and
 *    stock checked by hand here rather than by the search's own helpers.
 *
 * The two must agree on every row's ranking figure and move count, and every figure
 * the search reports must be the figure the stat sheet gives its six runes.
 *
 *   node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs \
 *     scripts/verify-rune-optimization.mjs
 */
import assert from 'node:assert/strict';
import { calculateMonsterTotals, intangibleSetId, monsterTargetFigures, targetFigureKeys } from '../app/lib/monster-stats.ts';
import { monsterStatTargetKeys } from '../app/lib/monster-preferences.ts';
import { prepareRuneOptimization } from '../app/lib/rune-optimization-problem.ts';
import { defaultRuneOptimizationSettings } from '../app/lib/rune-optimization-settings.ts';
import { mergeBuildResults, searchRuneBuilds } from '../app/lib/rune-optimization-search.ts';
import { runeBuild } from '../app/lib/rune-set-pairs.ts';
import { runeSetId, runeSetPieceCount } from '../app/lib/rune-sets.ts';
import { slotAllowsSubStat, slotMainProperties } from '../app/lib/runes.ts';

let seed = 20260930;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (low, high) => low + Math.floor(random() * (high - low + 1));

const statRange = { 1: [135, 375], 2: [5, 40], 3: [10, 80], 4: [5, 40], 5: [10, 80], 6: [5, 40], 8: [4, 30], 9: [4, 30], 10: [4, 35], 11: [4, 40], 12: [4, 40] };
const mainValue = { 1: 2448, 2: 63, 3: 160, 4: 63, 5: 160, 6: 63, 8: 42, 9: 58, 10: 80, 11: 64, 12: 64 };
const setPool = [13, 15, 1, 3, 4, 8, 5];

function randomRune(id, slot, occupiedId, allowIntangible, favoured) {
  /* Mostly the sets the scenario's builds ask for, or almost every table would be
     empty and prove nothing about the ranking. */
  const setId = allowIntangible && random() < 0.12 ? intangibleSetId
    : favoured.length > 0 && random() < 0.8 ? pick(favoured) : pick(setPool);
  const mainStatId = pick(slotMainProperties[slot]);
  const prefixStatId = random() < 0.4 ? pick([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12].filter((stat) => stat !== mainStatId && slotAllowsSubStat(slot, stat))) : null;
  const used = new Set([mainStatId, prefixStatId]);
  const subProperties = [];
  while (subProperties.length < 4) {
    const statId = pick([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
    if (used.has(statId) || !slotAllowsSubStat(slot, statId)) continue;
    used.add(statId);
    const [low, high] = statRange[statId];
    subProperties.push({ statId, value: between(low, Math.max(low, Math.round(high / 3))), gemmed: false, grind: 0 });
  }
  const level = pick([12, 15, 15, 9]);
  return {
    id: String(id), setId, setName: '', slot, stars: 6, ancient: false, defaultGrade: 'Legend', level,
    mainStatId, mainValue: level === 15 ? mainValue[mainStatId] : Math.round(mainValue[mainStatId] * 0.6),
    prefixStatId, prefixValue: prefixStatId === null ? 0 : between(...statRange[prefixStatId].map((value, at) => (at ? Math.round(value / 4) : value))),
    subProperties, occupiedId, obtainedOrder: id,
  };
}

const builds = [[], ['Violent/Will'], ['Violent/Broken'], ['Swift/Energy', 'Violent/Blade'], ['Energy/Will/Blade'], ['Fatal/Broken', 'Rage/Energy']];
const figures = monsterStatTargetKeys;

function scenario(index) {
  const allowIntangible = random() < 0.4;
  const wantedBuilds = builds[index % builds.length];
  const favoured = [...new Set(wantedBuilds.flatMap((id) => runeBuild(id).sets.map((name) => runeSetId(name))))];
  const runes = [];
  let id = 1;
  for (let slot = 1; slot <= 6; slot += 1) {
    const count = between(3, 5);
    for (let at = 0; at < count; at += 1) {
      const where = random();
      runes.push(randomRune(id, slot, where < 0.3 ? '1' : where < 0.55 ? '2' : null, allowIntangible, favoured));
      id += 1;
    }
  }
  const holds = {};
  if (random() < 0.3) {
    const worn = runes.find((rune) => rune.occupiedId === '1');
    if (worn) holds[worn.id] = { locked: true };
  }
  const other = runes.find((rune) => rune.occupiedId === '2');
  if (other && random() < 0.5) holds[other.id] = { locked: true };

  const craftItems = [
    { id: '901', kind: 'gem', lineage: 'immemorial', setId: null, setName: null, statId: 8, statName: 'SPD', grade: 'Hero', amount: 1, range: undefined },
    { id: '902', kind: 'grindstone', lineage: 'immemorial', setId: null, setName: null, statId: 4, statName: 'ATK %', grade: 'Legend', amount: 2, range: undefined },
    { id: '903', kind: 'grindstone', lineage: 'standard', setId: 13, setName: 'Violent', statId: 8, statName: 'SPD', grade: 'Legend', amount: 1, range: undefined },
  ];
  const rankBy = pick(figures);
  const targets = {};
  if (random() < 0.5) targets.spd = between(100, 150);
  if (random() < 0.3) targets.hp = between(8000, 16000);
  const gems = pick(['none', 'owned', 'theoretical']);
  const grinds = pick(['none', 'owned', 'theoretical']);
  return {
    unitId: '1',
    monster: {
      unit_id: 1, con: 700, atk: 700, def: 600, spd: 101, critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0,
      artifacts: [{ pri_effect: [101, 100] }, { pri_effect: [100, 1500] }],
    },
    runes, holds, craftItems,
    requirements: {
      builds: wantedBuilds,
      slotMains: { slot2: random() < 0.3 ? ['SPD'] : [], slot4: [], slot6: [] },
      allowIntangible, targets, rankBy,
    },
    settings: {
      ...defaultRuneOptimizationSettings, gems, grinds, gemGrade: 'Legend', grindGrade: 'Hero',
      runesOnOtherMonsters: random() < 0.7, unfinishedAtMaximum: random() < 0.5,
      depth: 'complete', resultCount: 5,
    },
  };
}

/* The stat sheet of six chosen end states, through the Monsters page's own reader. */
function sheet(input, chosen) {
  const record = {
    ...input.monster,
    runes: chosen.map((candidate) => {
      const rune = input.runes.find((entry) => entry.id === candidate.runeId);
      return {
        set_id: rune.setId,
        pri_eff: [rune.mainStatId, candidate.mainValue],
        prefix_eff: rune.prefixStatId === null ? [0, 0] : [rune.prefixStatId, rune.prefixValue],
        sec_eff: candidate.lines.map((line) => [line.statId, line.value, line.gemmed ? 1 : 0, line.grind]),
      };
    }),
  };
  const shown = monsterTargetFigures(calculateMonsterTotals(record));
  return figures.map((key) => shown[key]);
}

function oneShort(counts) {
  const short = [...counts.entries()].filter(([setId, count]) => setId !== intangibleSetId && runeSetPiecesById(setId) && count % runeSetPiecesById(setId) === runeSetPiecesById(setId) - 1);
  return short.length;
}

const piecesById = new Map([[1, 2], [3, 4], [4, 2], [5, 4], [8, 4], [13, 4], [15, 2]]);
function runeSetPiecesById(setId) { return piecesById.get(setId); }

function buildMet(id, counts) {
  const build = runeBuild(id);
  const intangible = counts.get(intangibleSetId) ?? 0;
  const short = [...counts.entries()].filter(([setId, count]) => setId !== intangibleSetId && count % runeSetPiecesById(setId) === runeSetPiecesById(setId) - 1);
  const completes = intangible > 0 && short.length === 1 ? short[0][0] : -1;
  let inBuild = 0;
  for (const name of build.sets) {
    const setId = runeSetId(name);
    const worn = (counts.get(setId) ?? 0) + (completes === setId ? 1 : 0);
    if (worn < runeSetPieceCount[name]) return false;
    if (!build.broken && (counts.get(setId) ?? 0) > runeSetPieceCount[name]) return false;
    inBuild += counts.get(setId) ?? 0;
  }
  return build.broken || inBuild + intangible === 6;
}

function bruteForce(input) {
  const problem = prepareRuneOptimization(input, { reduce: false });
  const found = [];
  const chosen = [];
  const rank = figures.indexOf(input.requirements.rankBy);
  function walk(slot) {
    if (slot === 6) {
      const counts = new Map();
      for (const candidate of chosen) counts.set(candidate.setId, (counts.get(candidate.setId) ?? 0) + 1);
      if ((counts.get(intangibleSetId) ?? 0) > 1) return;
      if ((counts.get(intangibleSetId) ?? 0) === 1 && oneShort(counts) > 1) return;
      const wanted = input.requirements.builds;
      if (wanted.length > 0 && !wanted.some((id) => buildMet(id, counts))) return;
      const spent = new Map();
      for (const candidate of chosen) for (const entry of candidate.stock) spent.set(entry, (spent.get(entry) ?? 0) + 1);
      for (const [entry, count] of spent) if (count > problem.stock[entry].amount) return;
      const values = sheet(input, chosen);
      for (const [key, floor] of Object.entries(input.requirements.targets)) if (values[figures.indexOf(key)] < floor) return;
      found.push({ value: values[rank], moves: chosen.filter((candidate) => candidate.moves).length });
      return;
    }
    for (const candidate of problem.slots[slot]) {
      chosen.push(candidate);
      walk(slot + 1);
      chosen.pop();
    }
  }
  walk(0);
  found.sort((left, right) => right.value - left.value || left.moves - right.moves);
  return found.slice(0, input.settings.resultCount);
}

/* The search reads its figure order from the stat sheet so that no worker loads the
   statistics dataset the preferences' own list sits beside. Two lists that must
   agree are held equal here. */
assert.deepEqual([...targetFigureKeys], [...monsterStatTargetKeys], 'the stat sheet and the profile list the eleven figures differently');

const scenarios = Number(process.argv.find((arg) => arg.startsWith('--scenarios='))?.split('=')[1] ?? 160);
let checkedRows = 0;
let emptyTables = 0;
/* Brute force is only a proof while it finishes, and a theoretical Gem multiplies a
   rune into a dozen end states. An account whose unreduced combinations run past
   this is drawn again rather than searched for minutes. */
const bruteForceCeiling = 40_000;
function affordableScenario(index) {
  for (;;) {
    const input = scenario(index);
    const unreduced = prepareRuneOptimization(input, { reduce: false });
    if (unreduced.slots.reduce((product, slot) => product * Math.max(1, slot.length), 1) <= bruteForceCeiling) return input;
  }
}

for (let index = 0; index < scenarios; index += 1) {
  const input = affordableScenario(index);
  const problem = prepareRuneOptimization(input);
  const whole = searchRuneBuilds(problem);
  const split = mergeBuildResults([0, 1, 2].map((part) => searchRuneBuilds(problem, part, 3)), problem.rank, problem.resultCount);
  const expected = bruteForce(input);
  const reading = (table) => table.builds.map((build) => ({ value: build.figures[problem.rank], moves: build.moves }));
  const context = `scenario ${index}: ${JSON.stringify({ builds: input.requirements.builds, rank: input.requirements.rankBy, targets: input.requirements.targets, gems: input.settings.gems, grinds: input.settings.grinds })}`;
  assert.ok(whole.complete, `${context} did not finish`);
  assert.deepEqual(reading(whole), expected, `${context}: the search's table differs from brute force`);
  assert.deepEqual(reading(split), expected, `${context}: the split search's table differs from brute force`);
  for (const build of whole.builds) {
    const chosen = build.picks.map((at, slot) => problem.slots[slot][at]);
    assert.deepEqual(build.figures, sheet(input, chosen), `${context}: a reported figure is not the stat sheet's`);
  }
  checkedRows += expected.length;
  if (expected.length === 0) emptyTables += 1;
}

assert.ok(checkedRows > scenarios, 'too few builds were compared to prove anything');
console.log(`PASS: ${scenarios} random accounts, ${checkedRows} ranked builds — the search, whole and split three ways,`
  + ` matches brute force on every row (${emptyTables} tables were rightly empty).`);
