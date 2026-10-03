import {
  addSetBonuses, baseStatCount, effectSlotCount, figuresInto, intangibleCompletion,
  intangibleSetId, statSetBonuses, targetFigureCount, totalsInto,
} from './monster-stats';
import { canStillFinishSets, canStillSatisfy, noBrokenSets, satisfiesBuild } from './rune-optimization-problem';
import type { BuildRequirement, Candidate, RuneOptimizationProblem } from './rune-optimization-problem';

/** A free slot should not promise a four-set beside an already required four-set. */
export function availableStatSets(builds: readonly BuildRequirement[] | null): typeof statSetBonuses {
  return statSetBonuses.filter(([setId, pieces]) => builds === null || builds.some((build) =>
    build.free >= pieces || build.needs.some((need) => need.setId === setId)));
}

type Prefix = {
  picks: Candidate[];
  effects: Float64Array;
  counts: Int32Array;
  spent: number[];
  score: number;
};

function bestPrefixes(prefixes: Prefix[], relevant: readonly number[], limit: number): Prefix[] {
  prefixes.sort((a, b) => b.score - a.score);
  const signatures = new Map<string, number>();
  const kept: Prefix[] = [];
  for (const prefix of prefixes) {
    const signature = `${Array.from(prefix.counts)}|${relevant.map((stat) => prefix.effects[stat])}|${prefix.spent}`;
    const count = signatures.get(signature) ?? 0;
    if (count >= 2) continue;
    signatures.set(signature, count + 1);
    kept.push(prefix);
    if (kept.length === limit) break;
  }
  return kept;
}

/**
 * Look for whole builds before choosing individual runes. This is guidance for
 * the reported depth cut, never an exact reduction: a narrow beam can miss a
 * complement, so its picks supplement rather than replace the independent cut.
 * Several prices for unmet ranges keep damage and feasibility in contention.
 */
