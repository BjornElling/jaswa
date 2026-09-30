/**
 * **Rune Optimization, part two: the search (`RUNE-OPTIMIZATION.md` §6).**
 *
 * Six slots, one candidate each, and every combination that meets the stated
 * builds, targets and item stock ranked by one figure. Trying them all is out of the
 * question — five hundred runes a slot is 1.6 × 10¹⁶ combinations — so this is a
 * depth-first branch and bound:
 *
 * - **An upper bound at every node.** The slots still open can add at most the best
 *   each of them holds in each accumulator, and the sets at most what `setBonusBound`
 *   allows. Every figure rises with every accumulator, so the figures of that
 *   optimistic sum bound every build below the node. A node whose bound misses a
 *   target, or cannot beat the build currently last in the table, is not entered.
 * - **Sets are pruned as they are placed**, by `canStillSatisfy`, so a branch that
 *   can no longer become a stated build stops at the rune that ruined it.
 * - **Good builds come early.** Slots are searched fewest-candidates first and each
 *   slot best-first, so the table fills with strong builds quickly and the bar the
 *   bound is held to rises fast.
 *
 * All of it is exact: nothing here drops a build that could have made the table. The
 * one inexact step in the calculation is the depth's cut, which happens before this
 * and is reported. A search that runs out of time says so; its table is then the best
 * it had found.
 *
 * It is plain arithmetic over flat arrays with no allocation in the loop, because it
 * is the part a graphics card could take over, and the part that runs in parallel:
 * `part` and `parts` split the first open slot's candidates between workers, and the
 * tables they return are merged by `mergeBuildResults`.
 */
import {
  addSetBonuses, baseStatCount, effectSlotCount, figuresInto, intangibleCompletion, intangibleSetId,
  setIdBound, statSetBonuses, targetFigureCount, totalsInto,
} from './monster-stats';
import { canStillSatisfy, satisfiesBuild, setBonusBound } from './rune-optimization-problem';
import type { RuneOptimizationProblem } from './rune-optimization-problem';

/** One build the search found: a candidate index per slot (index 0 is slot 1), and its figures. */
export type FoundBuild = {
  picks: number[];
  figures: number[];
  moves: number;
};

export type SearchOutcome = {
  builds: FoundBuild[];
  /** `false` where the time limit stopped the search before it had looked everywhere. */
  complete: boolean;
  /** Combinations evaluated in full. */
  combinations: number;
  /** Partial combinations whose bound was checked. */
  nodes: number;
};

/**
 * The order every table of builds is kept in: the ranking figure, highest first;
 * then fewer runes to move; then the picks themselves, so two workers — or two runs —
 * order equal builds identically.
 */
export function compareFoundBuilds(rank: number) {
  return (left: FoundBuild, right: FoundBuild): number => {
    const figure = right.figures[rank] - left.figures[rank];
    if (figure !== 0) return figure;
    if (left.moves !== right.moves) return left.moves - right.moves;
    for (let at = 0; at < left.picks.length; at += 1) {
      if (left.picks[at] !== right.picks[at]) return left.picks[at] - right.picks[at];
    }
    return 0;
  };
}

export function mergeBuildResults<Build extends FoundBuild>(
  outcomes: ReadonlyArray<Omit<SearchOutcome, 'builds'> & { builds: Build[] }>, rank: number, count: number,
): Omit<SearchOutcome, 'builds'> & { builds: Build[] } {
  return {
    builds: outcomes.flatMap((outcome) => outcome.builds).sort(compareFoundBuilds(rank)).slice(0, count),
    complete: outcomes.every((outcome) => outcome.complete),
    combinations: outcomes.reduce((total, outcome) => total + outcome.combinations, 0),
    nodes: outcomes.reduce((total, outcome) => total + outcome.nodes, 0),
  };
}

