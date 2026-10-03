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
import {
  calculateMonsterTotals, intangibleSetId, monsterTargetFigures, targetFigureKeys, unliftedFigures,
} from '../app/lib/monster-stats.ts';
import { monsterStatTargetKeys } from '../app/lib/monster-preferences.ts';
import { buildFigures, prepareRuneOptimization } from '../app/lib/rune-optimization-problem.ts';
import { currentBuilds } from '../app/lib/rune-optimization-refresh.ts';
import {
  mergeBuildResults, searchRuneBuilds, searchRuneBuildsInPasses, searchRuneBuildsInSlices,
} from '../app/lib/rune-optimization-search.ts';
import { runeBuild } from '../app/lib/rune-set-pairs.ts';
import { runeSetId, runeSetPieceCount } from '../app/lib/rune-sets.ts';
import { scenarioGenerator } from './rune-optimization-scenarios.mjs';

const { scenario } = scenarioGenerator();
const figures = monsterStatTargetKeys;

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
  const shown = monsterTargetFigures(calculateMonsterTotals(record), input.requirements.alwaysCrits);
  return figures.map((key) => shown[key]);
}

/* The floors a build is held to, written out here rather than read from the search:
   a monster that always crits is never asked for CRI Rate. */
const floorsOf = (input) => Object.entries(input.requirements.targets)
  .filter(([key]) => !(input.requirements.alwaysCrits && key === 'criRate'));
const ceilingsOf = (input) => Object.entries(input.requirements.ceilings)
  .filter(([key]) => !(input.requirements.alwaysCrits && key === 'criRate'));

function oneShort(counts) {
  const short = [...counts.entries()].filter(([setId, count]) => setId !== intangibleSetId && runeSetPiecesById(setId) && count % runeSetPiecesById(setId) === runeSetPiecesById(setId) - 1);
  return short.length;
}

const piecesById = new Map(Object.entries(runeSetPieceCount).map(([name, pieces]) => [runeSetId(name), pieces]));
function runeSetPiecesById(setId) { return piecesById.get(setId); }

/* The set an Intangible completes: the one set a rune short, or none. */
function completedBy(counts) {
  const intangible = counts.get(intangibleSetId) ?? 0;
  const short = [...counts.entries()].filter(([setId, count]) => setId !== intangibleSetId && count % runeSetPiecesById(setId) === runeSetPiecesById(setId) - 1);
  return intangible > 0 && short.length === 1 ? short[0][0] : -1;
}

/* A build names the sets it must hold; whatever else is worn fills its free slots. */
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
      if (!input.requirements.allowBroken && !noBroken(counts)) return;
      const spent = new Map();
      for (const candidate of chosen) for (const entry of candidate.stock) spent.set(entry, (spent.get(entry) ?? 0) + 1);
      for (const [entry, count] of spent) if (count > problem.stock[entry].amount) return;
      const values = sheet(input, chosen);
      for (const [key, floor] of floorsOf(input)) if (values[figures.indexOf(key)] < floor) return;
      for (const [key, ceiling] of ceilingsOf(input)) if (values[figures.indexOf(key)] > ceiling) return;
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

