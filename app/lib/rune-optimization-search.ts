/**
 * **Rune Optimization, part two: the search (`RUNE-OPTIMIZATION.md` §6).**
 *
 * Six slots, one candidate each, and every combination that meets the stated
 * builds, targets and item stock ranked by one figure. Trying them all is out of the
 * question — five hundred runes a slot is 1.6 × 10¹⁶ combinations — so this is a
 * depth-first branch and bound in two halves:
 *
 * - **The tree** places the first four slots, fewest candidates first and each slot
 *   best first, with an upper bound at every node (§6.1). It is a chain of decisions,
 *   so it is the processor's, always.
 * - **The tail** is the last two slots, and it is where the combinations are. Their
 *   candidates are grouped by set once per search, so a *block* — one group of each
 *   — has one set state: whether it can be a stated build, which set an Intangible
 *   completes, what the sets add. That is decided once per block rather than once
 *   per pair, and a block whose bound cannot reach the table is never opened (§6.2).
 *   What is left inside a block is plain arithmetic over two lists, which is the part
 *   a graphics card can take (§7).
 *
 * Everything here is exact: nothing drops a build that could have made the table. The
 * one inexact step in the calculation is the depth's cut, which happens before this
 * and is reported. A search that runs out of time says so; its table is then the best
 * it had found.
 *
 * The tree is iterative rather than recursive so that it can stop between two
 * prefixes and pick up where it left off: that is what lets the tail be handed to a
 * card in passes and waited for. `searchRuneBuilds` runs it on the processor alone;
 * `searchRuneBuildsInPasses` hands the tail to a card and checks every pair the card
 * sends back on the processor before it may enter the table.
 */
import {
  addSetBonuses, baseStatCount, effectSlot, effectSlotCount, figureOf, figuresInto, intangibleCompletion, intangibleSetId,
  setIdBound, statSetBonuses, targetFigureCount, totalsInto,
} from './monster-stats';
import { canStillFinishSets, canStillSatisfy, noBrokenSets, overCeiling, remainingSetSupport, satisfiesBuild } from './rune-optimization-problem';
import type { RuneOptimizationProblem } from './rune-optimization-problem';
import { availableStatSets } from './rune-optimization-ranges';
import { craftAllocation } from './rune-optimization-craft-allocation';

/** One build the search found: a candidate index per slot (index 0 is slot 1), and its figures. */
export type FoundBuild = {
  /** Physical rune combination, shared across workers and craft alternatives. */
  identity: string;
  picks: number[];
  figures: number[];
  moves: number;
};

export type SearchOutcome = {
  builds: FoundBuild[];
  /** `false` where the time limit stopped the search before it had looked everywhere. */
  complete: boolean;
  stoppedBy?: 'time-limit' | 'user';
  /** Combinations evaluated in full, on whichever engine evaluated them. */
  combinations: number;
  /** Partial combinations and blocks whose bound was checked. */
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
  const seen = new Set<string>();
  const builds = outcomes.flatMap((outcome) => outcome.builds).sort(compareFoundBuilds(rank))
    .filter((build) => { if (seen.has(build.identity)) return false; seen.add(build.identity); return true; }).slice(0, count);
  return {
    builds,
    complete: outcomes.every((outcome) => outcome.complete),
    stoppedBy: outcomes.some((outcome) => outcome.stoppedBy === 'user') ? 'user'
      : outcomes.some((outcome) => !outcome.complete) ? 'time-limit' : undefined,
    combinations: outcomes.reduce((total, outcome) => total + outcome.combinations, 0),
    nodes: outcomes.reduce((total, outcome) => total + outcome.nodes, 0),
  };
}

/**
 * **What a card is asked about one search**, fixed for its whole length.
 *
 * `candidates` holds the two tail slots' candidates, twelve accumulators each, the
 * first tail slot's first; a block's ranges index into it. The targets are `NaN`
 * where no floor is set, exactly as the problem states them.
 */
export type TailQuestion = {
  base: Float64Array;
  targets: Float64Array;
  rank: number;
  candidates: Float64Array;
};

/**
 * **One pass of blocks for a card.** Per block, twelve accumulators — the prefix's
 * sum with the block's set bonus already added — and four numbers: the first
 * candidate and the count of each tail group, as indexes into `TailQuestion.candidates`.
 */
export type TailPass = {
  blocks: number;
  pairs: number;
  bases: Float64Array;
  ranges: Uint32Array;
};

/**
 * A card's answer to one pass: every pair that could clear `bar` and every target,
 * as `(block, pair)` twos — the pair numbered `a × second count + b` inside its
 * block. `null` means more pairs cleared than the card had room to report.
 *
 * The answer must be **generous**: a pair it leaves out is a build lost from the
 * table, while a pair it wrongly includes costs one check on the processor. Throwing
 * means the card refused the pass.
 */
export type TailCard = (pass: TailPass, bar: number) => Promise<Uint32Array | null>;

/** How much one pass may hold. A card's own limits are the backend's to state. */
export type PassLimits = { blocks: number; pairs: number };

/**
 * How one part of a search talks to the others (§6.5).
 *
 * Every part keeps its own table, and the last row of a full table is a floor on the
 * whole search's last row: the parts' builds are distinct, so a part holding twenty
 * builds at or above some figure proves the merged table holds twenty too. A part
 * handed another part's bar may therefore drop anything *strictly* below it — ties
 * stay, for the order after the figure to settle. That is what lets eight parts prune
 * like one search rather than like eight small ones.
 */
export type SearchHooks = {
  /** Verification compares interval pruning with the same exhaustive traversal. */
  pruneCeilings?: boolean;
  /** Verification can compare resource matching with exhaustive end states. */
  allocateCraft?: boolean;
  onProgress?: (fraction: number) => void;
  /** This part's own bar rose. */
  onBar?: (bar: number) => void;
  /** The highest bar any other part has reported, read whenever the search pauses. */
  sharedBar?: () => number;
  now?: () => number;
  shouldStop?: () => boolean;
};

type Mode = 'processor' | 'card';

/* The time limit is measured in seconds, so the clock is read every few thousand
   steps rather than every one: the read is not free. */
const clockEvery = 0x3fff;

