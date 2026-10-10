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
 *    `searchRuneBuilds`, once whole and once split into three parts and merged —
 *    and split again with the parts handing each other their bars, the way the
 *    workers do, which may prune only what cannot make the merged table.
 * 2. **Brute force** — every combination of the unreduced candidates, each written
 *    out as an export rune record and scored by `calculateMonsterTotals`, the stat
 *    sheet the Monsters page shows, with builds, the Intangible rule, targets and
 *    stock checked by hand here rather than by the search's own helpers.
 *
 * The two must agree on every row's ranking figure and move count, and every figure
 * the search reports must be the figure the stat sheet gives its six runes.
 *
 * 3. **The search in passes** — `searchRuneBuildsInPasses`, the shape the graphics
 *    card is driven in, with a stand-in card on the processor that is as generous as
 *    a card may ever be: it sends back *every* pair, shuffled, from passes of a few
 *    blocks, and says it has no room once a pass holds more than a few dozen pairs.
 *    That is the whole machinery around a card — holding blocks, splitting a pass
 *    that overflows, judging a lone block on the processor, confirming every pair
 *    against a prefix the tree has long left — and it must give the processor's own
 *    table, row for row and pick for pick. A second stand-in answers two passes and
 *    then refuses, so the processor has to finish what the card left.
 *
 * 4. **The build read again** — `currentBuilds`, which keeps an open table in step
 *    with the account as the player follows it. Against an account a sync merely
 *    re-sent it must change nothing; against one where every move, Gem and stone the
 *    build asks for has been done it must report the same figures, no work left and
 *    no rune to move. `buildFigures`, which it counts with, must give the search's
 *    own figures. And it must say which rune stands in the way when one cannot be
 *    used: sold, locked where it is, its slot taken by a lock, the items for its
 *    work spent elsewhere, or a Gem put on another of its lines.
 *
 * Scenarios draw the profile's switches too: a monster that always crits is
 * scored by the stat sheet at a certain crit with no CRI Rate floor, and with
 * Immemorial items refused no candidate may spend one.
 *
 * No real card runs here; `verify-rune-optimization-card.mjs` holds the shader.
 *
 *   node --experimental-strip-types --no-warnings --import ./scripts/json-module-hook.mjs \
 *     scripts/verify-rune-optimization.mjs
 */
import assert from 'node:assert/strict';
import { defaultRuneRoles } from '../app/lib/rune-roles.ts';
import { gemRemovalPrices } from '../app/lib/rune-optimization-gem-preference.ts';
import {
  calculateMonsterTotals, intangibleCompletion, intangibleSetId, monsterTargetFigures, setIdBound, targetFigureKeys,
} from '../app/lib/monster-stats.ts';
import { monsterStatTargetKeys } from '../app/lib/monster-preferences.ts';
import {
  buildFigures, canStillFinishSets, canStillSatisfy, prepareRuneOptimization, remainingSetSupport,
  targetCeilings, targetFloors,
} from '../app/lib/rune-optimization-problem.ts';
import { currentBuilds } from '../app/lib/rune-optimization-refresh.ts';
import {
  mergeBuildResults, searchRuneBuilds, searchRuneBuildsInPasses, searchRuneBuildsInSlices,
} from '../app/lib/rune-optimization-search.ts';
import { runeBuild } from '../app/lib/rune-set-pairs.ts';
import { runeSetId, runeSetPieceCount } from '../app/lib/rune-sets.ts';
import { craftedRangeScenarios, scenarioGenerator } from './rune-optimization-scenarios.mjs';

const { scenario } = scenarioGenerator();
const figures = monsterStatTargetKeys;

const supportSlots = [[13, 15], [13, 15], [13], [15], [15], [15]].map((sets) => sets.map((setId) => ({ setId })));
const support = remainingSetSupport(supportSlots, [0, 1, 2, 3, 4, 5]);
const requiredSets = { needs: [{ setId: 13, pieces: 4 }, { setId: 15, pieces: 2 }], free: 0 };
const engraved = new Int32Array(setIdBound); engraved[13] = 2;
const pieces = new Int32Array(setIdBound); pieces[13] = 4; pieces[15] = 2;
assert.ok(canStillSatisfy(requiredSets, engraved, 2), 'the loose slot count should admit this impossible prefix');
assert.ok(!canStillSatisfy(requiredSets, engraved, 2, support[2]), 'one remaining Violent slot cannot supply two pieces');
assert.ok(!canStillFinishSets(engraved, 2, pieces, support[2]), 'broken sets refused must read actual slot support too');
engraved[13] = 3; engraved[intangibleSetId] = 1;
assert.ok(canStillSatisfy(requiredSets, engraved, 4, support[4]), 'an engraved Intangible completes Violent without another slot');
assert.ok(canStillFinishSets(engraved, 4, pieces, support[4]), 'the engraved wildcard must survive the support proof');
const future = new Int32Array(setIdBound); future[13] = 1; future[15] = 1; future[intangibleSetId] = 1;
engraved.fill(0); engraved[13] = 2; engraved[15] = 1;
assert.ok(canStillSatisfy(requiredSets, engraved, 3, future), 'a future Intangible must stay available to the support bound');
console.log('PASS: remaining set support rejects impossible prefixes and preserves engraved and future Intangible completions.');

/* The stat sheet of six chosen end states, through the overlay's own reader: each
   stat the copy's own, each composite with its fight, as every range judges. */
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
  const read = monsterTargetFigures(record, input.requirements);
  return figures.map((key) => read[key]);
}

/* The floors a build is held to, written out here rather than read from the search:
   a monster that always crits is never asked for CRI Rate. */
const floorsOf = (input) => Object.entries(input.requirements.targets)
  .filter(([key]) => !(input.requirements.alwaysCrits && key === 'criRate'));
const ceilingsOf = (input) => Object.entries(input.requirements.ceilings)
  .filter(([key]) => !(input.requirements.alwaysCrits && key === 'criRate'));

const piecesById = new Map(Object.entries(runeSetPieceCount).map(([name, pieces]) => [runeSetId(name), pieces]));
function runeSetPiecesById(setId) { return piecesById.get(setId); }

/* The set an Intangible completes: only one set one rune short, or none. */
function completedBy(counts) {
  const intangible = counts.get(intangibleSetId) ?? 0;
  const short = [...counts.entries()].filter(([setId, count]) => setId !== intangibleSetId && count % runeSetPiecesById(setId) === runeSetPiecesById(setId) - 1);
  return intangible === 1 && short.length === 1 ? short[0][0] : -1;
}

/* A build names the sets it must hold; whatever else is engraved fills its free slots. */
function buildMet(id, counts) {
  const build = runeBuild(id);
  const completes = completedBy(counts);
  /* A stacked two-set asks for its pieces once per time it is named. */
  return build.sets.every((name) => {
    const setId = runeSetId(name);
    const needed = runeSetPieceCount[name] * build.sets.filter((other) => other === name).length;
    return (counts.get(setId) ?? 0) + (completes === setId ? 1 : 0) >= needed;
  });
}