const scenarios = Number(process.argv.find((arg) => arg.startsWith('--scenarios='))?.split('=')[1] ?? 160);
let checkedRows = 0;
let emptyTables = 0;
let refusedMidway = 0;
let spentChecked = 0;
/* Builds with a Gem or a stone still to apply, so the followed case is not only ever read on bare runes. */
let withWork = 0;
/* How often the rarer re-readings and Always crits were actually exercised. */
let lockedAwayChecked = 0;
let itemsChecked = 0;
let alwaysCritting = 0;
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
  let shared = -Infinity;
  const sharing = { sharedBar: () => shared, onBar: (value) => { shared = Math.max(shared, value); } };
  const sharedSplit = mergeBuildResults([0, 1, 2].map((part) => searchRuneBuilds(problem, part, 3, sharing)), problem.rank, problem.resultCount);
  shared = -Infinity;
  const sliced = mergeBuildResults(await Promise.all([0, 1, 2].map((part) => searchRuneBuildsInSlices(problem, part, 3, sharing))), problem.rank, problem.resultCount);
  const expected = bruteForce(input);
  /* The search ranks over a lifted CRI Rate where the monster always crits; the
     figures it reports are put back the way the worker puts them back. */
  const shownOf = (build) => unliftedFigures([...build.figures], problem.criticalRateLift);
  const reading = (table) => table.builds.map((build) => ({ value: shownOf(build)[problem.rank], moves: build.moves }));
  if (!input.requirements.allowImmemorial) {
    const immemorial = new Set(input.craftItems.flatMap((item, at) => (item.lineage === 'immemorial' ? [at] : [])));
    assert.ok(problem.slots.flat().every((candidate) => candidate.stock.every((entry) => !immemorial.has(entry))),
      'an Immemorial item was spent although the profile refuses them');
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
    figures: shownOf(build),
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
  /* One re-reading of a build against the account `runes`, the holds and the items. */
  const reread = (build, runes, { holds = input.holds, items = itemsById } = {}) => currentBuilds([build], {
    unitId: input.unitId, monster: input.monster, requirements: input.requirements, settings: input.settings,
    before: { runes: runesById, items: itemsById }, now: { runes, items, holds },
  })[0];
  const issues = (build) => build.runes.flatMap((picked) => (picked.issue ? [`${picked.slot}:${picked.issue.kind}`] : []));
  for (const build of found) {
    const chosen = build.picks.map((at, slot) => problem.slots[slot][at]);
    assert.deepEqual(build.figures, sheet(input, chosen), `${context}: a reported figure is not the stat sheet's`);
    assert.deepEqual(buildFigures(input.monster, build.runes.map((picked) => ({ rune: runesById.get(picked.runeId), mainValue: picked.mainValue, lines: picked.lines })), input.requirements.alwaysCrits),
      build.figures, `${context}: buildFigures disagrees with the search`);
    if (input.requirements.alwaysCrits) {
      /* Every hit a crit, written out: ATK × (1 + CRI Dmg). */
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
      const lockedAway = reread(build, resent, { holds: { ...input.holds, [moving.runeId]: { locked: true } } });
      assert.deepEqual(issues(lockedAway), [`${moving.slot}:locked-away`], `${context}: a rune locked elsewhere was not named`);
      lockedAwayChecked += 1;
    }

    /* Another rune locked into a slot on this monster: that slot is taken. */
    const intruder = input.runes.find((rune) => !build.runes.some((picked) => picked.runeId === rune.id)
      && !build.runes.some((picked) => picked.locked && picked.slot === rune.slot));
    if (intruder) {
      const taken = new Map(resent);
      taken.set(intruder.id, { ...runesById.get(intruder.id), occupiedId: input.unitId });
      const slotTaken = reread(build, taken, { holds: { ...input.holds, [intruder.id]: { locked: true } } });
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
    ...base, runes, holds: {}, craftItems,
    requirements: { ...base.requirements, builds: [], allowBroken: true, allowImmemorial: true, targets: {}, ceilings: {}, rankBy: 'spd' },
    settings: { ...base.settings, gems: 'none', grinds: 'owned', runesOnOtherMonsters: true },
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

assert.ok(checkedRows > scenarios, 'too few builds were compared to prove anything');
assert.ok(withWork > scenarios / 4, `only ${withWork} builds had work to follow`);
assert.ok(refusedMidway > scenarios / 4, 'too few searches lost their card midway to prove the processor finishes');
assert.ok(lockedAwayChecked > scenarios / 4, `only ${lockedAwayChecked} builds had a rune to lock away`);
assert.ok(itemsChecked > scenarios / 10, `only ${itemsChecked} builds spent a held item`);
assert.ok(alwaysCritting > scenarios / 10, `only ${alwaysCritting} builds were for a monster that always crits`);
console.log(`PASS: ${scenarios} random accounts, ${checkedRows} ranked builds — the search, whole and split three ways,`
  + ` matches brute force on every row (${emptyTables} tables were rightly empty; ${alwaysCritting} builds always crit); in passes it matches the`
  + ` processor pick for pick, and ${refusedMidway} searches finished on the processor after the card refused;`
  + ` no build spent a held Gem or Grindstone more often than the account holds it (${spentChecked} stacks checked);`
  + ` every build read again against a re-sent account and a followed one (${withWork} with Gems or stones) kept its figures,`
  + ` and a sold rune, a lock (${lockedAwayChecked}) and spent items (${itemsChecked}) were each named on the slot they block.`);