export function complementaryCandidates(problem: RuneOptimizationProblem): { candidates: Set<Candidate>; builds: Candidate[][] } {
  const selected = new Set<Candidate>();
  const guides: Candidate[][] = [];
  if (problem.slots.some((slot) => slot.length === 0)) return { candidates: selected, builds: guides };
  const order = problem.slots.map((_, slot) => slot)
    .sort((a, b) => problem.slots[a].length - problem.slots[b].length || a - b);
  const remaining = Array.from({ length: 7 }, () => new Float64Array(effectSlotCount));
  for (let depth = 5; depth >= 0; depth -= 1) {
    const candidates = problem.slots[order[depth]];
    const families = new Map<string, Candidate>();
    // Gem alternatives must not give one physical rune several votes in the reference.
    for (const candidate of candidates) {
      const previous = families.get(candidate.runeId);
      if (!previous || candidate.proxy > previous.proxy) families.set(candidate.runeId, candidate);
    }
    for (let stat = 0; stat < effectSlotCount; stat += 1) {
      let sum = 0;
      for (const candidate of families.values()) sum += candidate.effects[stat];
      remaining[depth][stat] = remaining[depth + 1][stat] + sum / families.size;
    }
  }
  const totals = new Float64Array(baseStatCount);
  const figures = new Float64Array(targetFigureCount);
  const projected = new Float64Array(effectSlotCount);
  const limits = [...problem.targets.keys()].filter((at) => Number.isFinite(problem.targets[at]) || Number.isFinite(problem.ceilings[at]));
  const read = (effects: Float64Array) => {
    totalsInto(problem.base, effects, totals);
    figuresInto(totals, figures);
  };
  for (let stat = 0; stat < effectSlotCount; stat += 1) projected[stat] = problem.start[stat] + remaining[0][stat];
  read(projected);
  const rankScale = Math.max(1, figures[problem.rank]);
  const scales = Float64Array.from(figures, (value, at) => Math.max(1, Math.abs(value),
    Number.isFinite(problem.targets[at]) ? Math.abs(problem.targets[at]) : 0,
    Number.isFinite(problem.ceilings[at]) ? Math.abs(problem.ceilings[at]) : 0));
  const complete: Prefix[] = [];
  const freeSets = problem.builds === null || problem.builds.some((build) => build.free > 0);
  const orderableBonuses = availableStatSets(problem.builds);

  // Fixed work across depths makes the guidance independent of the larger depth's cut.
  for (const price of [1, 4, 16, 64]) {
    let beam: Prefix[] = [{ picks: [], effects: new Float64Array(problem.start),
      counts: new Int32Array(problem.setPieces.length), spent: [], score: 0 }];
    for (let depth = 0; depth < 6 && beam.length > 0; depth += 1) {
      let next: Prefix[] = [];
      for (const prefix of beam) for (const candidate of problem.slots[order[depth]]) {
        if (candidate.setId === intangibleSetId && prefix.counts[intangibleSetId] > 0) continue;
        const counts = new Int32Array(prefix.counts);
        counts[candidate.setId] += 1;
        if (problem.builds !== null && !problem.builds.some((build) => canStillSatisfy(build, counts, depth + 1))) continue;
        if (!problem.allowBroken && !canStillFinishSets(counts, depth + 1, problem.setPieces)) continue;
        // A prefix spends only a few stacks, even when the account owns thousands.
        // Copying the whole inventory for every beam expansion was the dominant
        // allocation cost on an open crafted search.
        const spent = [...prefix.spent, ...candidate.stock].sort((a, b) => a - b);
        let available = true;
        for (const stack of candidate.stock) {
          let used = 0;
          for (const entry of spent) if (entry === stack) used += 1;
          if (used > problem.stock[stack].amount) { available = false; break; }
        }
        if (!available) continue;
        const effects = new Float64Array(prefix.effects);
        for (let stat = 0; stat < effectSlotCount; stat += 1) {
          effects[stat] += candidate.effects[stat];
          projected[stat] = effects[stat] + remaining[depth + 1][stat];
        }
        const completes = intangibleCompletion(counts);
        if (depth === 5) {
          if (counts[intangibleSetId] > 0 && completes < 0) continue;
          if (problem.builds !== null && !problem.builds.some((build) => satisfiesBuild(build, counts, completes))) continue;
          if (!problem.allowBroken && !noBrokenSets(counts, completes, problem.setPieces)) continue;
        }
        addSetBonuses(counts, completes, projected);
        if (freeSets && depth < 5) {
          // A partial stat set earns a share of its bonus only for ordering the
          // beam. Finished guides and the final search count completed sets alone.
          for (const [setId, pieces, stat, value] of orderableBonuses) {
            const credited = counts[setId] + (completes === setId ? 1 : 0);
            projected[stat] += (credited % pieces) * value / pieces;
          }
        }
        read(projected);
        let deficit = 0;
        for (const at of limits) {
          if (figures[at] < problem.targets[at]) deficit += (problem.targets[at] - figures[at]) / scales[at];
          if (figures[at] > problem.ceilings[at]) deficit += (figures[at] - problem.ceilings[at]) / scales[at];
        }
        if (depth === 5 && deficit > 0) continue;
        next.push({ picks: [...prefix.picks, candidate], effects, counts, spent,
          score: figures[problem.rank] / rankScale - price * deficit });
        // A wide crafted pool must not allocate its whole cross product in memory.
        // Anything below 128 distinct leaders cannot enter the final 64 leaders.
        if (next.length >= 4096) next = bestPrefixes(next, problem.relevant, 128);
      }
      // Equivalent prefixes offer no new complement. Keep several for the result table.
      beam = bestPrefixes(next, problem.relevant, 64);
    }
    complete.push(...beam.filter((prefix) => prefix.picks.length === 6));
  }
  complete.sort((a, b) => b.score - a.score);
  const seeds: Prefix[] = [];
  for (const prefix of complete) {
    if (seeds.some((seed) => prefix.picks.filter((candidate, at) => candidate.runeId !== seed.picks[at].runeId).length < 2)) continue;
    seeds.push(prefix);
    if (seeds.length === 4) break;
  }
  for (const best of seeds) {
    const picks = new Array<Candidate>(6);
    best.picks.forEach((candidate, at) => { picks[order[at]] = candidate; });
    const counts = best.counts;
    const bonus = new Float64Array(effectSlotCount);
    addSetBonuses(counts, intangibleCompletion(counts), bonus);
    const effects = new Float64Array(best.effects);
    for (let stat = 0; stat < effectSlotCount; stat += 1) projected[stat] = effects[stat] + bonus[stat];
    read(projected);
    let bestRank = figures[problem.rank];
    let examined = 0;
    // Two slots can trade speed for damage while neither replacement works alone.
    // Keeping their sets preserves the complete build, including its Intangible.
    for (let round = 0; round < 2 && examined < 200_000; round += 1) {
      let improved = false;
      for (let first = 0; first < 5 && examined < 200_000; first += 1) {
        for (let second = first + 1; second < 6 && examined < 200_000; second += 1) {
          const aBefore = picks[first]; const bBefore = picks[second];
          const rest = Float64Array.from(effects, (value, stat) => value - aBefore.effects[stat] - bBefore.effects[stat] + bonus[stat]);
          let aBest = aBefore; let bBest = bBefore;
          for (const a of problem.slots[first]) {
            if (a.setId !== aBefore.setId || examined >= 200_000) continue;
            for (const b of problem.slots[second]) {
              if (b.setId !== bBefore.setId || examined >= 200_000) continue;
              examined += 1;
              for (let stat = 0; stat < effectSlotCount; stat += 1) projected[stat] = rest[stat] + a.effects[stat] + b.effects[stat];
              read(projected);
              if (figures[problem.rank] <= bestRank || limits.some((at) => figures[at] < problem.targets[at] || figures[at] > problem.ceilings[at])) continue;
              const spent = new Int32Array(problem.stock.length);
              let available = true;
              for (let slot = 0; slot < 6 && available; slot += 1) {
                for (const stack of (slot === first ? a : slot === second ? b : picks[slot]).stock) {
                  spent[stack] += 1;
                  if (spent[stack] > problem.stock[stack].amount) { available = false; break; }
                }
              }
              if (!available) continue;
              aBest = a; bBest = b; bestRank = figures[problem.rank]; improved = true;
            }
          }
          picks[first] = aBest; picks[second] = bBest;
          for (let stat = 0; stat < effectSlotCount; stat += 1) effects[stat] = rest[stat] - bonus[stat] + aBest.effects[stat] + bBest.effects[stat];
          for (const candidate of picks) selected.add(candidate);
        }
      }
      if (!improved) break;
    }
    guides.push([...picks]);
  }
  // Preserve the same guide at every finite depth, so shallower discoveries survive.
  for (const prefix of complete.slice(0, 12)) {
    const picks = new Array<Candidate>(6);
    prefix.picks.forEach((candidate, at) => { picks[order[at]] = candidate; selected.add(candidate); });
    guides.push(picks);
  }
  return { candidates: selected, builds: guides };
}