/* Broken sets refused: every rune in a finished set, an Intangible only where it finishes one. */
function noBroken(counts) {
  const completes = completedBy(counts);
  if ((counts.get(intangibleSetId) ?? 0) > 0 && completes === -1) return false;
  return [...counts.entries()].every(([setId, count]) => setId === intangibleSetId
    || (count + (completes === setId ? 1 : 0)) % runeSetPiecesById(setId) === 0);
}

function bruteForce(input) {
  const problem = prepareRuneOptimization(input, { reduce: false });
  const found = new Map();
  const chosen = [];
  const rank = figures.indexOf(input.requirements.rankBy);
  function walk(slot) {
    if (slot === 6) {
      const counts = new Map();
      for (const candidate of chosen) counts.set(candidate.setId, (counts.get(candidate.setId) ?? 0) + 1);
      if ((counts.get(intangibleSetId) ?? 0) > 1) return;
      const wanted = input.requirements.builds;
      if (wanted.length > 0 && !wanted.some((id) => buildMet(id, counts))) return;
      if (!input.requirements.allowBroken && !noBroken(counts)) return;
      const spent = new Map();
      for (const candidate of chosen) for (const entry of candidate.stock) spent.set(entry, (spent.get(entry) ?? 0) + 1);
      for (const [entry, count] of spent) if (count > problem.stock[entry].amount) return;
      const values = sheet(input, chosen);
      const compared = (key) => values[figures.indexOf(key)];
      for (const [key, floor] of floorsOf(input)) if (compared(key) < floor) return;
      for (const [key, ceiling] of ceilingsOf(input)) if (compared(key) > ceiling) return;
      const identity = JSON.stringify(chosen.map((candidate) => candidate.runeId));
      const build = { value: values[rank], moves: chosen.filter((candidate) => candidate.moves).length };
      if (input.settings.limitChanges && build.moves > input.settings.maxChanges) return;
      if (!found.has(identity) || build.value > found.get(identity).value) found.set(identity, build);
      return;
    }
    for (const candidate of problem.slots[slot]) {
      chosen.push(candidate);
      walk(slot + 1);
      chosen.pop();
    }
  }
  walk(0);
  return [...found.values()].sort((left, right) => right.value - left.value || left.moves - right.moves)
    .slice(0, input.settings.resultCount);
}

const uniqueShort = new Int32Array(26); uniqueShort[1] = 1; uniqueShort[intangibleSetId] = 1;
assert.equal(intangibleCompletion(uniqueShort), 1, 'one Intangible must complete the one set that is one rune short');
const ambiguousShort = new Int32Array(26); ambiguousShort[1] = 1; ambiguousShort[2] = 1; ambiguousShort[intangibleSetId] = 1;
assert.equal(intangibleCompletion(ambiguousShort), -1,
  'an Intangible that could complete two sets must complete neither');

/* The search reads its figure order from the stat sheet so that no worker loads the
   statistics dataset the preferences' own list sits beside. Two lists that must
   agree are held equal here. */
assert.deepEqual([...targetFigureKeys], [...monsterStatTargetKeys], 'the stat sheet and the profile list the eleven figures differently');

/* A card that sends back every pair it was given, in a shuffled order, and admits
   to overflowing past `room` pairs. */
function everyPairCard(room, refuseAfter = Infinity) {
  let shuffle = 7;
  let asked = 0;
  return () => async (pass) => {
    asked += 1;
    if (asked > refuseAfter) throw new Error('the stand-in card refuses');
    if (pass.pairs > room) return null;
    const pairs = [];
    for (let block = 0; block < pass.blocks; block += 1) {
      const size = pass.ranges[block * 4 + 1] * pass.ranges[block * 4 + 3];
      for (let pair = 0; pair < size; pair += 1) pairs.push([block, pair]);
    }
    for (let at = pairs.length - 1; at > 0; at -= 1) {
      shuffle = (shuffle * 1103515245 + 12345) % 2147483648;
      const other = shuffle % (at + 1);
      [pairs[at], pairs[other]] = [pairs[other], pairs[at]];
    }
    return Uint32Array.from(pairs.flat());
  };
}

const scenarios = Number(process.argv.find((arg) => arg.startsWith('--scenarios='))?.split('=')[1] ?? 200);
let checkedRows = 0;
let emptyTables = 0;
let refusedMidway = 0;
let spentChecked = 0;
/* Builds with a Gem or a stone still to apply, so the followed case is not only ever read on bare runes. */
let withWork = 0;
/* How often the rarer re-readings and Always crits were actually exercised. */
let lockedAwayChecked = 0;
let itemsChecked = 0;
let allocatedCases = 0;
let alwaysCritting = 0;
/* Searches that had to leave a higher-priority copy's runes where they were. */
let sparedChecked = 0;
let ownKeptChecked = 0;
/* Brute force is only a proof while it finishes, and a theoretical Gem multiplies a
   rune into a dozen end states. An account whose unreduced combinations run past
   this is drawn again rather than searched for minutes. */
const bruteForceCeiling = 40_000;
function affordableScenario(index) {
  for (;;) {
    const input = scenario(index);
    if (index >= 160) {
      // Two required two-sets leave the last pair open. The broad set pool is
      // exactly where a bound must stop promising incompatible four-set bonuses.
      input.locks = {}; input.spared = [];
      input.settings = { ...input.settings, depth: 'complete', gems: 'none', grinds: 'none', runesOnOtherMonsters: true };
      input.requirements = { ...input.requirements, builds: index % 2 ? ['Shield/Will'] : [],
        slotMains: { slot2: [], slot4: [], slot6: [] }, allowBroken: index % 3 === 0,
        allowIntangible: true, targets: {}, ceilings: {}, rankBy: figures[index % figures.length] };
      const seen = new Set();
      const choices = [1, 2, 4, 5, 8, 13, 15, 16, 25];
      input.runes = input.runes.map((rune, at) => {
        const first = !seen.has(rune.slot); seen.add(rune.slot);
        return { ...rune, occupiedId: null, setId: first ? [16, 16, 15, 15, 4, 4][rune.slot - 1] : choices[(at + index) % choices.length] };
      });
    }
    const unreduced = prepareRuneOptimization(input, { reduce: false });
    if (unreduced.slots.reduce((product, slot) => product * Math.max(1, slot.length), 1) <= bruteForceCeiling) return input;
  }
}