function createSearch(problem: RuneOptimizationProblem, part: number, parts: number, hooks: SearchHooks) {
  const source = problem;
  const allocation = hooks.allocateCraft === false ? null : craftAllocation(source);
  const grouped = allocation !== null;
  if (allocation) problem = allocation.problem;
  const { onProgress, onBar } = hooks;
  const now = hooks.now ?? (() => performance.now());
  /* Fewest candidates first: a locked slot costs nothing at the top, and a narrow
     slot high in the tree multiplies the fewest branches. The two widest slots are
     therefore the tail. */
  const order = [0, 1, 2, 3, 4, 5].sort((left, right) => problem.slots[left].length - problem.slots[right].length || left - right);
  const depthCount = order.length;
  const readSets = !problem.allowBroken ? new Set(problem.slots.flatMap((slot) => slot.map((candidate) => candidate.setId)))
    : new Set(problem.builds?.flatMap((build) => build.needs.map((need) => need.setId)));
  const setSupport = remainingSetSupport(problem.slots, order).map((support, depth) =>
    [...readSets].some((set) => set !== intangibleSetId && support[set] < order.length - depth) ? support : undefined);
  const tailDepth = depthCount - 2;
  const firstTail = tailDepth;
  const lastTail = tailDepth + 1;
  /* The share of the work this part takes is every n-th candidate of the first slot
     with a choice in it. A tree with no choice above the tail is too small to split,
     and the first part takes all of it. */
  const splitDepth = order.findIndex((slot) => problem.slots[slot].length > 1);
  const splits = splitDepth !== -1 && splitDepth < tailDepth;
  const idle = problem.slots.some((slot) => slot.length === 0) || (!splits && part !== 0);

  /* Everything the loop touches, packed flat per depth. */
  const counts = order.map((slot) => problem.slots[slot].length);
  const effects = order.map((slot) => {
    const packed = new Float64Array(problem.slots[slot].length * effectSlotCount);
    problem.slots[slot].forEach((candidate, at) => packed.set(candidate.effects, at * effectSlotCount));
    return packed;
  });
  const sets = order.map((slot) => Int32Array.from(problem.slots[slot], (candidate) => candidate.setId));
  const moves = order.map((slot) => Uint8Array.from(problem.slots[slot], (candidate) => (candidate.moves ? 1 : 0)));
  const minimumChanges = new Uint8Array(depthCount + 1);
  for (let d = depthCount - 1; d >= 0; d -= 1) {
    minimumChanges[d] = minimumChanges[d + 1] + moves[d].reduce((least, value) => Math.min(least, value), 1);
  }
  const spends = order.map((slot) => problem.slots[slot].map((candidate) => candidate.stock));
  const heldStock = Int32Array.from(problem.stock, (entry) => entry.amount);


  const builds = problem.builds;
  const buildCount = builds?.length ?? 0;
  const targets = problem.targets;
  const targetIndexes = [...targets.keys()].filter((index) => Number.isFinite(targets[index]));
  const ceilings = problem.ceilings;
  const capped = ceilings.some((value) => Number.isFinite(value));
  const ceilingIndexes = [...ceilings.keys()].filter((index) => Number.isFinite(ceilings[index]));
  const pruneCeilings = capped && hooks.pruneCeilings !== false;
  // A single varying accumulator orders a stat exactly even after rounding.
  // Percentage/flat pairs qualify only when their percentage is constant; a
  // rounded standalone HP (or a composite) cannot otherwise order completions.
  const percentSlots = [effectSlot.hpPercent, effectSlot.atkPercent, effectSlot.defPercent, effectSlot.spdPercent];
  const intervalIndex = pruneCeilings ? ceilingIndexes.find((index) => index < baseStatCount && (index >= 4
    || problem.slots[order[lastTail]].every((candidate) => candidate.effects[percentSlots[index]]
      === problem.slots[order[lastTail]][0]?.effects[percentSlots[index]]))) : undefined;
  const { allowBroken, setPieces } = problem;
  const rank = problem.rank;
  const capacity = problem.resultCount;
  const relevantSlot = new Uint8Array(effectSlotCount);
  for (const slot of problem.relevant) relevantSlot[slot] = 1;
  const intangibleInReach = problem.slots.some((slot) => slot.some((candidate) => candidate.setId === intangibleSetId));

  /* Whether row `a` is at least row `b` on every accumulator a decision reads. */
  const covers = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
    for (const slot of problem.relevant) if (a[slot] < b[slot]) return false;
    return true;
  };
  /* The rows no other row covers: the only ones a bound has to try. */
  const paretoRows = (rows: Float64Array[]): Float64Array[] => rows.filter((row, at) => !rows.some(
    (other, otherAt) => otherAt !== at && covers(other, row) && (otherAt < at || !covers(row, other))));
  const looseRow = (rows: readonly Float64Array[]): Float64Array => {
    const loose = new Float64Array(effectSlotCount).fill(rows.length === 0 ? 0 : -Infinity);
    for (const row of rows) for (let slot = 0; slot < effectSlotCount; slot += 1) loose[slot] = Math.max(loose[slot], row[slot]);
    return loose;
  };

  /*
   * **What the open slots can still add** (§6.1), one row per way of choosing their
   * mains. The most each accumulator could gain on its own would let one rune in slot
   * 4 carry an ATK %, a CRI Rate and a CRI Dmg main at once — which is exactly the
   * build a DMG bound reaches for, and one no rune is. So each slot's candidates are
   * taken per main, the best of each accumulator within a main, and a row is one main
   * per open slot summed. Only rows no other row beats on everything the question
   * reads are kept, and past a couple of dozen they are folded into their
   * accumulator-wise maximum — still a bound, only a looser one.
   */
  const suffixRowCap = 24;
  // Independent minima can underestimate a real completion, never exceed it.
  // Intangible credit is omitted: a later rune can change which set it completes.
  const suffixMinimum: Float64Array[] = new Array(depthCount + 1);
  suffixMinimum[depthCount] = new Float64Array(effectSlotCount);
  if (pruneCeilings) for (let depth = depthCount - 1; depth >= 0; depth -= 1) {
    const minimum = new Float64Array(effectSlotCount).fill(Infinity);
    for (let at = 0; at < counts[depth]; at += 1) {
      for (let slot = 0; slot < effectSlotCount; slot += 1) {
        minimum[slot] = Math.min(minimum[slot], effects[depth][at * effectSlotCount + slot]);
      }
    }
    for (let slot = 0; slot < effectSlotCount; slot += 1) minimum[slot] += suffixMinimum[depth + 1][slot];
    suffixMinimum[depth] = minimum;
  }
  const suffixRows: Float64Array[] = new Array(depthCount + 1);
  const suffixLoose: Float64Array[] = new Array(depthCount + 1);
  suffixRows[depthCount] = new Float64Array(effectSlotCount);
  suffixLoose[depthCount] = new Float64Array(effectSlotCount);
  let following: Float64Array[] = [new Float64Array(effectSlotCount)];
  for (let depth = depthCount - 1; depth >= 0; depth -= 1) {
    const byMain = new Map<number, Float64Array>();
    problem.slots[order[depth]].forEach((candidate, at) => {
      const best = byMain.get(candidate.main) ?? new Float64Array(effectSlotCount).fill(-Infinity);
      for (let slot = 0; slot < effectSlotCount; slot += 1) best[slot] = Math.max(best[slot], effects[depth][at * effectSlotCount + slot]);
      byMain.set(candidate.main, best);
    });
    const mains = paretoRows([...byMain.values()]);
    let rows = paretoRows(mains.flatMap((main) => following.map((rest) => {
      const row = new Float64Array(effectSlotCount);
      for (let slot = 0; slot < effectSlotCount; slot += 1) row[slot] = main[slot] + rest[slot];
      return row;
    })));
    if (rows.length > suffixRowCap) rows = [looseRow(rows)];
    const packed = new Float64Array(rows.length * effectSlotCount);
    rows.forEach((row, at) => packed.set(row, at * effectSlotCount));
    suffixRows[depth] = packed;
    suffixLoose[depth] = looseRow(rows);
    following = rows;
  }

  /*
   * **Which sets the bound has to plan for** (§6.1). A plan is one way the free slots
   * could still complete stat sets. Only sets whose bonus lands on an accumulator the
   * question reads can move a figure a decision turns on; a plan that spends slots on
   * any other set is the same plan with fewer slots left, and never the better one.
   * Where every slot is spoken for by a build, only the builds' own sets can be
   * completed at all.
   */
  const reachableSets = availableStatSets(builds);
  const planSets = reachableSets.filter(([, , slot]) => relevantSlot[slot] === 1);

  /*
   * **The bound's plans, remembered.** Every figure rises with every accumulator, so
   * a plan that could still complete one more set is never the one that decides —
   * only the *maximal* plans are tried, and of those only the ones no other plan
   * beats on every accumulator. Which plans those are depends on nothing but the
   * free slots, whether an engraved Intangible can still stand in for one missing piece,
   * and how far each planned set already is towards its next completion: a handful
   * of states per search, each worked out once.
   */
  type Plans = { rows: Float64Array; loose: Float64Array };
  const planMemo = new Map<number, Plans>();
  const residues = new Int32Array(planSets.length);
  function plansFor(free: number, credit: boolean): Plans {
    let key = free * 2 + (credit ? 1 : 0);
    for (let at = 0; at < planSets.length; at += 1) key = key * 4 + residues[at];
    const known = planMemo.get(key);
    if (known) return known;

    const found: Float64Array[] = [];
    const gains = new Float64Array(effectSlotCount);
    const left = Int32Array.from(residues);
    function walk(from: number, slotsFree: number, creditLeft: boolean) {
      let extended = false;
      for (let at = from; at < planSets.length; at += 1) {
        const [, pieces, slot, value] = planSets[at];
        const need = pieces - left[at];
        for (const useCredit of creditLeft ? [false, true] : [false]) {
          const spent = useCredit ? need - 1 : need;
          if (spent > slotsFree) continue;
          extended = true;
          const before = left[at];
          left[at] = 0;
          gains[slot] += value;
          walk(at, slotsFree - spent, creditLeft && !useCredit);
          gains[slot] -= value;
          left[at] = before;
        }
      }
      if (!extended) found.push(Float64Array.from(gains));
    }
    walk(0, free, credit);
    const kept = found.filter((plan, at) => !found.some((other, otherAt) => {
      if (otherAt === at) return false;
      let noWorse = true;
      let better = false;
      for (let slot = 0; slot < effectSlotCount; slot += 1) {
        if (other[slot] < plan[slot]) { noWorse = false; break; }
        if (other[slot] > plan[slot]) better = true;
      }
      /* Two equal plans: keep the first. */
      return noWorse && (better || otherAt < at);
    }));
    const packed = new Float64Array(kept.length * effectSlotCount);
    kept.forEach((plan, at) => packed.set(plan, at * effectSlotCount));
    const plans = { rows: packed, loose: looseRow(kept) };
    planMemo.set(key, plans);
    return plans;
  }

  /*
   * **The tail's groups.** A set only has to be told apart from another where it can
   * change a decision: a stated build asks for it, its bonus lands on an accumulator
   * the question reads, or it is Intangible. Every other set — Violent, Will,
   * Despair, and Energy on a question about DMG — behaves identically in every rule
   * a block applies, so all of them share one group, numbered 0, which no set rule
   * reads. That stops being true the moment an Intangible can be engraved, because which
   * set it completes depends on which sets are one short; with one in reach every set
   * keeps its own group.
   */
  const needSets = new Set(builds?.flatMap((build) => build.needs.map((need) => need.setId)) ?? []);
  const relevantStatSets = new Set(statSetBonuses.filter(([, , slot]) => relevantSlot[slot] === 1).map(([setId]) => setId));
  const groupOf = (setId: number): number => (intangibleInReach || !allowBroken || setId === intangibleSetId
    || needSets.has(setId) || relevantStatSets.has(setId) ? setId : 0);

  type TailRange = {
    from: number; to: number; minimum: Float64Array; maximum: Float64Array;
    left?: TailRange; right?: TailRange;
  };
  type Group = { set: number; start: number; count: number; best: Float64Array; minimum: Float64Array; range?: TailRange };
  /* Groups come in the order of their best member. Within a group, uncapped
     searches keep the slot's best-first order; capped tails cluster interval
     values so their minimum/maximum boxes can skip more impossible pairs. */
  const tailOrder: Int32Array[] = [];
  const tailEffects: Float64Array[] = [];
  const groups: Group[][] = [];
  for (const depth of [firstTail, lastTail]) {
    const bySet = new Map<number, number[]>();
    for (let at = 0; at < counts[depth]; at += 1) {
      const set = groupOf(sets[depth][at]);
      const members = bySet.get(set) ?? [];
      members.push(at);
      bySet.set(set, members);
    }
    const orderHere = new Int32Array(counts[depth]);
    const packed = new Float64Array(counts[depth] * effectSlotCount);
    const list: Group[] = [];
    const intervalValues = new Float64Array(counts[depth]);
    if (pruneCeilings && depth === lastTail) {
      const totals = new Float64Array(baseStatCount);
      problem.slots[order[depth]].forEach((candidate, at) => {
        totalsInto(problem.base, candidate.effects, totals);
        intervalValues[at] = figureOf(totals, intervalIndex ?? ceilingIndexes[0]);
      });
    }
    let next = 0;
    for (const [set, members] of bySet) {
      // Nearby values make the range boxes tighter. The boxes, not this ordering,
      // decide what can be skipped; final ties still use the original picks.
      if (pruneCeilings && depth === lastTail) members.sort((a, b) => intervalValues[b] - intervalValues[a] || a - b);
      const best = new Float64Array(effectSlotCount).fill(-Infinity);
      const minimum = new Float64Array(effectSlotCount).fill(Infinity);
      const start = next;
      for (const at of members) {
        orderHere[next] = at;
        for (let slot = 0; slot < effectSlotCount; slot += 1) {
          const value = effects[depth][at * effectSlotCount + slot];
          packed[next * effectSlotCount + slot] = value;
          if (value > best[slot]) best[slot] = value;
          if (value < minimum[slot]) minimum[slot] = value;
        }
        next += 1;
      }
      list.push({ set, start, count: members.length, best, minimum });
    }
    if (pruneCeilings && depth === lastTail) {
      const range = (from: number, to: number): TailRange => {
        const minimum = new Float64Array(effectSlotCount).fill(Infinity);
        const maximum = new Float64Array(effectSlotCount).fill(-Infinity);
        const node: TailRange = { from, to, minimum, maximum };
        if (to - from > 8) {
          const middle = (from + to) >>> 1;
          node.left = range(from, middle); node.right = range(middle, to);
          for (let slot = 0; slot < effectSlotCount; slot += 1) {
            minimum[slot] = Math.min(node.left.minimum[slot], node.right.minimum[slot]);
            maximum[slot] = Math.max(node.left.maximum[slot], node.right.maximum[slot]);
          }
        } else {
          for (let at = from; at < to; at += 1) for (let slot = 0; slot < effectSlotCount; slot += 1) {
            const value = packed[at * effectSlotCount + slot];
            minimum[slot] = Math.min(minimum[slot], value);
            maximum[slot] = Math.max(maximum[slot], value);
          }
        }
        return node;
      };
      for (const group of list) group.range = range(group.start, group.start + group.count);
    }
    tailOrder.push(orderHere);
    tailEffects.push(packed);
    groups.push(list);
  }
  const [firstGroups, lastGroups] = groups;
  const [firstOrder, lastOrder] = tailOrder;
  const [firstEffects, lastEffects] = tailEffects;

  const setsByDepth = order.map((_, depth) => {
    const rows = new Map<number, Float64Array>();
    for (let at = 0; at < counts[depth]; at += 1) {
      const set = groupOf(sets[depth][at]);
      const row = rows.get(set) ?? new Float64Array(effectSlotCount).fill(-Infinity);
      for (let slot = 0; slot < effectSlotCount; slot += 1) row[slot] = Math.max(row[slot], effects[depth][at * effectSlotCount + slot]);
      rows.set(set, row);
    }
    return [...rows];
  });
  const completionMemo = new Map<string, Plans>();
  let completionMemoBytes = 0;
  // With three slots left, actual set completions give a much tighter bound
  // than independent rune maxima plus unrelated set bonuses. Cache by counts,
  // not candidate identities: thousands of rune prefixes ask the same question.
  function completionRows(depthNow: number): Plans {
    const signature = order.slice(0, depthNow).map((_, d) => groupOf(sets[d][picks[d]])).sort((a, b) => a - b);
    const key = signature.join(',');
    const known = completionMemo.get(key);
    if (known) return known;
    const counted = new Int32Array(setIdBound);
    for (const set of signature) counted[set] += 1;
    const sum = new Float64Array(effectSlotCount);
    let rows: Float64Array[] = [];
    function walk(d: number) {
      if (d === depthCount) {
        const completes = intangibleCompletion(counted);
        if (!buildMet(counted, completes)) return;
        const row = new Float64Array(sum);
        addSetBonuses(counted, completes, row);
        rows.push(row);
        return;
      }
      for (const [set, best] of setsByDepth[d]) {
        if (set === intangibleSetId && counted[intangibleSetId] > 0) continue;
        counted[set] += 1;
        if ((allowBroken || canStillFinishSets(counted, d + 1, setPieces))
          && (builds === null || builds.some((build) => canStillSatisfy(build, counted, d + 1)))) {
          for (let slot = 0; slot < effectSlotCount; slot += 1) sum[slot] += best[slot];
          walk(d + 1);
          for (let slot = 0; slot < effectSlotCount; slot += 1) sum[slot] -= best[slot];
        }
        counted[set] -= 1;
      }
    }
    walk(depthNow);
    rows = paretoRows(rows);
    // Folding is an overestimate, so even a many-set question has bounded memory.
    if (rows.length > suffixRowCap) rows = [looseRow(rows)];
    const packed = new Float64Array(rows.length * effectSlotCount);
    rows.forEach((row, at) => packed.set(row, at * effectSlotCount));
    const found = { rows: packed, loose: looseRow(rows) };
    const bytes = packed.byteLength + found.loose.byteLength + 256;
    while (completionMemo.size > 0 && completionMemoBytes + bytes > 2 * 1024 * 1024) {
      const oldest = completionMemo.keys().next().value!;
      const entry = completionMemo.get(oldest)!;
      completionMemoBytes -= entry.rows.byteLength + entry.loose.byteLength + 256;
      completionMemo.delete(oldest);
    }
    completionMemo.set(key, found); completionMemoBytes += bytes;
    return found;
  }

  /*
   * **A block's set state, remembered per prefix.** Which blocks can be a stated
   * build, which set an Intangible completes and what the sets add depend on nothing
   * but the groups of the four runes above the tail — and four runes' groups, with
   * every neutral set counted as one, take a few hundred values on the largest
   * account against millions of prefixes. So the set rules run once per value, and
   * a prefix reads its list: the blocks it may open, each with its bonus.
   */
  const prefixGroups = order.slice(0, tailDepth).map((_, depth) => Int32Array.from(sets[depth], groupOf));
  const tailMemo = new Map<number, { blocks: Int32Array; bonuses: Float64Array }>();
  // A cached set signature saves arithmetic; it must never grow with the search
  // space. Eviction only repeats a calculation and cannot discard a build.
  const tailMemoBudget = 2 * 1024 * 1024;
  let tailMemoBytes = 0;
  const keyParts = new Int32Array(tailDepth);
  function tailBlocks(prefix: ArrayLike<number>) {
    for (let at = 0; at < tailDepth; at += 1) {
      const value = prefixGroups[at][prefix[at]];
      let to = at;
      while (to > 0 && keyParts[to - 1] > value) { keyParts[to] = keyParts[to - 1]; to -= 1; }
      keyParts[to] = value;
    }
    let key = 0;
    for (let at = 0; at < tailDepth; at += 1) key = key * setIdBound + keyParts[at];
    const known = tailMemo.get(key);
    if (known) return known;

    const counted = new Int32Array(setIdBound);
    for (let at = 0; at < tailDepth; at += 1) counted[keyParts[at]] += 1;
    const blocks: number[] = [];
    const bonuses: number[] = [];
    const bonus = new Float64Array(effectSlotCount);
    for (let g = 0; g < firstGroups.length; g += 1) {
      const firstSet = firstGroups[g].set;
      if (firstSet === intangibleSetId && counted[intangibleSetId] > 0) continue;
      counted[firstSet] += 1;
      for (let h = 0; h < lastGroups.length; h += 1) {
        const lastSet = lastGroups[h].set;
        if (lastSet === intangibleSetId && counted[intangibleSetId] > 0) continue;
        counted[lastSet] += 1;
        /* Several sets one rune short and one Intangible complete none. The block
           remains valid when broken sets are allowed; `buildMet` and the final
           broken-set check decide whether the question accepts it (§6.3). */
        const completes = intangibleCompletion(counted);
        if (buildMet(counted, completes)) {
          bonus.fill(0);
          addSetBonuses(counted, completes, bonus);
          blocks.push(g, h);
          bonuses.push(...bonus);
        }
        counted[lastSet] -= 1;
      }
      counted[firstSet] -= 1;
    }
    const found = { blocks: Int32Array.from(blocks), bonuses: Float64Array.from(bonuses) };
    const bytes = found.blocks.byteLength + found.bonuses.byteLength + 128;
    while (tailMemo.size > 0 && tailMemoBytes + bytes > tailMemoBudget) {
      const oldest = tailMemo.keys().next().value!;
      const entry = tailMemo.get(oldest)!;
      tailMemoBytes -= entry.blocks.byteLength + entry.bonuses.byteLength + 128;
      tailMemo.delete(oldest);
    }
    if (bytes <= tailMemoBudget) { tailMemo.set(key, found); tailMemoBytes += bytes; }
    return found;
  }

  /* The live state of the tree. */
  const accumulated = new Float64Array((depthCount + 1) * effectSlotCount);
  accumulated.set(problem.start, 0);
  const setCounts = new Int32Array(setIdBound);
  const stockLeft = Int32Array.from(heldStock);
  const picks = new Int32Array(depthCount);
  const cursor = new Int32Array(depthCount);
  const placed = new Uint8Array(depthCount);

  /* Scratch. */
  const bound = new Float64Array(effectSlotCount);
  const planned = new Float64Array(effectSlotCount);
  const withFirst = new Float64Array(effectSlotCount);
  const finished = new Float64Array(effectSlotCount);
  const exactCounts = new Int32Array(setIdBound);
  const totals = new Float64Array(baseStatCount);
  const figures = new Float64Array(targetFigureCount);

  const table: FoundBuild[] = [];
  const seeded = new Set<string>();
  const ordered = compareFoundBuilds(rank);
  let bar = -Infinity;
  let combinations = 0;
  let nodes = 0;
  let stopped = false;
  let stoppedBy: SearchOutcome['stoppedBy'];
  let ticks = 0;
  const startedAt = now();
  let lastReport = startedAt;
  let splitDone = 0;
  const splitTotal = splits ? Math.ceil((counts[splitDepth] - part) / parts) : 1;
  let depth = idle ? -1 : 0;
  let mode: Mode = 'processor';

  /* Whether these accumulators could still make the table: every target met, and the
     ranking figure at least the build now last. Every figure rises with every
     accumulator, which is what makes the same test a bound on a node and a verdict
     on a finished build. */
  function passes(effectsNow: ArrayLike<number>): boolean {
    totalsInto(problem.base, effectsNow, totals);
    // A completion cannot exceed either the optimistic contribution or a
    // stated direct-stat ceiling. Composites read these tighter totals through
    // the shared sheet, so a forbidden ATK surplus cannot promise extra DMG.
    for (const index of ceilingIndexes) if (index < baseStatCount) totals[index] = Math.min(totals[index], ceilings[index]);
    for (let at = 0; at < targetIndexes.length; at += 1) {
      const index = targetIndexes[at];
      if (figureOf(totals, index) < targets[index]) return false;
    }
    const rankBound = figureOf(totals, rank);
    return (Number.isFinite(ceilings[rank]) ? Math.min(rankBound, ceilings[rank]) : rankBound) >= bar;
  }

  function withinCeilings(effectsNow: ArrayLike<number>): boolean {
    totalsInto(problem.base, effectsNow, totals);
    for (const index of ceilingIndexes) if (figureOf(totals, index) > ceilings[index]) return false;
    return true;
  }

  function spendable(stock: Int32Array, list: readonly number[]): boolean {
    for (let at = 0; at < list.length; at += 1) {
      const entry = list[at];
      let needed = 0;
      for (let other = 0; other < list.length; other += 1) if (list[other] === entry) needed += 1;
      if (stock[entry] < needed) return false;
    }
    return true;
  }

  function spend(stock: Int32Array, list: readonly number[], direction: number) {
    for (let at = 0; at < list.length; at += 1) stock[list[at]] -= direction;
  }

  function setsStillPossible(placedCount: number): boolean {
    if (!allowBroken && !canStillFinishSets(setCounts, placedCount, setPieces, setSupport[placedCount])) return false;
    if (builds === null) return true;
    for (let at = 0; at < buildCount; at += 1) if (canStillSatisfy(builds[at], setCounts, placedCount, setSupport[placedCount])) return true;
    return false;
  }

  function buildMet(countsNow: Int32Array, completes: number): boolean {
    if (!allowBroken && !noBrokenSets(countsNow, completes, setPieces)) return false;
    if (builds === null) return true;
    for (let at = 0; at < buildCount; at += 1) if (satisfiesBuild(builds[at], countsNow, completes)) return true;
    return false;
  }

  function checkClock() {
    const time = now();
    if (hooks.shouldStop?.()) { stopped = true; stoppedBy = 'user'; }
    else if (time - startedAt > problem.timeLimitMs) { stopped = true; stoppedBy = 'time-limit'; }
    return time;
  }

  function finishCandidate(at: number, depthNow: number) {
    if (depthNow === splitDepth && splits) {
      splitDone += 1;
      onProgress?.(Math.min(1, splitDone / splitTotal));
    }
    ticks += 1;
    if ((ticks & clockEvery) === 0 || depthNow <= splitDepth + 1) {
      const time = checkClock();
      if (onProgress && splits && depthNow === splitDepth + 1 && time - lastReport > 250) {
        lastReport = time;
        onProgress(Math.min(1, (splitDone + at / counts[depthNow]) / splitTotal));
      }
    }
  }

  const noPlans: Plans = { rows: new Float64Array(effectSlotCount), loose: new Float64Array(effectSlotCount) };

  /*
   * The bound at a node of the tree: what is placed, the sets already complete, and
   * then every pairing of a row for the open slots with a maximal plan for the sets
   * they could still complete. Most nodes fail, so the loosest pairing — every row
   * and every plan folded into one — is tried first: where that fails, every pairing
   * does, and the node cost one evaluation.
   */
  function promising(depthNow: number): boolean {
    if (problem.maxChanges !== undefined) {
      let changes = minimumChanges[depthNow];
      for (let d = 0; d < depthNow; d += 1) changes += moves[d][picks[d]];
      if (changes > problem.maxChanges) return false;
    }
    nodes += 1;
    const from = depthNow * effectSlotCount;
    if (pruneCeilings) {
      for (let slot = 0; slot < effectSlotCount; slot += 1) {
        planned[slot] = accumulated[from + slot] + suffixMinimum[depthNow][slot];
      }
      addSetBonuses(setCounts, -1, planned);
      if (!withinCeilings(planned)) return false;
    }
    if (!allowBroken && depthNow >= 3) {
      const completions = completionRows(depthNow);
      if (completions.rows.length === 0) return false;
      for (let slot = 0; slot < effectSlotCount; slot += 1) planned[slot] = accumulated[from + slot] + completions.loose[slot];
      if (!passes(planned)) return false;
      for (let row = 0; row < completions.rows.length; row += effectSlotCount) {
        for (let slot = 0; slot < effectSlotCount; slot += 1) planned[slot] = accumulated[from + slot] + completions.rows[row + slot];
        if (passes(planned)) return true;
      }
      return false;
    }
    for (let slot = 0; slot < effectSlotCount; slot += 1) bound[slot] = accumulated[from + slot];
    addSetBonuses(setCounts, -1, bound);
    let plans: Plans = noPlans;
    if (planSets.length > 0) {
      for (let at = 0; at < planSets.length; at += 1) {
        const [setId, pieces] = planSets[at];
        residues[at] = setCounts[setId] % pieces;
      }
      // Required neutral sets spend slots too. Giving those same slots to a
      // stat-set plan made open two-set builds look far stronger than they are.
      // Credit may be spent twice here, deliberately: an overestimate is safe.
      let reserved = Infinity;
      for (const build of builds ?? [null]) {
        let missing = 0;
        for (let set = 1; set < setPieces.length; set += 1) {
          if (setPieces[set] === 0 || relevantStatSets.has(set)) continue;
          const engraved = setCounts[set];
          const finish = !allowBroken ? (setPieces[set] - engraved % setPieces[set]) % setPieces[set] : 0;
          const required = build?.needs.find((need) => need.setId === set)?.pieces ?? 0;
          missing += Math.max(finish, required - engraved);
        }
        reserved = Math.min(reserved, missing);
      }
      reserved = Math.max(0, reserved - Math.min(1, setCounts[intangibleSetId]));
      plans = plansFor(Math.max(0, depthCount - depthNow - reserved), setCounts[intangibleSetId] > 0);
    }
    const loose = suffixLoose[depthNow];
    for (let slot = 0; slot < effectSlotCount; slot += 1) planned[slot] = bound[slot] + loose[slot] + plans.loose[slot];
    if (!passes(planned)) return false;
    const rows = suffixRows[depthNow];
    if (rows.length === effectSlotCount && plans.rows.length === effectSlotCount) return true;
    for (let row = 0; row < rows.length; row += effectSlotCount) {
      for (let plan = 0; plan < plans.rows.length; plan += effectSlotCount) {
        for (let slot = 0; slot < effectSlotCount; slot += 1) planned[slot] = bound[slot] + rows[row + slot] + plans.rows[plan + slot];
        if (passes(planned)) return true;
      }
    }
    return false;
  }

  function record(prefix: ArrayLike<number>, first: number, last: number, seed = false) {
    let moved = moves[firstTail][first] + moves[lastTail][last];
    const bySlot = new Array<number>(depthCount);
    for (let at = 0; at < tailDepth; at += 1) {
      moved += moves[at][prefix[at]];
      bySlot[order[at]] = prefix[at];
    }
    // Card pairs and processor pairs share this check before raising the table bar.
    if (problem.maxChanges !== undefined && moved > problem.maxChanges) return;
    bySlot[order[firstTail]] = first;
    bySlot[order[lastTail]] = last;
    const identity = JSON.stringify(bySlot.map((pick, slot) => problem.slots[slot][pick].runeId));
    const previous = table.findIndex((build) => build.identity === identity);
    // Many work plans improve the same physical row. Do not allocate items for
    // one whose optimistic figure is already strictly worse; ties still settle
    // through the ordinary total order after resolving its actual work.
    if (allocation && previous >= 0 && figures[rank] < table[previous].figures[rank]) return;
    if (seeded.size > 0 || seed) {
      const key = bySlot.join(',');
      if (seeded.has(key)) return;
      if (seed) seeded.add(key);
    }
    let actualPicks = bySlot;
    let actualFigures = Array.from(figures);
    if (allocation) {
      const resolved = allocation.resolve(bySlot);
      if (!resolved) return;
      actualPicks = resolved;
      finished.set(source.start); exactCounts.fill(0);
      for (const [slot, pick] of resolved.entries()) {
        const candidate = source.slots[slot][pick];
        exactCounts[candidate.setId] += 1;
        for (let stat = 0; stat < effectSlotCount; stat += 1) finished[stat] += candidate.effects[stat];
      }
      addSetBonuses(exactCounts, intangibleCompletion(exactCounts), finished);
      if (!passes(finished) || (capped && !withinCeilings(finished))) return;
      totalsInto(source.base, finished, totals); figuresInto(totals, figures);
      actualFigures = Array.from(figures);
    }
    const found: FoundBuild = { identity, picks: actualPicks, figures: actualFigures, moves: moved };
    if (previous >= 0) {
      if (ordered(found, table[previous]) >= 0) return;
      table.splice(previous, 1);
    }
    if (table.length >= capacity && ordered(found, table[table.length - 1]) >= 0) return;
    let at = table.length;
    while (at > 0 && ordered(found, table[at - 1]) < 0) at -= 1;
    table.splice(at, 0, found);
    if (table.length > capacity) table.pop();
    if (table.length >= capacity && table[table.length - 1].figures[rank] > bar) {
      bar = table[table.length - 1].figures[rank];
      onBar?.(bar);
    }
  }

  /*
   * **One block on the processor**, from a prefix's own state: its accumulated
   * effects, the block's set bonus, the real set counts of its four runes, the stock
   * they left and the runes themselves. The same code judges a block the tree has
   * just reached and a pair a card sent back long after the tree moved on, which is
   * what makes the card's answer the processor's answer.
   *
   * A pair is decided on the block's bonus — exact on every accumulator a decision
   * reads — and only a pair that makes the table has its figures counted again from
   * its runes' real sets, so a Violent rune in the neutral group still reports the
   * sheet it would really have.
   */
  function evaluateBlock(
    acc: Float64Array, accAt: number, bonus: Float64Array, bonusAt: number,
    prefixCounts: Int32Array, stock: Int32Array, prefix: ArrayLike<number>,
    firstFrom: number, firstTo: number, lastFrom: number, lastTo: number, lastGroup: Group, counted: boolean,
  ) {
    for (let k = firstFrom; k < firstTo; k += 1) {
      if (stopped) return;
      const first = firstOrder[k];
      const firstSpent = spends[firstTail][first];
      if (firstSpent.length > 0 && !spendable(stock, firstSpent)) continue;
      for (let slot = 0; slot < effectSlotCount; slot += 1) {
        withFirst[slot] = acc[accAt + slot] + firstEffects[k * effectSlotCount + slot];
      }
      nodes += 1;
      for (let slot = 0; slot < effectSlotCount; slot += 1) {
        planned[slot] = withFirst[slot] + lastGroup.best[slot] + bonus[bonusAt + slot];
      }
      ticks += 1;
      if ((ticks & clockEvery) === 0) checkClock();
      if (!passes(planned)) continue;
      if (pruneCeilings) {
        for (let slot = 0; slot < effectSlotCount; slot += 1) {
          planned[slot] = withFirst[slot] + lastGroup.minimum[slot] + bonus[bonusAt + slot];
        }
        if (!withinCeilings(planned)) continue;
      }
      if (firstSpent.length > 0) spend(stock, firstSpent, 1);
      let pairFrom = lastFrom;
      let pairTo = lastTo;
      if (intervalIndex !== undefined) {
        const valueAt = (at: number): number => {
          for (let slot = 0; slot < effectSlotCount; slot += 1) {
            planned[slot] = withFirst[slot] + lastEffects[at * effectSlotCount + slot] + bonus[bonusAt + slot];
          }
          totalsInto(problem.base, planned, totals);
          return figureOf(totals, intervalIndex);
        };
        // Descending values make both ends of the legal interval binary searches.
        // Equal endpoints stay eligible; other figures and stock still decide rows.
        let low = lastFrom; let high = lastTo;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (valueAt(middle) > ceilings[intervalIndex]) low = middle + 1;
          else high = middle;
        }
        pairFrom = low;
        const floor = Math.max(Number.isFinite(targets[intervalIndex]) ? targets[intervalIndex] : -Infinity,
          rank === intervalIndex ? bar : -Infinity);
        high = lastTo;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (valueAt(middle) >= floor) low = middle + 1;
          else high = middle;
        }
        pairTo = low;
      }
      const evaluatePairs = (from: number, to: number) => {
        for (let m = from; m < to; m += 1) {
          ticks += 1;
          if ((ticks & clockEvery) === 0) checkClock();
          if (stopped) break;
          const last = lastOrder[m];
          const lastSpent = spends[lastTail][last];
          if (lastSpent.length > 0 && !spendable(stock, lastSpent)) continue;
          if (counted) combinations += 1;
          for (let slot = 0; slot < effectSlotCount; slot += 1) {
            finished[slot] = withFirst[slot] + lastEffects[m * effectSlotCount + slot];
            planned[slot] = finished[slot] + bonus[bonusAt + slot];
          }
          if (!passes(planned)) continue;
          exactCounts.set(prefixCounts);
          exactCounts[sets[firstTail][first]] += 1;
          exactCounts[sets[lastTail][last]] += 1;
          addSetBonuses(exactCounts, intangibleCompletion(exactCounts), finished);
          totalsInto(problem.base, finished, totals);
          figuresInto(totals, figures);
          // Bounds only prove impossibility; the real sheet still decides each row.
          if (!grouped && capped && overCeiling(figures, ceilings)) continue;
          record(prefix, first, last);
        }
      };
      // Bounds include this block's exact set bonus. Unlike a partial Intangible
      // completion, it cannot change when a different rune in the group is chosen.
      const visit = (range: TailRange): void => {
        if (stopped || range.to <= pairFrom || range.from >= pairTo) return;
        nodes += 1;
        for (let slot = 0; slot < effectSlotCount; slot += 1) {
          planned[slot] = withFirst[slot] + range.minimum[slot] + bonus[bonusAt + slot];
        }
        if (!withinCeilings(planned)) return;
        for (let slot = 0; slot < effectSlotCount; slot += 1) {
          planned[slot] = withFirst[slot] + range.maximum[slot] + bonus[bonusAt + slot];
        }
        if (!passes(planned)) return;
        if (range.left && range.right) { visit(range.left); visit(range.right); }
        else evaluatePairs(Math.max(pairFrom, range.from), Math.min(pairTo, range.to));
      };
      if (lastGroup.range && pairTo - pairFrom > 8) visit(lastGroup.range);
      else evaluatePairs(pairFrom, pairTo);
      if (firstSpent.length > 0) spend(stock, firstSpent, -1);
    }
  }

  /* Blocks waiting for a card: the prefix, its accumulated effects and the block's
     bonus in exact arithmetic, for the processor to judge what comes back. */
  let pending = 0;
  let pendingPairs = 0;
  let pendingCapacity = 0;
  let pendingPrefix = new Int32Array(0);
  let pendingAcc = new Float64Array(0);
  let pendingBonus = new Float64Array(0);
  let pendingGroups = new Int32Array(0);
  let limits: PassLimits = { blocks: Infinity, pairs: Infinity };
  /* Where a pause is wanted on the processor too: the moment after which the tree
     stops at the next prefix, so the part can hear the other parts' bars. */
  let sliceEnd = Infinity;

  function hold(firstGroup: number, lastGroup: number, bonuses: Float64Array, bonusAt: number) {
    if (pending === pendingCapacity) {
      pendingCapacity = Math.max(1024, pendingCapacity * 2);
      const grow = <T extends Int32Array | Float64Array>(old: T, stride: number, make: (length: number) => T): T => {
        const next = make(pendingCapacity * stride);
        next.set(old);
        return next;
      };
      pendingPrefix = grow(pendingPrefix, tailDepth, (length) => new Int32Array(length));
      pendingAcc = grow(pendingAcc, effectSlotCount, (length) => new Float64Array(length));
      pendingBonus = grow(pendingBonus, effectSlotCount, (length) => new Float64Array(length));
      pendingGroups = grow(pendingGroups, 2, (length) => new Int32Array(length));
    }
    pendingPrefix.set(picks.subarray(0, tailDepth), pending * tailDepth);
    pendingAcc.set(accumulated.subarray(firstTail * effectSlotCount, (firstTail + 1) * effectSlotCount), pending * effectSlotCount);
    pendingBonus.set(bonuses.subarray(bonusAt, bonusAt + effectSlotCount), pending * effectSlotCount);
    pendingGroups[pending * 2] = firstGroup;
    pendingGroups[pending * 2 + 1] = lastGroup;
    pendingPairs += firstGroups[firstGroup].count * lastGroups[lastGroup].count;
    pending += 1;
  }

  /* The tail of one prefix: every block whose set state can be a stated build, and
     whose bound can still reach the table. */
  function tail() {
    const { blocks, bonuses } = tailBlocks(picks);
    const accAt = firstTail * effectSlotCount;
    for (let at = 0; at < blocks.length; at += 2) {
      ticks += 1;
      if ((ticks & clockEvery) === 0) checkClock();
      if (stopped) return;
      const firstGroup = firstGroups[blocks[at]];
      const lastGroup = lastGroups[blocks[at + 1]];
      const bonusAt = (at / 2) * effectSlotCount;
      nodes += 1;
      for (let slot = 0; slot < effectSlotCount; slot += 1) {
        planned[slot] = accumulated[accAt + slot] + firstGroup.best[slot] + lastGroup.best[slot] + bonuses[bonusAt + slot];
      }
      if (!passes(planned)) continue;
      if (pruneCeilings) {
        for (let slot = 0; slot < effectSlotCount; slot += 1) {
          planned[slot] = accumulated[accAt + slot] + firstGroup.minimum[slot] + lastGroup.minimum[slot] + bonuses[bonusAt + slot];
        }
        if (!withinCeilings(planned)) continue;
      }
      if (mode === 'card') {
        hold(blocks[at], blocks[at + 1], bonuses, bonusAt);
      } else {
        evaluateBlock(accumulated, accAt, bonuses, bonusAt, setCounts, stockLeft, picks,
          firstGroup.start, firstGroup.start + firstGroup.count,
          lastGroup.start, lastGroup.start + lastGroup.count, lastGroup, true);
        if (stopped) return;
      }
    }
  }

  function unplace(depthNow: number) {
    const at = picks[depthNow];
    setCounts[sets[depthNow][at]] -= 1;
    const spent = spends[depthNow][at];
    if (spent.length > 0) spend(stockLeft, spent, -1);
    placed[depthNow] = 0;
  }

  /**
   * Walk the tree from where it stood. Returns when the tree is finished, when the
   * clock ran out, or — in card mode — when enough blocks are waiting for one pass.
   */
  function advance(): 'done' | 'stopped' | 'pass' {
    for (;;) {
      if (stopped) return 'stopped';
      if (depth < 0) return 'done';
      if (depth === tailDepth) {
        tail();
        depth -= 1;
        if (mode === 'card' && (pending >= limits.blocks || pendingPairs >= limits.pairs)) return 'pass';
        if (sliceEnd !== Infinity && now() >= sliceEnd) return 'pass';
        continue;
      }
      if (placed[depth]) {
        const at = picks[depth];
        unplace(depth);
        finishCandidate(at, depth);
        if (stopped) return 'stopped';
        if ((ticks & clockEvery) === 0 && sliceEnd !== Infinity && now() >= sliceEnd) return 'pass';
      }
      let entered = false;
      const count = counts[depth];
      const packed = effects[depth];
      const from = depth * effectSlotCount;
      const to = from + effectSlotCount;
      while (cursor[depth] < count) {
        const at = cursor[depth];
        cursor[depth] += 1;
        if (depth === splitDepth && splits && at % parts !== part) continue;
        const setId = sets[depth][at];
        if (setId === intangibleSetId && setCounts[intangibleSetId] > 0) continue;
        const spent = spends[depth][at];
        if (spent.length > 0 && !spendable(stockLeft, spent)) continue;
        setCounts[setId] += 1;
        if (setsStillPossible(depth + 1)) {
          for (let slot = 0; slot < effectSlotCount; slot += 1) {
            accumulated[to + slot] = accumulated[from + slot] + packed[at * effectSlotCount + slot];
          }
          picks[depth] = at;
          if (spent.length > 0) spend(stockLeft, spent, 1);
          placed[depth] = 1;
          if (promising(depth + 1)) {
            depth += 1;
            if (depth < tailDepth) { cursor[depth] = 0; placed[depth] = 0; }
            entered = true;
            break;
          }
          unplace(depth);
        } else {
          setCounts[setId] -= 1;
        }
        finishCandidate(at, depth);
        if (stopped) return 'stopped';
      }
      if (!entered) depth -= 1;
    }
  }

  /* The real set counts and the stock left by a held prefix, for judging its pairs. */
  const heldCounts = new Int32Array(setIdBound);
  const heldStockLeft = new Int32Array(heldStock.length);
  function prefixState(block: number) {
    heldCounts.fill(0);
    heldStockLeft.set(heldStock);
    const at = block * tailDepth;
    for (let d = 0; d < tailDepth; d += 1) {
      const pick = pendingPrefix[at + d];
      heldCounts[sets[d][pick]] += 1;
      const spent = spends[d][pick];
      if (spent.length > 0) spend(heldStockLeft, spent, 1);
    }
  }

  function heldPrefix(block: number) {
    return pendingPrefix.subarray(block * tailDepth, (block + 1) * tailDepth);
  }

  // Guides belong to one part only. Their exact figures give the tree a useful
  // starting bar; remembering their identities prevents counting them twice
  // when the exhaustive traversal reaches the same picks.
  function seedGuide(guide: readonly number[]) {
    if (splits && guide[order[splitDepth]] % parts !== part) return;
    const guideCounts = heldCounts;
    const guideStock = heldStockLeft;
    guideCounts.fill(0);
    guideStock.set(heldStock);
    finished.set(problem.start);
    let valid = true;
    for (let d = 0; d < depthCount; d += 1) {
      const at = guide[order[d]];
      guideCounts[sets[d][at]] += 1;
      if (!spendable(guideStock, spends[d][at])) { valid = false; break; }
      spend(guideStock, spends[d][at], 1);
      for (let slot = 0; slot < effectSlotCount; slot += 1) finished[slot] += effects[d][at * effectSlotCount + slot];
    }
    const completes = intangibleCompletion(guideCounts);
    if (!valid || !buildMet(guideCounts, completes)) return;
    addSetBonuses(guideCounts, completes, finished);
    if (!passes(finished)) return;
    totalsInto(problem.base, finished, totals);
    figuresInto(totals, figures);
    if (!grouped && capped && overCeiling(figures, ceilings)) return;
    record(order.slice(0, tailDepth).map((slot) => guide[slot]), guide[order[firstTail]], guide[order[lastTail]], true);
  }
  if (!idle) for (const guide of problem.guides) {
    seedGuide(guide);
    // Feasible one-rune neighbours fill larger tables before the tree opens.
    // Keeping the set makes this small warm-up useful even with broken sets off.
    const neighbour = [...guide];
    for (let slot = 0; slot < depthCount; slot += 1) {
      const set = problem.slots[slot][guide[slot]].setId;
      for (let at = 0; at < problem.slots[slot].length; at += 1) {
        if (problem.slots[slot][at].setId !== set) continue;
        neighbour[slot] = at;
        seedGuide(neighbour);
      }
      neighbour[slot] = guide[slot];
    }
  }
  if (depth === 0 && !promising(0)) depth = -1;

  const cardCandidates = new Float64Array((counts[firstTail] + counts[lastTail]) * effectSlotCount);
  cardCandidates.set(firstEffects, 0);
  cardCandidates.set(lastEffects, firstEffects.length);

  return {
    question: (): TailQuestion => ({ base: problem.base, targets: problem.targets, rank, candidates: cardCandidates }),
    setMode(next: Mode, passLimits?: PassLimits) {
      mode = next;
      if (passLimits) limits = passLimits;
    },
    slice(until: number) { sliceEnd = until; },
    /** Another part's bar. Only ever raises this part's own. */
    raiseBar(value: number) { if (value > bar) bar = value; },
    advance,
    get stopped() { return stopped; },
    checkClock,
    bar: () => bar,
    pending: () => pending,
    /** Blocks `from` to `to` of what is waiting, as a card reads them. */
    pass(from: number, to: number): TailPass {
      const blocks = to - from;
      const bases = new Float64Array(blocks * effectSlotCount);
      const ranges = new Uint32Array(blocks * 4);
      let pairs = 0;
      for (let block = 0; block < blocks; block += 1) {
        const held = from + block;
        for (let slot = 0; slot < effectSlotCount; slot += 1) {
          bases[block * effectSlotCount + slot] = pendingAcc[held * effectSlotCount + slot] + pendingBonus[held * effectSlotCount + slot];
        }
        const first = firstGroups[pendingGroups[held * 2]];
        const last = lastGroups[pendingGroups[held * 2 + 1]];
        ranges[block * 4] = first.start;
        ranges[block * 4 + 1] = first.count;
        ranges[block * 4 + 2] = counts[firstTail] + last.start;
        ranges[block * 4 + 3] = last.count;
        pairs += first.count * last.count;
      }
      return { blocks, pairs, bases, ranges };
    },
    /** Judge on the processor every pair a card sent back for blocks `from` onward. */
    confirm(from: number, to: number, survivors: Uint32Array) {
      const blocks = to - from;
      const byBlock = new Map<number, number[]>();
      for (let at = 0; at + 1 < survivors.length; at += 2) {
        const block = survivors[at];
        const pair = survivors[at + 1];
        if (block >= blocks) throw new Error('The graphics card named a block it was not given.');
        const held = from + block;
        const size = firstGroups[pendingGroups[held * 2]].count * lastGroups[pendingGroups[held * 2 + 1]].count;
        if (pair >= size) throw new Error('The graphics card named a pair outside its block.');
        const list = byBlock.get(held) ?? [];
        list.push(pair);
        byBlock.set(held, list);
      }
      /* Blocks in the order they were held and pairs in order inside each, so the
         processor meets them exactly as the processor would have. */
      for (const held of [...byBlock.keys()].sort((left, right) => left - right)) {
        const first = firstGroups[pendingGroups[held * 2]];
        const last = lastGroups[pendingGroups[held * 2 + 1]];
        prefixState(held);
        const prefix = heldPrefix(held);
        for (const pair of byBlock.get(held)!.sort((left, right) => left - right)) {
          const k = first.start + Math.floor(pair / last.count);
          const m = last.start + (pair % last.count);
          evaluateBlock(pendingAcc, held * effectSlotCount, pendingBonus, held * effectSlotCount,
            heldCounts, heldStockLeft, prefix, k, k + 1, m, m + 1, last, false);
        }
      }
    },
    /** Judge held blocks wholly on the processor — a block too full for a card to report, or a card that refused. */
    evaluateHeld(from: number, to: number) {
      for (let held = from; held < to && !stopped; held += 1) {
        const first = firstGroups[pendingGroups[held * 2]];
        const last = lastGroups[pendingGroups[held * 2 + 1]];
        prefixState(held);
        evaluateBlock(pendingAcc, held * effectSlotCount, pendingBonus, held * effectSlotCount,
          heldCounts, heldStockLeft, heldPrefix(held),
          first.start, first.start + first.count, last.start, last.start + last.count, last, true);
      }
    },
    countPairs(pairs: number) { combinations += pairs; },
    clearHeld() { pending = 0; pendingPairs = 0; },
    outcome: (): SearchOutcome => ({ builds: table, complete: !stopped, stoppedBy, combinations, nodes }),
  };
}