/**
 * An impossible range needs no heuristic. Independent maxima and every stat set
 * at once deliberately overestimate what five other slots can supply; minima
 * omit all set bonuses. Failing these bounds proves a candidate cannot be worn.
 */
export function rangeFeasibleCandidates(problem: RuneOptimizationProblem): Candidate[][] {
  const maxima = problem.slots.map((slot) => Float64Array.from({ length: effectSlotCount }, (_, stat) =>
    slot.reduce((best, candidate) => Math.max(best, candidate.effects[stat]), 0)));
  const minima = problem.slots.map((slot) => Float64Array.from({ length: effectSlotCount }, (_, stat) =>
    slot.reduce((best, candidate) => Math.min(best, candidate.effects[stat]), Infinity)));
  if (problem.slots.some((slot) => slot.length === 0)) return problem.slots;
  const totals = new Float64Array(baseStatCount);
  const figures = new Float64Array(targetFigureCount);
  return problem.slots.map((slot, own) => {
    const high = new Float64Array(problem.start);
    const low = new Float64Array(problem.start);
    for (let other = 0; other < 6; other += 1) if (other !== own) {
      for (let stat = 0; stat < effectSlotCount; stat += 1) {
        high[stat] += maxima[other][stat];
        low[stat] += minima[other][stat];
      }
    }
    for (const [, pieces, stat, value] of statSetBonuses) high[stat] += Math.floor(6 / pieces) * value;
    return slot.filter((candidate) => {
      const effects = Float64Array.from(high, (value, stat) => value + candidate.effects[stat]);
      totalsInto(problem.base, effects, totals); figuresInto(totals, figures);
      if (figures.some((value, at) => value < problem.targets[at])) return false;
      for (let stat = 0; stat < effectSlotCount; stat += 1) effects[stat] = low[stat] + candidate.effects[stat];
      totalsInto(problem.base, effects, totals); figuresInto(totals, figures);
      return !figures.some((value, at) => value > problem.ceilings[at]);
    });
  });
}