for (let index = 0; index < scenarios; index += 1) {
  const input = affordableScenario(index);
  const problem = prepareRuneOptimization(input);
  const whole = searchRuneBuilds(problem);
  assert.equal(new Set(whole.builds.map((build) => build.identity)).size, whole.builds.length,
    `scenario ${index}: craft alternatives filled multiple physical build rows`);
  if (problem.craft) {
    const expanded = searchRuneBuilds(problem, 0, 1, { allocateCraft: false });
    const reading = (answer) => answer.builds.map((build) => [build.figures[problem.rank], build.moves]);
    assert.ok(whole.complete && expanded.complete, `scenario ${index}: allocation agreement cannot be measured on a timeout`);
    assert.deepEqual(reading(whole), reading(expanded), `scenario ${index}: matching differs from full craft combinations`);
    allocatedCases += 1;
  }
  const split = mergeBuildResults([0, 1, 2].map((part) => searchRuneBuilds(problem, part, 3)), problem.rank, problem.resultCount);
  let shared = -Infinity;
  const sharing = { sharedBar: () => shared, onBar: (value) => { shared = Math.max(shared, value); } };
  const sharedSplit = mergeBuildResults([0, 1, 2].map((part) => searchRuneBuilds(problem, part, 3, sharing)), problem.rank, problem.resultCount);
  shared = -Infinity;
  const sliced = mergeBuildResults(await Promise.all([0, 1, 2].map((part) => searchRuneBuildsInSlices(problem, part, 3, sharing))), problem.rank, problem.resultCount);
  const expected = bruteForce(input);
  const reading = (table) => table.builds.map((build) => ({ value: build.figures[problem.rank], moves: build.moves }));
  if (!input.settings.allowImmemorial) {
    const immemorial = new Set(input.craftItems.flatMap((item, at) => (item.lineage === 'immemorial' ? [at] : [])));
    assert.ok(problem.slots.flat().every((candidate) => candidate.stock.every((entry) => !immemorial.has(entry))),
      'an Immemorial item was spent although the profile refuses them');
  }
  if (input.spared.length > 0) {
    const placeByRuneId = new Map(input.runes.map((rune) => [rune.id, rune.occupiedId]));
    const placeOf = (candidate) => placeByRuneId.get(candidate.runeId);
    assert.ok(problem.slots.flat().every((candidate) => !input.spared.includes(placeOf(candidate))),
      `scenario ${index}: a rune engraved on a higher-priority monster was offered`);
    /* The same account with the list ignored offers some of those runes, so the refusal above was a refusal. */
    if (input.settings.runesOnOtherMonsters) {
      const unspared = prepareRuneOptimization({ ...input, spared: [] }, { reduce: false });
      if (unspared.slots.flat().some((candidate) => input.spared.includes(placeOf(candidate)))) sparedChecked += 1;
    }
  }
  /* Taking nothing from the preset still leaves the copy its own runes: the switch
     refuses the rest of the team's, never the ones being rearranged. */
  if (!input.settings.runesOnOtherMonsters) {
    const placeByRuneId = new Map(input.runes.map((rune) => [rune.id, rune.occupiedId]));
    const narrowed = prepareRuneOptimization(input, { reduce: false }).slots.flat();
    assert.ok(narrowed.every((candidate) => [null, input.unitId].includes(placeByRuneId.get(candidate.runeId))),
      `scenario ${index}: a rune engraved on another monster of the preset was offered`);
    const ownIds = (slots) => [...new Set(slots.flat().map((candidate) => candidate.runeId)
      .filter((runeId) => placeByRuneId.get(runeId) === input.unitId))].sort();
    const own = ownIds(narrowed);
    const widened = prepareRuneOptimization({ ...input, settings: { ...input.settings, runesOnOtherMonsters: true } }, { reduce: false }).slots;
    assert.deepEqual(own, ownIds(widened), `scenario ${index}: the copy lost its own runes to the preset switch`);
    if (own.length > 0) ownKeptChecked += 1;
  }
  const context = `scenario ${index}: ${JSON.stringify({ builds: input.requirements.builds, broken: input.requirements.allowBroken, rank: input.requirements.rankBy, targets: input.requirements.targets, ceilings: input.requirements.ceilings, gems: input.settings.gems, grinds: input.settings.grinds })}`;
  assert.ok(whole.complete, `${context} did not finish`);
  assert.deepEqual(reading(whole), expected, `${context}: the search's table differs from brute force`);
  assert.deepEqual(reading(split), expected, `${context}: the split search's table differs from brute force`);
  assert.deepEqual(reading(sharedSplit), expected, `${context}: parts sharing their bars lost a build`);
  assert.deepEqual(reading(sliced), expected, `${context}: parts sharing their bars in slices lost a build`);
  /* Every held Gem and Grindstone is spent at most once across the whole build:
     no build may lean on one stack for more runes — or more lines — than it is deep.
     Held directly against the search's own answer, not only through brute force,
     where a double-spending build could hide behind an equal figure. */
  for (const table of [whole, split, sharedSplit, sliced]) {
    for (const build of table.builds) {
      const spent = new Map();
      build.picks.forEach((at, slot) => {
        for (const entry of problem.slots[slot][at].stock) spent.set(entry, (spent.get(entry) ?? 0) + 1);
      });
      for (const [entry, count] of spent) {
        assert.ok(count <= problem.stock[entry].amount,
          `${context}: a build spends ${count} of item ${problem.stock[entry].itemId}, which the account holds ${problem.stock[entry].amount} of`);
        spentChecked += 1;
      }
    }
  }
  const exactly = (table) => table.builds.map((build) => ({ picks: build.picks, figures: build.figures, moves: build.moves }));
  if (problem.ceilings.some(Number.isFinite)) {
    const unpruned = searchRuneBuilds(problem, 0, 1, { pruneCeilings: false });
    assert.ok(unpruned.complete, `${context}: the interval comparison timed out`);
    assert.deepEqual(exactly(whole), exactly(unpruned), `${context}: interval pruning changed a ranked row or tie`);
  }
  const passes = await searchRuneBuildsInPasses(problem, everyPairCard(40), { blocks: 3, pairs: 60 });
  assert.equal(passes.processorTook, false, `${context}: the stand-in card was not asked every pass`);
  assert.deepEqual(exactly(passes.outcome), exactly(whole), `${context}: the search in passes differs from the processor's`);
  assert.equal(passes.outcome.complete, true, `${context}: the search in passes did not finish`);
  try {
    const refused = await searchRuneBuildsInPasses(problem, everyPairCard(40, 2), { blocks: 2, pairs: 30 });
    assert.deepEqual(exactly(refused.outcome), exactly(whole), `${context}: a card that refused midway lost a build`);
    refusedMidway += refused.processorTook ? 1 : 0;
  } catch (error) {
    /* A card that refused its very first pass throws, so the whole search can be the
       processor's. That is only allowed where there was no first pass to answer. */
    assert.match(String(error), /refuses/, `${context}: the search in passes failed`);
  }
  const runesById = new Map(input.runes.map((rune) => [rune.id, rune]));
  const itemsById = new Map(input.craftItems.map((item) => [item.id, item]));
  const found = whole.builds.map((build) => ({
    ...build,
    runes: build.picks.map((at, slot) => {
      const candidate = problem.slots[slot][at];
      return {
        runeId: candidate.runeId, slot: candidate.slot, setId: candidate.setId, mainValue: candidate.mainValue,
        lines: candidate.lines, gemmedAt: candidate.gemmedAt, groundAt: candidate.groundAt,
        spends: candidate.stock.map((entry) => problem.stock[entry].itemId),
        moves: candidate.moves, locked: candidate.locked,
      };
    }),
  }));
  /* One re-reading of a build against the account `runes`, the locks and the items. */
  const reread = (build, runes, { locks = input.locks, items = itemsById } = {}) => currentBuilds([build], {
    unitId: input.unitId, monster: input.monster, requirements: input.requirements, settings: input.settings, spared: input.spared,
    before: { runes: runesById, items: itemsById }, now: { runes, items, locks },
  })[0];
  const issues = (build) => build.runes.flatMap((picked) => (picked.issue ? [`${picked.slot}:${picked.issue.kind}`] : []));
  for (const build of found) {
    const chosen = build.picks.map((at, slot) => problem.slots[slot][at]);
    assert.deepEqual(build.figures, sheet(input, chosen), `${context}: a figure is not the stat sheet's`);
    assert.deepEqual(buildFigures(input.monster, build.runes.map((picked) => ({ rune: runesById.get(picked.runeId), mainValue: picked.mainValue, lines: picked.lines })), input.requirements),
      build.figures, `${context}: buildFigures disagrees with the search`);
    if (input.requirements.alwaysCrits && !input.requirements.leads?.atk) {
      /* Every hit a crit, written out: ATK × (1 + CRI Dmg). An Attack lead reaches
         DMG and not the ATK shown, so that copy is held by the sheet above instead. */
      const [, atk, , , , criDmg] = build.figures;
      assert.equal(build.figures[figures.indexOf('dmg')], Math.floor(atk * (1 + criDmg / 100)), `${context}: Always crits did not count a certain crit`);
      alwaysCritting += 1;
    }

    /* A sync that re-sent the same account: new objects, nothing changed. */
    const resent = new Map(input.runes.map((rune) => [rune.id, { ...rune, subProperties: rune.subProperties.map((line) => ({ ...line })) }]));
    const same = reread(build, resent);
    assert.deepEqual(same.figures, build.figures, `${context}: re-reading an unchanged account changed a figure`);
    assert.deepEqual(same.runes.map((picked) => [picked.gemmedAt, picked.groundAt, picked.moves]),
      build.runes.map((picked) => [picked.gemmedAt, picked.groundAt, picked.moves]), `${context}: re-reading an unchanged account changed the work`);
    assert.deepEqual(issues(same), [], `${context}: an unchanged account stood in a build's way`);
    assert.deepEqual(same.short, [], `${context}: an unchanged account missed a target`);

    if (build.runes.some((picked) => picked.gemmedAt >= 0 || picked.groundAt.length > 0)) withWork += 1;
    /* The player did everything the build asks: every rune on the monster, every Gem
       and stone applied at the value the search assumed. */
    const done = new Map(resent);
    for (const picked of build.runes) {
      const rune = runesById.get(picked.runeId);
      done.set(rune.id, { ...rune, mainValue: rune.mainValue, occupiedId: input.unitId, subProperties: picked.lines.map((line) => ({ ...line })) });
    }
    const followed = reread(build, done);
    assert.deepEqual(followed.figures, build.figures, `${context}: a build followed to the letter changed its figures`);
    assert.equal(followed.moves, 0, `${context}: a build followed to the letter still moves a rune`);
    assert.ok(followed.runes.every((picked) => picked.gemmedAt === -1 && picked.groundAt.length === 0),
      `${context}: a build followed to the letter still lists work`);
    assert.deepEqual(issues(followed), [], `${context}: a build followed to the letter is in its own way`);

    /* The first rune sold: no figures, and that slot says why. */
    const first = build.runes[0];
    const sold = new Map(resent);
    sold.delete(first.runeId);
    const afterSale = reread(build, sold);
    assert.equal(afterSale.figures, null, `${context}: a build with a sold rune still has figures`);
    assert.deepEqual(issues(afterSale), [`${first.slot}:gone`], `${context}: a sold rune was not named`);

    /* A rune that has to move, locked where it is: the build cannot take it. */
    const moving = build.runes.find((picked) => picked.moves && !picked.locked);
    if (moving) {
      const lockedAway = reread(build, resent, { locks: { ...input.locks, [moving.runeId]: 'locked' } });
      assert.deepEqual(issues(lockedAway), [`${moving.slot}:locked-away`], `${context}: a rune locked elsewhere was not named`);
      lockedAwayChecked += 1;
    }

    /* A rune excluded from this monster since the search: the build cannot take it. */
    const excludable = build.runes.find((picked) => !picked.locked);
    if (excludable) {
      const excluded = reread(build, resent, { locks: { ...input.locks, [excludable.runeId]: 'excluded' } });
      assert.deepEqual(issues(excluded), [`${excludable.slot}:excluded`], `${context}: an excluded rune was not named`);
    }

    /* Another rune locked into a slot on this monster: that slot is taken. */
    const intruder = input.runes.find((rune) => !build.runes.some((picked) => picked.runeId === rune.id)
      && !build.runes.some((picked) => picked.locked && picked.slot === rune.slot));
    if (intruder) {
      const taken = new Map(resent);
      taken.set(intruder.id, { ...runesById.get(intruder.id), occupiedId: input.unitId });
      const slotTaken = reread(build, taken, { locks: { ...input.locks, [intruder.id]: 'locked' } });
      assert.ok(issues(slotTaken).includes(`${intruder.slot}:slot-taken`), `${context}: a slot taken by a lock was not named`);
    }

    /* The items still to be spent, spent elsewhere: every slot that needed them says so. */
    const spending = build.runes.filter((picked) => picked.spends.length > 0);
    if (spending.length > 0) {
      const emptied = new Map([...itemsById].filter(([id]) => !spending.some((picked) => picked.spends.includes(id))));
      const noItems = reread(build, resent, { items: emptied });
      assert.deepEqual(issues(noItems), spending.map((picked) => `${picked.slot}:items`), `${context}: missing items were not named`);
      itemsChecked += 1;
    }

    /* A Gem put on another line than the one planned: a rune holds one, so the planned Gem is off. */
    const gemmed = build.runes.find((picked) => picked.gemmedAt >= 0 && !picked.locked);
    if (gemmed) {
      const rune = runesById.get(gemmed.runeId);
      const other = rune.subProperties.findIndex((line, at) => at !== gemmed.gemmedAt);
      const elsewhere = new Map(resent);
      elsewhere.set(rune.id, { ...rune, subProperties: rune.subProperties.map((line, at) => (at === other ? { ...line, gemmed: true } : { ...line })) });
      const offPlan = reread(build, elsewhere);
      assert.equal(offPlan.runes.find((picked) => picked.runeId === rune.id).gemmedAt, -1, `${context}: a second Gem was still planned on one rune`);
    }
  }
  checkedRows += expected.length;
  if (expected.length === 0) emptyTables += 1;
}