/** The whole search on the processor. It is the reference every other engine is held to. */
export function searchRuneBuilds(
  problem: RuneOptimizationProblem, part = 0, parts = 1, hooks: SearchHooks = {},
): SearchOutcome {
  const search = createSearch(problem, part, parts, hooks);
  if (hooks.sharedBar) search.raiseBar(hooks.sharedBar());
  search.advance();
  return search.outcome();
}

/* A slice long enough that stepping aside costs nothing measurable, short enough that
   a bar another part found reaches this one while it can still save work. */
const sliceMs = 50;

const yieldToMessages = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

/**
 * **The processor's search, in slices.** The same search as `searchRuneBuilds`, and
 * the same table, but it steps aside every few dozen milliseconds so the worker can
 * hear the bars the other parts have reached. Without a `sharedBar` it has nothing to
 * listen for, and is simply the processor's search.
 */
export async function searchRuneBuildsInSlices(
  problem: RuneOptimizationProblem, part = 0, parts = 1, hooks: SearchHooks = {},
): Promise<SearchOutcome> {
  const { sharedBar } = hooks;
  if (!sharedBar) return searchRuneBuilds(problem, part, parts, hooks);
  const search = createSearch(problem, part, parts, hooks);
  const now = hooks.now ?? (() => performance.now());
  for (;;) {
    search.raiseBar(sharedBar());
    search.slice(now() + sliceMs);
    if (search.advance() !== 'pass') break;
    await yieldToMessages();
  }
  return search.outcome();
}