export function searchRuneBuilds(
  problem: RuneOptimizationProblem,
  part = 0,
  parts = 1,
  onProgress?: (fraction: number) => void,
  now: () => number = () => performance.now(),
): SearchOutcome {
  const empty: SearchOutcome = { builds: [], complete: true, combinations: 0, nodes: 0 };
  if (problem.slots.some((slot) => slot.length === 0)) return empty;

  /* Fewest candidates first: a locked slot costs nothing at the top, and a narrow
     slot high in the tree multiplies the fewest branches. */
  const order = [0, 1, 2, 3, 4, 5].sort((left, right) => problem.slots[left].length - problem.slots[right].length || left - right);
  const depthCount = order.length;
  const splitDepth = order.findIndex((slot) => problem.slots[slot].length > 1);
  if (splitDepth === -1 && part !== 0) return empty;

  /* Everything the loop touches, packed flat per depth. */
  const counts = order.map((slot) => problem.slots[slot].length);
  const effects = order.map((slot) => {
    const packed = new Float64Array(problem.slots[slot].length * effectSlotCount);
    problem.slots[slot].forEach((candidate, at) => packed.set(candidate.effects, at * effectSlotCount));
    return packed;
  });
  const sets = order.map((slot) => Int32Array.from(problem.slots[slot], (candidate) => candidate.setId));
  const moves = order.map((slot) => Uint8Array.from(problem.slots[slot], (candidate) => (candidate.moves ? 1 : 0)));
  const spends = order.map((slot) => problem.slots[slot].map((candidate) => candidate.stock));

  /* suffix[d] is the most the slots from depth d onward can add, accumulator by
     accumulator. */
  const suffix = new Float64Array((depthCount + 1) * effectSlotCount);
  for (let depth = depthCount - 1; depth >= 0; depth -= 1) {
    for (let slot = 0; slot < effectSlotCount; slot += 1) {
      let best = -Infinity;
      for (let at = 0; at < counts[depth]; at += 1) best = Math.max(best, effects[depth][at * effectSlotCount + slot]);
      suffix[depth * effectSlotCount + slot] = suffix[(depth + 1) * effectSlotCount + slot] + best;
    }
  }
  const setBound = setBonusBound(problem.builds);

  const builds = problem.builds;
  const buildCount = builds?.length ?? 0;
  const targets = problem.targets;
  const targetIndexes = [...targets.keys()].filter((index) => Number.isFinite(targets[index]));
  const rank = problem.rank;
  const capacity = problem.resultCount;
  const stockLeft = Int32Array.from(problem.stock, (entry) => entry.amount);

  const accumulated = new Float64Array((depthCount + 1) * effectSlotCount);
  accumulated.set(problem.start, 0);
  const setCounts = new Int32Array(setIdBound);
  const picks = new Int32Array(depthCount);
  const bound = new Float64Array(effectSlotCount);
  const planned = new Float64Array(effectSlotCount);
  const planBonus = new Float64Array(effectSlotCount);
  const planCounts = new Int32Array(setIdBound);
  /* The stat sets a plan may complete: every one where some build leaves slots
     free or none is stated, and only the builds' own where every slot is spoken
     for. With no stat set in reach there is nothing to enumerate, and the one
     precomputed bound is exact enough. */
  const planSets = builds === null || builds.some((build) => build.broken)
    ? statSetBonuses
    : statSetBonuses.filter(([setId]) => builds.some((build) => build.needs.some((need) => need.setId === setId)));
  const boundBySets = planSets.length > 0;
  const finished = new Float64Array(effectSlotCount);
  const totals = new Float64Array(baseStatCount);
  const figures = new Float64Array(targetFigureCount);

  const table: FoundBuild[] = [];
  const ordered = compareFoundBuilds(rank);
  let bar = -Infinity;
  let combinations = 0;
  let nodes = 0;
  let stopped = false;
  let ticks = 0;
  const startedAt = now();
  let lastReport = startedAt;
  let splitDone = 0;
  const splitTotal = splitDepth === -1 ? 1 : Math.ceil((counts[splitDepth] - part) / parts);

  function meetsTargets(): boolean {
    for (const index of targetIndexes) if (figures[index] < targets[index]) return false;
    return true;
  }

  function spendable(list: readonly number[]): boolean {
    for (let at = 0; at < list.length; at += 1) {
      const entry = list[at];
      let needed = 0;
      for (let other = 0; other < list.length; other += 1) if (list[other] === entry) needed += 1;
      if (stockLeft[entry] < needed) return false;
    }
    return true;
  }

  function spend(list: readonly number[], direction: number) {
    for (let at = 0; at < list.length; at += 1) stockLeft[list[at]] -= direction;
  }

  function setsStillPossible(placed: number): boolean {
    if (builds === null) return true;
    for (let at = 0; at < buildCount; at += 1) if (canStillSatisfy(builds[at], setCounts, placed)) return true;
    return false;
  }

  function record() {
    let moved = 0;
    for (let depth = 0; depth < depthCount; depth += 1) moved += moves[depth][picks[depth]];
    const bySlot = new Array<number>(depthCount);
    for (let depth = 0; depth < depthCount; depth += 1) bySlot[order[depth]] = picks[depth];
    const found: FoundBuild = { picks: bySlot, figures: Array.from(figures), moves: moved };
    if (table.length >= capacity && ordered(found, table[table.length - 1]) >= 0) return;
    let at = table.length;
    while (at > 0 && ordered(found, table[at - 1]) < 0) at -= 1;
    table.splice(at, 0, found);
    if (table.length > capacity) table.pop();
    if (table.length >= capacity) bar = table[table.length - 1].figures[rank];
  }

  function leaf() {
    combinations += 1;
    const completes = intangibleCompletion(setCounts);
    /* Several sets one rune short and one Intangible: the game completes one of
       them and JASWA does not know which, so the combination is not offered. */
    if (completes === -2) return;
    if (builds !== null) {
      let met = false;
      for (let at = 0; at < buildCount && !met; at += 1) met = satisfiesBuild(builds[at], setCounts, completes);
      if (!met) return;
    }
    const base = depthCount * effectSlotCount;
    for (let slot = 0; slot < effectSlotCount; slot += 1) finished[slot] = accumulated[base + slot];
    addSetBonuses(setCounts, completes, finished);
    totalsInto(problem.base, finished, totals);
    figuresInto(totals, figures);
    if (!meetsTargets()) return;
    if (table.length >= capacity && figures[rank] < bar) return;
    record();
  }

  /* The bound with one set plan's bonus on top of what the runes can still add. */
  function planPasses(): boolean {
    for (let slot = 0; slot < effectSlotCount; slot += 1) planned[slot] = bound[slot] + planBonus[slot];
    totalsInto(problem.base, planned, totals);
    figuresInto(totals, figures);
    if (!meetsTargets()) return false;
    return table.length < capacity || figures[rank] >= bar;
  }

  /*
   * **Which sets can still be completed, and what each way of completing them is
   * worth** (§6.1). The free slots hold only so many pieces: with two left, one
   * two-set can still be finished, never Fatal and Rage and Blade at once. So the
   * bound is taken per plan — each way the free slots could complete stat sets —
   * and a node survives if any plan could still make the table. A worn Intangible
   * can stand in for one missing piece once. The first plan tried is "complete
   * nothing more", which is the one that usually passes, so a promising node
   * costs one evaluation and only a doomed one pays for the whole enumeration.
   */
  function anyPlanPasses(from: number, free: number, intangibleCredit: boolean): boolean {
    if (planPasses()) return true;
    for (let at = from; at < planSets.length; at += 1) {
      const [setId, pieces, slot, value] = planSets[at];
      const need = pieces - (planCounts[setId] % pieces);
      for (const credit of intangibleCredit && need > 1 ? [false, true] : [false]) {
        const spent = credit ? need - 1 : need;
        if (spent > free) continue;
        planCounts[setId] += need;
        planBonus[slot] += value;
        const passes = anyPlanPasses(at, free - spent, intangibleCredit && !credit);
        planCounts[setId] -= need;
        planBonus[slot] -= value;
        if (passes) return true;
      }
    }
    return false;
  }

  function promising(depth: number): boolean {
    nodes += 1;
    const from = depth * effectSlotCount;
    for (let slot = 0; slot < effectSlotCount; slot += 1) bound[slot] = accumulated[from + slot] + suffix[from + slot];
    if (!boundBySets) {
      for (let slot = 0; slot < effectSlotCount; slot += 1) planBonus[slot] = setBound[slot];
      return planPasses();
    }
    planCounts.set(setCounts);
    planBonus.fill(0);
    addSetBonuses(planCounts, -1, planBonus);
    return anyPlanPasses(0, depthCount - depth, setCounts[intangibleSetId] > 0);
  }

  function descend(depth: number) {
    if (depth === depthCount) { leaf(); return; }
    const count = counts[depth];
    const packed = effects[depth];
    const from = depth * effectSlotCount;
    const to = from + effectSlotCount;
    for (let at = 0; at < count; at += 1) {
      if (stopped) return;
      if (depth === splitDepth) {
        if (at % parts !== part) continue;
      }
      const setId = sets[depth][at];
      if (setId === intangibleSetId && setCounts[intangibleSetId] > 0) continue;
      const spent = spends[depth][at];
      if (spent.length > 0 && !spendable(spent)) continue;

      setCounts[setId] += 1;
      if (setsStillPossible(depth + 1)) {
        for (let slot = 0; slot < effectSlotCount; slot += 1) {
          accumulated[to + slot] = accumulated[from + slot] + packed[at * effectSlotCount + slot];
        }
        picks[depth] = at;
        if (spent.length > 0) spend(spent, 1);
        if (depth + 1 === depthCount || promising(depth + 1)) descend(depth + 1);
        if (spent.length > 0) spend(spent, -1);
      }
      setCounts[setId] -= 1;

      if (depth === splitDepth) {
        splitDone += 1;
        if (onProgress) onProgress(Math.min(1, splitDone / splitTotal));
      }
      /* The clock is read every few thousand steps rather than every one: the read
         is not free, and a limit measured in seconds does not need it. */
      ticks += 1;
      if ((ticks & 0x3fff) === 0 || depth <= splitDepth + 1) {
        const time = now();
        if (time - startedAt > problem.timeLimitMs) { stopped = true; return; }
        if (onProgress && depth === splitDepth + 1 && time - lastReport > 250) {
          lastReport = time;
          onProgress(Math.min(1, (splitDone + at / count) / splitTotal));
        }
      }
    }
  }

  if (promising(0)) descend(0);
  return { builds: table, complete: !stopped, combinations, nodes };
}