/* Held items reach only the runes their lineage fits. Two Ancient runes of different
   sets once shared one cached supply, so the second was offered the first one's
   Ancient stacks; an ordinary or Immemorial stack must never reach either. */
{
  const base = scenario(0);
  const spdRune = (id, setId, ancient) => ({
    id, setId, setName: '', slot: 1, stars: 6, ancient, defaultGrade: 'Legend', level: 15,
    mainStatId: 3, mainValue: 160, prefixStatId: null, prefixValue: 0,
    subProperties: [8, 4, 9, 10].map((statId) => ({ statId, value: 6, gemmed: false, grind: 0 })),
    occupiedId: null, obtainedOrder: Number(id),
  });
  const stone = (id, lineage, setId) => ({
    id, kind: 'grindstone', lineage, setId, setName: null, statId: 8, statName: 'SPD', grade: 'Legend', amount: 1, range: undefined,
  });
  const craftItems = [stone('1', 'ancient', 13), stone('2', 'ancient', 3), stone('3', 'standard', 13), stone('4', 'immemorial', null)];
  const runes = [spdRune('11', 13, true), spdRune('12', 3, true), spdRune('13', 13, false)];
  const input = {
    ...base, runes, locks: {}, craftItems,
    requirements: { ...base.requirements, builds: [], allowBroken: true, targets: {}, ceilings: {}, rankBy: 'spd' },
    settings: { ...base.settings, gems: 'none', grinds: 'owned', runesOnOtherMonsters: true, allowImmemorial: true },
  };
  const expectedStones = { 11: ['1'], 12: ['2'], 13: ['3', '4'] };
  const candidates = prepareRuneOptimization(input, { reduce: false }).slots[0];
  for (const rune of runes) {
    const spent = new Set(candidates.filter((candidate) => candidate.runeId === rune.id)
      .flatMap((candidate) => candidate.stock.map((entry) => craftItems[entry].id)));
    assert.ok([...spent].every((id) => expectedStones[rune.id].includes(id)),
      `rune ${rune.id} was offered stones ${[...spent]} outside its lineage and set`);
    assert.ok(spent.size > 0, `rune ${rune.id} was offered none of its own stones`);
  }
}