/**
 * **The search with its tail on a card** (`RUNE-OPTIMIZATION.md` §7).
 *
 * The tree runs on the processor until a pass's worth of blocks is waiting, the card
 * is asked which of their pairs could clear the table's current bar, and every pair
 * it names is judged again on the processor before it may enter the table. The bar a
 * pass is asked about is never above the bar the processor holds, so a pass can only
 * send back more than it needs to, never less.
 *
 * **Passes start small and grow.** The tree prunes with the bar the table held when
 * the last pass came back, so a search that began with a pass of thirty thousand
 * blocks would build all of them against a table that is still empty. The first pass
 * is a few dozen blocks, which usually fills the table; each answered pass doubles the
 * next, up to the card's limits.
 *
 * A pass that clears more pairs than the card can report is split in two and asked
 * again — the first half's answers raise the bar the second half is asked about — and
 * a single block that still overflows is judged on the processor. A card that refuses
 * a pass after it has answered one is not asked again: what is left runs on the
 * processor, and `processorTook` says so. A card that refuses the very first pass
 * throws, so the whole search is the processor's and is reported as that.
 */
export async function searchRuneBuildsInPasses(
  problem: RuneOptimizationProblem,
  cardFor: (question: TailQuestion) => TailCard,
  passLimits: PassLimits,
  part = 0,
  parts = 1,
  hooks: SearchHooks = {},
): Promise<{ outcome: SearchOutcome; processorTook: boolean }> {
  const { sharedBar } = hooks;
  const search = createSearch(problem, part, parts, hooks);
  const card = cardFor(search.question());
  let current: PassLimits = { blocks: Math.min(64, passLimits.blocks), pairs: Math.min(1 << 16, passLimits.pairs) };
  let answered = 0;
  let processorTook = false;
  let settled = 0;

  async function ask(from: number, to: number): Promise<void> {
    if (search.stopped) return;
    const pass = search.pass(from, to);
    const survivors = await card(pass, search.bar());
    if (survivors === null) {
      if (to - from === 1) {
        search.evaluateHeld(from, to);
      } else {
        const middle = from + Math.floor((to - from) / 2);
        await ask(from, middle);
        await ask(middle, to);
        return;
      }
    } else {
      answered += 1;
      search.countPairs(pass.pairs);
      search.confirm(from, to, survivors);
    }
    settled = to;
    if (sharedBar) search.raiseBar(sharedBar());
    search.checkClock();
  }

  for (;;) {
    if (sharedBar) search.raiseBar(sharedBar());
    if (!processorTook) search.setMode('card', current);
    const state = search.advance();
    const waiting = search.pending();
    if (waiting > 0) {
      settled = 0;
      try {
        await ask(0, waiting);
        current = {
          blocks: Math.min(passLimits.blocks, current.blocks * 2),
          pairs: Math.min(passLimits.pairs, current.pairs * 2),
        };
      } catch (error) {
        if (answered === 0) throw error;
        processorTook = true;
        search.setMode('processor');
        search.evaluateHeld(settled, waiting);
      }
      search.clearHeld();
    }
    if (state !== 'pass' || search.stopped) break;
  }
  return { outcome: search.outcome(), processorTook };
}