/* Tight endpoints exercise every figure, including percentage/flat rounding and
   composites. A second figure supplies the rank, so a ceiling is not just a cap
   on the objective. The comparison reads actual sheets, not search bounds. */
let intervalTables = 0;
/* A CRI Rate range names the copy's own CRI Rate. A 33-point crit lead and element
   advantage reach the DMG it deals and never the range, so 67–69 asks the runes for
   67–69 whatever the fight adds — and ranked by DMG, the lead is seen to count
   where it belongs. */
for (const bonuses of [
  { alwaysElementAdvantage: false, leads: { criRate: 33 }, seed: 33 },
  { alwaysElementAdvantage: true, leads: { criRate: 33 }, seed: 48 },
]) {
  const { seed, ...conditions } = bonuses;
  const input = scenarioGenerator(20261025 + seed, [3, 3]).scenario(0);
  input.locks = {}; input.spared = [];
  Object.assign(input.requirements, {
    builds: [], slotMains: { slot2: [], slot4: [], slot6: [] }, allowBroken: true,
    alwaysCrits: false, ...conditions, targets: { criRate: 67 }, ceilings: { criRate: 69 }, rankBy: 'dmg',
  });
  Object.assign(input.settings, { gems: 'none', grinds: 'none', runesOnOtherMonsters: true });
  const criRate = figures.indexOf('criRate');
  assert.equal(targetFloors(input.requirements)[criRate], 67);
  assert.equal(targetCeilings(input.requirements)[criRate], 69);
  const problem = prepareRuneOptimization(input);
  const result = searchRuneBuilds(problem);
  assert.ok(result.complete, 'the CRI Rate interval search timed out');
  assert.deepEqual(result.builds.map((build) => ({ value: build.figures[problem.rank], moves: build.moves })),
    bruteForce(input), 'the 67–69 CRI Rate interval disagrees with the stat sheets');
  assert.ok(result.builds.every((build) => build.figures[criRate] >= 67 && build.figures[criRate] <= 69),
    'a crit lead or element advantage satisfied a CRI Rate range the copy\'s own CRI Rate does not');
  intervalTables += 1;
  const open = { ...input, requirements: { ...input.requirements, targets: {}, ceilings: {} } };
  const anchor = searchRuneBuilds(prepareRuneOptimization(open)).builds[0];
  assert.ok(anchor, 'a populated CRI Rate interval needs a build');
  const ownRate = anchor.figures[criRate];
  input.requirements.targets = { criRate: ownRate };
  input.requirements.ceilings = { criRate: ownRate };
  const exact = prepareRuneOptimization(input);
  const populated = searchRuneBuilds(exact);
  assert.ok(populated.builds.length > 0, 'the fight must not move a CRI Rate build outside its own interval');
  assert.deepEqual(populated.builds.map((build) => ({ value: build.figures[exact.rank], moves: build.moves })),
    bruteForce(input), 'the populated CRI Rate interval disagrees with the stat sheets');
  intervalTables += 1;
}
/* A ceiling on a stat the copy leads with: the search caps the stat at the ceiling
   while bounding a composite, and the composite reads the stat with its lead, which
   may stand above the ceiling by as much as the lead adds. A bound that capped the
   led stat at the ceiling itself would prune the best builds. The ceilings sit at
   the open table's own figures, so each one binds. */
for (const [index, { leads, capped, rankBy }] of [
  { leads: { hp: 30, def: 20 }, capped: ['hp', 'def'], rankBy: 'ehp' },
  { leads: { atk: 33, criRate: 19 }, capped: ['atk'], rankBy: 'dmg' },
].entries()) {
  const input = scenarioGenerator(20261108 + index, [3, 3]).scenario(0);
  input.locks = {}; input.spared = [];
  Object.assign(input.requirements, {
    builds: [], slotMains: { slot2: [], slot4: [], slot6: [] }, allowBroken: true,
    alwaysCrits: false, alwaysElementAdvantage: false, leads, targets: {}, ceilings: {}, rankBy,
  });
  Object.assign(input.settings, { gems: 'none', grinds: 'none', runesOnOtherMonsters: true, resultCount: 3 });
  const open = searchRuneBuilds(prepareRuneOptimization(input)).builds;
  assert.ok(open.length > 1, 'a led ceiling needs builds to bind against');
  const middle = open[Math.floor(open.length / 2)];
  input.requirements.ceilings = Object.fromEntries(capped.map((key) => [key, middle.figures[figures.indexOf(key)]]));
  const problem = prepareRuneOptimization(input);
  const result = searchRuneBuilds(problem);
  assert.ok(result.complete && result.builds.length > 0, 'a led ceiling search found nothing');
  assert.deepEqual(result.builds.map((build) => ({ value: build.figures[problem.rank], moves: build.moves })),
    bruteForce(input), `a ceiling on a led ${capped.join(' and ')} disagrees with the stat sheets`);
  intervalTables += 1;
}for (let index = 0; index < figures.length; index += 1) {
  const input = scenarioGenerator(20261004 + index, [3, 3]).scenario(index);
  input.locks = {}; input.spared = [];
  Object.assign(input.requirements, {
    builds: [], slotMains: { slot2: [], slot4: [], slot6: [] }, allowBroken: true,
    allowIntangible: true, alwaysCrits: false, alwaysElementAdvantage: false, leads: {},
    targets: {}, ceilings: {}, rankBy: figures[(index + 1) % figures.length],
  });
  Object.assign(input.settings, { gems: 'none', grinds: 'none', runesOnOtherMonsters: true });
  const anchor = searchRuneBuilds(prepareRuneOptimization(input)).builds[0];
  assert.ok(anchor, `interval ${figures[index]} needs a feasible anchor`);
  const center = anchor.figures[index];
  for (const limits of [
    { targets: { [figures[index]]: center }, ceilings: { [figures[index]]: center } },
    { targets: { [figures[index]]: center - 1 }, ceilings: { [figures[index]]: center + 1 } },
    { targets: { [figures[index]]: center + 1 }, ceilings: { [figures[index]]: center } },
    { targets: {}, ceilings: { [figures[index]]: -1 } },
    { targets: {}, ceilings: Object.fromEntries(figures.map((key, at) => [key, anchor.figures[at]])) },
  ]) {
    Object.assign(input.requirements, limits);
    const problem = prepareRuneOptimization(input);
    const result = searchRuneBuilds(problem);
    assert.ok(result.complete, `interval ${figures[index]} timed out`);
    assert.deepEqual(result.builds.map((build) => ({ value: build.figures[problem.rank], moves: build.moves })),
      bruteForce(input), `interval ${figures[index]} lost a build at a tight or contradictory endpoint`);
    intervalTables += 1;
  }
}

/* Four fixed slots leave wide tail groups, so the interval boxes really split.
   All runes share a set, while the two free slots vary both flat and percentage
   properties; a scalar ordering of rounded HP or DMG would be unsafe here. */
for (let index = 0; index < figures.length; index += 1) {
  const input = scenarioGenerator(20261015 + index, [20, 20]).scenario(0);
  input.locks = {}; input.spared = [];
  input.runes = input.runes.filter((rune, at, all) => rune.slot >= 5
    || all.findIndex((other) => other.slot === rune.slot) === at)
    .map((rune) => ({ ...rune, setId: 1, occupiedId: null }));
  Object.assign(input.requirements, {
    builds: [], slotMains: { slot2: [], slot4: [], slot6: [] }, allowBroken: true,
    allowIntangible: false, alwaysCrits: false, alwaysElementAdvantage: false, leads: {},
    targets: {}, ceilings: {}, rankBy: figures[(index + 1) % figures.length],
  });
  Object.assign(input.settings, { gems: 'none', grinds: 'none', depth: 'complete' });
  const anchor = searchRuneBuilds(prepareRuneOptimization(input, { reduce: false })).builds[0];
  assert.ok(anchor, `tail interval ${figures[index]} needs a feasible anchor`);
  input.requirements.targets = { [figures[index]]: anchor.figures[index] - 1 };
  input.requirements.ceilings = { [figures[index]]: anchor.figures[index] + 1 };
  const problem = prepareRuneOptimization(input, { reduce: false });
  const result = searchRuneBuilds(problem);
  const original = searchRuneBuilds(problem, 0, 1, { pruneCeilings: false });
  assert.ok(result.complete && original.complete, `tail interval ${figures[index]} timed out`);
  assert.deepEqual(result.builds, original.builds, `tail interval ${figures[index]} changed rows or ties`);
  assert.deepEqual(result.builds.map((build) => ({ value: build.figures[problem.rank], moves: build.moves })),
    bruteForce(input), `tail interval ${figures[index]} differs from the actual stat sheets`);
  intervalTables += 1;
}

/* A fixed pool makes unnecessary work a reproducible count rather than a timing
   threshold that depends on the machine. Both paths must finish and keep the
   same physical builds, crafting plans, figures and tie order. */
const intervalInput = scenarioGenerator(20260930, [10, 10]).scenario(0);
intervalInput.locks = {}; intervalInput.spared = [];
Object.assign(intervalInput.requirements, {
  builds: [], slotMains: { slot2: [], slot4: [], slot6: [] }, allowBroken: true,
  allowIntangible: false, alwaysCrits: false, alwaysElementAdvantage: false, leads: {},
  rankBy: 'spd', targets: { spd: 120 }, ceilings: { spd: 140 },
});
Object.assign(intervalInput.settings, {
  gems: 'none', grinds: 'theoretical', runesOnOtherMonsters: true, unfinishedAtMaximum: true,
  depth: 'complete', resultCount: 5,
});
const intervalProblem = prepareRuneOptimization(intervalInput);
const noRunes = searchRuneBuilds(prepareRuneOptimization({ ...intervalInput, runes: [] }));
assert.ok(noRunes.complete && noRunes.builds.length === 0, 'an empty capped pool must finish without builds');
const beforeInterval = searchRuneBuilds(intervalProblem, 0, 1, { pruneCeilings: false });
const afterInterval = searchRuneBuilds(intervalProblem);
assert.ok(beforeInterval.complete && afterInterval.complete, 'interval work comparison timed out');
assert.deepEqual(afterInterval.builds, beforeInterval.builds, 'interval work reduction changed the top builds');
assert.ok(afterInterval.combinations < beforeInterval.combinations / 10,
  `interval work regressed: ${afterInterval.combinations} vs ${beforeInterval.combinations} full combinations`);
console.log(`PASS: ${intervalTables} tight interval tables match brute force; interval pruning reduces the fixed`
  + ` SPD pool from ${beforeInterval.combinations} to ${afterInterval.combinations} full combinations with identical rows.`);

assert.ok(checkedRows > scenarios, 'too few builds were compared to prove anything');

let hybridPools = 0;
for (const [index, input] of craftedRangeScenarios().entries()) {
  const anchorProblem = prepareRuneOptimization(input, { reduce: false });
  const anchor = searchRuneBuilds(anchorProblem).builds[0];
  assert.ok(anchor, `crafted range ${index} needs a feasible anchor`);
  const stat = ['spd', 'atk', 'hp', 'def', 'dmg', 'ehp'][index % 6];
  const center = anchor.figures[figures.indexOf(stat)];
  for (const limits of [
    { targets: { [stat]: center - 1 }, ceilings: { [stat]: center + 1 } },
    { targets: {}, ceilings: Object.fromEntries(figures.map((key) => [key, 1e12])) },
  ]) {
    Object.assign(input.requirements, limits);
    const originalRequirements = JSON.stringify(input.requirements);
    const problem = prepareRuneOptimization(input);
    const answer = searchRuneBuilds(problem);
    const expanded = searchRuneBuilds(problem, 0, 1, { allocateCraft: false });
    const reading = (table) => table.builds.map((build) => ({ value: build.figures[problem.rank], moves: build.moves }));
    assert.ok(answer.complete && expanded.complete, `crafted range ${index}: both searches must finish`);
    assert.deepEqual(reading(answer), bruteForce(input), `crafted range ${index}: hybrid allocation lost an oracle row`);
    assert.deepEqual(reading(answer), reading(expanded), `crafted range ${index}: allocation changed the ranked scores`);
    if (stat === 'spd' && Object.keys(limits.ceilings).length === 1 && problem.craft) hybridPools += 1;
    if (Object.keys(limits.ceilings).length === figures.length) assert.ok(problem.ceilings.every(Number.isNaN),
      'provably loose ceilings must not retain constrained work');
    assert.equal(JSON.stringify(input.requirements), originalRequirements, 'range proofs changed saved requirements');
    for (const build of answer.builds) {
      const compared = sheet(input, build.picks.map((pick, slot) => problem.slots[slot][pick]));
      const spent = new Map();
      build.picks.forEach((pick, slot) => problem.slots[slot][pick].stock.forEach((at) => spent.set(at, (spent.get(at) ?? 0) + 1)));
      for (const [at, count] of spent) assert.ok(count <= problem.stock[at].amount, 'hybrid allocation overspent a fixed or deferred item');
      for (const [key, ceiling] of ceilingsOf(input)) assert.ok(compared[figures.indexOf(key)] <= ceiling,
        `crafted range ${index}: a resolved build exceeds ${key}`);
    }
    const copied = structuredClone(problem);
    assert.deepEqual(searchRuneBuilds(copied).builds, answer.builds, 'cloning hybrid recipes changed the answer');
    const split = mergeBuildResults([0, 1, 2].map((part) => searchRuneBuilds(problem, part, 3)), problem.rank, problem.resultCount);
    assert.deepEqual(split.builds, answer.builds, 'splitting hybrid recipes changed rows or tie order');
  }
}
assert.ok(hybridPools > 0, 'no active SPD ceiling exercised deferred non-SPD craft work');
console.log('PASS: 36 rich crafted range tables match unreduced brute force, full item enumeration, cloning and split search; fixed and deferred stacks respect supply and loose limits leave the saved choices intact.');
// Accounts after 160 deliberately disable crafting, locks and priority exclusions.
const personalScenarios = Math.min(scenarios, 160);
assert.ok(withWork > personalScenarios / 4, `only ${withWork} builds had work to follow`);
assert.ok(refusedMidway > scenarios / 4, 'too few searches lost their card midway to prove the processor finishes');
assert.ok(lockedAwayChecked > personalScenarios / 4, `only ${lockedAwayChecked} builds had a rune to lock away`);
assert.ok(itemsChecked >= personalScenarios / 10, `only ${itemsChecked} builds spent a held item`);
assert.ok(sparedChecked > personalScenarios / 10, `only ${sparedChecked} searches had a higher-priority monster's runes to leave alone`);
assert.ok(ownKeptChecked > scenarios / 20, `only ${ownKeptChecked} searches took nothing from the preset while the copy carried runes of its own`);
assert.ok(alwaysCritting > scenarios / 10, `only ${alwaysCritting} builds were for a monster that always crits`);
console.log(`PASS: ${scenarios} random accounts, ${checkedRows} ranked builds — the search, whole and split three ways,`
  + ` and resource matching on ${allocatedCases} pools,`
  + ` matches brute force on every row (${emptyTables} tables were rightly empty; ${alwaysCritting} builds always crit); in passes it matches the`
  + ` processor pick for pick, and ${refusedMidway} searches finished on the processor after the card refused;`
  + ` no build spent a held Gem or Grindstone more often than the account holds it (${spentChecked} stacks checked);`
  + ` every build read again against a re-sent account and a followed one (${withWork} with Gems or stones) kept its figures,`
  + ` and a sold rune, a lock (${lockedAwayChecked}) and spent items (${itemsChecked}) were each named on the slot they block.`);

/* With the gemmed stat held, a gemmed rune's Gem lands only on the property that line
   already carries, and every rune without one is offered exactly as with it allowed.
   The same accounts with the change allowed do swap those properties, so the refusal
   was one; and some re-roll the held property, so a same-stat Gem was not lost too. */
let statChangeRefused = 0;
let sameStatKept = 0;
for (let index = 0; index < 40; index += 1) {
  const input = scenario(index);
  if (input.settings.gems === 'none') continue;
  input.runes = input.runes.map((rune, at) => (at % 2 ? rune
    : { ...rune, subProperties: rune.subProperties.map((line, lineAt) => (lineAt === 0 ? { ...line, gemmed: true } : line)) }));
  const heldStat = new Map(input.runes.flatMap((rune) => rune.subProperties.filter((line) => line.gemmed).map((line) => [rune.id, line.statId])));
  const offered = (allowGemStatChange) => prepareRuneOptimization({ ...input, settings: { ...input.settings, allowGemStatChange } }, { reduce: false }).slots.flat();
  const changes = (candidate) => heldStat.has(candidate.runeId) && candidate.gemmedAt >= 0
    && candidate.lines[candidate.gemmedAt].statId !== heldStat.get(candidate.runeId);
  const rerolls = (candidate) => heldStat.has(candidate.runeId) && candidate.gemmedAt >= 0 && !changes(candidate);
  const refused = offered(false);
  const allowed = offered(true);
  assert.ok(!refused.some(changes), `scenario ${index}: a gemmed line changed property although the gemmed stat is held`);
  const reading = (candidate) => `${candidate.runeId}|${candidate.gemmedAt}|${JSON.stringify(candidate.lines)}`;
  const untouched = (candidates) => candidates.filter((candidate) => !changes(candidate)).map(reading).sort();
  assert.deepEqual(untouched(refused), untouched(allowed), `scenario ${index}: holding the gemmed stat changed more than the property swaps`);
  if (allowed.some(changes)) statChangeRefused += 1;
  if (refused.some(rerolls)) sameStatKept += 1;
}
assert.ok(statChangeRefused > 5, `only ${statChangeRefused} accounts had a gemmed property to hold`);
assert.ok(sameStatKept > 0, 'no account re-rolled a held gemmed property');
console.log(`PASS: holding the gemmed stat refused property swaps in ${statChangeRefused} accounts, kept same-property re-rolls in ${sameStatKept} and touched nothing else.`);

// Filled slots stay untouched, including their craft work and unfinished mains.
for (const filled of [0, 1, 3, 5, 6]) {
  const input = scenario(2);
  input.locks = {}; input.spared = [];
  const occupied = new Set();
  input.runes = input.runes.map((rune) => {
    const keep = rune.slot <= filled && !occupied.has(rune.slot);
    if (keep) occupied.add(rune.slot);
    return { ...rune, occupiedId: keep ? input.unitId : null };
  });
  input.requirements = { ...input.requirements, builds: [], allowBroken: true,
    allowIntangible: true, slotMains: { slot2: [], slot4: [], slot6: [] }, targets: {}, ceilings: {} };
  input.settings = { ...input.settings, fillEmptySlotsOnly: true, limitChanges: false,
    unfinishedAtMaximum: true, gems: 'theoretical', grinds: 'theoretical' };
  const raw = prepareRuneOptimization(input, { reduce: false });
  for (let slot = 0; slot < filled; slot += 1) {
    const engraved = input.runes.find((rune) => rune.slot === slot + 1 && rune.occupiedId === input.unitId);
    assert.equal(raw.slots[slot].length, 1);
    const picked = raw.slots[slot][0];
    assert.equal(picked.runeId, engraved.id);
    assert.equal(picked.mainValue, engraved.mainValue);
    assert.deepEqual(picked.lines, engraved.subProperties);
    assert.equal(picked.gemmedAt, -1); assert.deepEqual(picked.groundAt, []);
  }
  // No crafting keeps the independent exhaustive oracle small at both extremes.
  input.settings.gems = 'none'; input.settings.grinds = 'none';
  const actual = searchRuneBuilds(prepareRuneOptimization(input));
  const expected = bruteForce(input);
  assert.deepEqual(actual.builds.map((build) => ({ value: build.figures[figures.indexOf(input.requirements.rankBy)], moves: build.moves })), expected);
  for (const build of actual.builds) assert.equal(build.moves, 6 - filled);
}
const flatExpected = { 1: [580, 790, 1000, 1240, 1530, 1800], 3: [39, 53, 67, 82, 99, 118], 5: [39, 53, 67, 82, 99, 118] };
for (let stars = 1; stars <= 6; stars += 1) {
  for (const level of [0, 12, 13, 14, 15]) {
    const input = scenario(2);
    input.locks = {}; input.spared = [];
    input.requirements = { ...input.requirements, builds: [], allowBroken: true, allowIntangible: true,
      slotMains: { slot2: [], slot4: [], slot6: [] }, targets: {}, ceilings: {} };
    input.settings = { ...input.settings, gems: 'none', grinds: 'none', limitChanges: false,
      unfinishedAtMaximum: true, oddSlotsAtTwelve: true };
    input.runes = input.runes.map((rune) => ({ ...rune, stars, level, occupiedId: null,
      mainValue: level <= 12 ? 1 : 123 }));
    const problem = prepareRuneOptimization(input, { reduce: false });
    for (const slot of [1, 3, 5]) for (const candidate of problem.slots[slot - 1]) {
      const rune = input.runes.find((rune) => rune.id === candidate.runeId);
      assert.equal(candidate.mainValue, level <= 12 ? flatExpected[rune.mainStatId][stars - 1] : 123);
    }
    input.settings.unfinishedAtMaximum = false;
    for (const candidate of prepareRuneOptimization(input, { reduce: false }).slots.flat()) {
      assert.equal(candidate.mainValue, level <= 12 ? 1 : 123);
    }
  }
}
console.log('PASS: empty-slot selection preserves every occupied rune; +12 flat mains cover all six star classes, unfinished and completed levels, and the disabled adjustment.');

for (let index = 0; index < 36; index += 1) {
  const input = affordableScenario(index);
  input.settings.limitChanges = true;
  input.settings.maxChanges = index % 6 + 1;
  input.settings.oddSlotsAtTwelve = index % 2 === 0;
  const problem = prepareRuneOptimization(input);
  const whole = searchRuneBuilds(problem);
  const expected = bruteForce(input);
  assert.deepEqual(whole.builds.map((build) => ({ value: build.figures[problem.rank], moves: build.moves })), expected);
  const passed = await searchRuneBuildsInPasses(problem, everyPairCard(40), { blocks: 8, pairs: 500 });
  assert.deepEqual(passed.outcome.builds, whole.builds);
  const parts = [0, 1, 2].map((part) => searchRuneBuilds(problem, part, 3));
  assert.deepEqual(mergeBuildResults(parts, problem.rank, problem.resultCount).builds, whole.builds);
}
console.log('PASS: 36 change-limited searches match exhaustive enumeration, split workers and card passes for limits 1–6.');

{
  const input = affordableScenario(2);
  input.locks = {}; input.spared = [];
  input.requirements = { ...input.requirements, builds: [], allowBroken: true, allowIntangible: true,
    slotMains: { slot2: [], slot4: [], slot6: [] }, targets: {}, ceilings: {} };
  input.settings = { ...input.settings, fillEmptySlotsOnly: true, gems: 'none', grinds: 'none' };
  const occupied = new Set();
  input.runes = input.runes.map((rune) => {
    const first = !occupied.has(rune.slot); occupied.add(rune.slot);
    return { ...rune, setId: 1, occupiedId: first ? input.unitId : null };
  });
  const problem = prepareRuneOptimization(input);
  const answer = searchRuneBuilds(problem).builds[0];
  assert.ok(answer);
  const runes = answer.picks.map((pick, slot) => ({ ...problem.slots[slot][pick], spends: [] }));
  const build = { ...answer, runes };
  const before = new Map(input.runes.map((rune) => [rune.id, rune]));
  const now = new Map([...before].map(([id, rune]) => [id, { ...rune,
    occupiedId: rune.slot <= 2 ? null : rune.occupiedId }]));
  const context = { unitId: input.unitId, monster: input.monster, requirements: input.requirements,
    settings: { ...input.settings, limitChanges: true, maxChanges: 1 }, spared: [],
    before: { runes: before, items: new Map() }, now: { runes: now, items: new Map(), locks: {} } };
  const limited = currentBuilds([build], context)[0];
  assert.equal(limited.moves, 2);
  assert.equal(limited.runes.filter((rune) => rune.issue?.kind === 'changes-limit').length, 2);
  const replacement = [...now.values()].find((rune) => rune.slot === 1 && rune.id !== runes[0].runeId);
  assert.ok(replacement);
  now.set(replacement.id, { ...replacement, occupiedId: input.unitId });
  context.settings.limitChanges = false;
  assert.equal(currentBuilds([build], context)[0].runes[0].issue?.kind, 'slot-filled');
}
console.log('PASS: refreshed builds identify newly occupied slots and changes beyond their saved limit.');

{
  const input = scenario(0);
  const base = { hp: 10000, atk: 800, def: 600, spd: 100, criRate: 15, criDmg: 50, res: 15, acc: 0 };
  const role = defaultRuneRoles().find((role) => role.id === 'slow-dd');
  const rune = { ...input.runes.find((rune) => rune.slot === 2), setId: 4, setName: 'Blade',
    mainStatId: 4, mainValue: 63, prefixStatId: null, prefixValue: 0, level: 15, occupiedId: null,
    subProperties: [[2, 6], [5, 34], [9, 17], [11, 6]].map(([statId, value]) => ({ statId, value, grind: 0, gemmed: false })) };
  const prices = gemRemovalPrices([{ role, base }])(rune);
  assert.ok(prices[0] > prices[3], 'HP must be worth keeping for Slow DD');
  assert.ok(prices[1] > prices[3], 'DEF must be worth keeping for Slow DD');
  assert.equal(gemRemovalPrices([])(rune), undefined, 'cleared roles must not acquire shipped replacements');
  assert.equal(gemRemovalPrices([{ role: { ...role, targets: {} }, base }])(rune), undefined);
  input.runes = [...input.runes.filter((entry) => entry.slot !== 2), rune]; input.locks = {}; input.spared = [];
  input.requirements = { ...input.requirements, builds: [], allowBroken: true, allowIntangible: false,
    slotMains: { slot2: [], slot4: [], slot6: [] }, rankBy: 'dmg', targets: {}, ceilings: {} };
  input.settings = { ...input.settings, depth: 'complete', gems: 'theoretical', grinds: 'none', fillEmptySlotsOnly: false };
  input.gemPreservationRoles = [{ role, base }];
  const gemmed = (problem) => problem.slots[1].filter((candidate) => candidate.gemmedAt >= 0);
  assert.ok(gemmed(prepareRuneOptimization(input)).some((candidate) => candidate.lines[3].statId === 10));
  assert.ok(gemmed(prepareRuneOptimization(input)).every((candidate) => candidate.gemmedAt === 3), 'tied plans must replace RES');
  input.requirements.targets = { res: 100 };
  assert.ok(gemmed(prepareRuneOptimization(input, { reduce: false })).some((candidate) => candidate.gemmedAt !== 3),
    'a monster target must retain alternatives that the rune role alone would discard');
  rune.subProperties[0].gemmed = true;
  input.requirements.targets = {};
  assert.ok(gemmed(prepareRuneOptimization(input)).every((candidate) => candidate.gemmedAt === 0),
    'the existing converted line must remain the only legal replacement');
}
console.log('PASS: tied Gem plans preserve HP and DEF for Slow DD, respect monster targets and converted lines, and tolerate empty roles.');
