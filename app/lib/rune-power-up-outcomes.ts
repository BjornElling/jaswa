/**
 * **What a rune's remaining power-ups can produce, and how likely the good ones are.**
 *
 * `docs/RUNE-CLEANUP-MATH.md` §7 owns the reasoning; this owns the arithmetic. It
 * answers three questions about the same rune, and they share one description of its
 * future because they are three readings of it: the best end state it can reach, the
 * worst it can be left with, and the odds of clearing a bar somewhere between.
 *
 * ## The shape of a rune's future
 *
 * The schedule is simpler than it looks, and the simplification is the whole reason
 * this file is short. `remainingEvents` writes an improvement wherever the event
 * index is below the grade's born-line count and an addition everywhere else — and
 * the indices run in order, so **every remaining improvement happens before every
 * remaining addition, without exception.** A Hero rune at `+0` improves its three
 * born lines and then adds one; a Magic rune improves its one born line and then adds
 * three; a Normal rune only ever adds.
 *
 * So no line the rune has yet to gain can ever receive an improvement, the set of
 * lines an improvement may land on never changes, and a rune's whole future is three
 * numbers and a list:
 *
 * - the lines it holds now, which are the only ones improvements can touch;
 * - how many improvements are left, each landing uniformly on one of those lines;
 * - how many lines it will still gain, drawn without replacement from the effect ids
 *   the slot, the main property and the innate leave legal;
 * - one initial roll on each line it gains.
 *
 * The previous engine enumerated the events as an ordered sequence and rediscovered
 * that structure branch by branch, at the cost of walking `10 × 9 × 8 × 7` orderings
 * of a draw whose order cannot matter.
 *
 * ## Why the odds are counted rather than enumerated
 *
 * Exactly enumerating the odds means every split of the improvements, every subset of
 * the additions, and every integer value each of those rolls can take — and then, for
 * each of those thousands of end states, the Gem decision of `rune-craft-end-state.ts`,
 * which depends on the realised values and so cannot be factored out of the sum. It is
 * the right answer computed a way that costs tens of seconds on a real box, and the
 * result is a number printed to the nearest percentage point.
 *
 * So the middle case is **played forward and counted**: the rune is taken through its
 * final substat event at `+12` and projected to `+15` without another substat roll, a
 * few thousand times, by the game's own loop, and the answer is the share of those
 * runs that cleared the bar. It is the one description of the calculation a player can
 * be told in a sentence, it applies the craft rules exactly rather than through a
 * model of them, and `verify:rune-cleanup-calibration` checks it against a simulation
 * written from the game's loop rather than from here.
 *
 * The two ends are still exact, and between them they answer most of a real box
 * without a single sample: a rune whose **best** end state misses the bar has no
 * chance at all, and one whose **worst** end state clears it has nothing to gamble on.
 *
 * ## The same rune always prints the same number
 *
 * The stream of draws is a hash of **the rune itself** — every field that decides what
 * it may become — and of the run's own number, not a generator carrying state, so a
 * rune's answer depends on nothing but the rune. Two calculations of the same box
 * agree exactly, the order the runes are judged in cannot move a verdict, two
 * identical runes are given identical odds, and the graphics card reproduces the
 * processor's stream rather than keeping one of its own. `runeSeedOf` below says why
 * it is the rune and not the id.
 */
import { runeDefaultGradeOrder, slotAllowsSubStat } from './runes';
import type { Rune } from './runes';
import { allStatIds, remainingEvents, subPropertyRange } from './rune-properties';
import { craftedScore, gemOptions, groundValue, priceList } from './rune-craft-end-state';
import type { CraftPlan, EndStateLine, GemOptions, PriceList } from './rune-craft-end-state';
import type { Valuation } from './rune-substat-weights';

/**
 * **How many runs settle a chance: 4,096.**
 *
 * This is a deterministic estimate, not an exact probability. At the widest point
 * of a binomial distribution (`p = 0.5`), 4,096 runs have a standard error of about
 * 0.78 percentage points and a 95 % interval of about ±1.53 points; at `p = 0.02`,
 * the corresponding interval is about ±0.43 points. The number that has to be
 * checked is therefore what the *box* does, because a verdict is a threshold and
 * sampling spread can flip rows.
 *
 * Measured on 1,500 synthetic runes at the fullest craft settings, against the eight
 * shipped presets: 1,024 runs retained 67 Keep and 170 Power up, 4,096 retained 67 and
 * 169, 16,384 retained 67 and 169, and 65,536 retained 67 and 169. Per slot the counts
 * move by at most one rune anywhere above 1,024. Sixteen times the work buys nothing a
 * player could see, so the second, finer round this once had was removed rather than
 * kept for the look of the thing.
 */
export const chanceRuns = 4096;

/**
 * The draws one run is allotted: four improvements and four additions, each taking a
 * target and a value, so no two draws of one run can share a counter. The additions'
 * half starts at `additionDrawsAt`, which keeps the two halves from colliding on a
 * rune that has some of each.
 *
 * Both are exported because the graphics card's version of this loop reads them from
 * here rather than writing its own. Two engines that number their draws differently
 * would play the same rune forward through different runs.
 */
export const drawsPerRun = 16;
export const additionDrawsAt = 8;

/** One well-mixed 32-bit value from a counter. The graphics card runs the same one. */
function mix(value: number): number {
  let h = value >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * A whole number in `[0, bound)`, from one draw of the stream.
 *
 * `floor(h × bound / 2³²)`, worked out as a multiply-high on the two halves of the
 * hash rather than as a division. It is written this way because the graphics card
 * has no 64-bit multiply and no double: turning the hash into a float there would
 * round it above 2²⁴, and the two engines would then draw different rolls for the
 * same rune. Every bound here is under 512, so both halves stay inside 32 bits.
 */
function drawBelow(seed: number, counter: number, bound: number): number {
  const h = mix((seed ^ counter) >>> 0);
  const hi = h >>> 16;
  const lo = h & 0xffff;
  return (bound * hi + ((bound * lo) >>> 16)) >>> 16;
}

/**
 * **The rune's own seed, from the rune itself rather than from its id.**
 *
 * Every field that decides what the rune may become goes in, and nothing else does.
 * Two consequences, and the second is the reason:
 *
 * - A rune that has not changed always draws the same stream, so two calculations of
 *   one box agree exactly and the order the runes are judged in cannot move a verdict.
 * - **Two identical runes are given identical odds.** Seeding from the id instead put
 *   three copies of one rune in a box at 55 %, 56 % and 57 % — each answer honest to
 *   its own resolution, and the three of them together an obvious defect on screen. A
 *   chance is a fact about a rune, so it must not depend on which rune it is.
 */
export function runeSeedOf(rune: Rune): number {
  let seed = 0x811c9dc5;
  const take = (value: number) => { seed = Math.imul(seed ^ (value | 0), 0x01000193) >>> 0; };
  take(rune.slot);
  take(rune.stars);
  take(rune.ancient ? 1 : 0);
  take(runeDefaultGradeOrder(rune.defaultGrade));
  take(rune.level);
  take(rune.mainStatId);
  take(rune.prefixStatId ?? -1);
  take(rune.prefixValue);
  for (const line of rune.subProperties) {
    take(line.statId);
    take(line.value);
    take(line.grind);
    take(line.gemmed ? 1 : 0);
  }
  return mix(seed);
}

/** One end of a roll, as the tables state it. */
type Interval = { minimum: number; maximum: number };

/**
 * Everything about what a rune may still become, worked out once per rune.
 *
 * It reads nothing about the role, so one of these serves every preset the rune is
 * judged against — which is also why the sample runs can be shared.
 */
export type RuneFuture = {
  readonly rune: Rune;
  /** The lines it holds now. Every remaining improvement lands on one of these. */
  readonly held: readonly EndStateLine[];
  /** One improvement's interval per held line, in the same order. */
  readonly heldUpgrade: readonly Interval[];
  readonly upgrades: number;
  readonly additions: number;
  /** The effect ids an addition may take. */
  readonly pool: Int32Array;
  /** One initial roll's interval per pool id, in the same order. */
  readonly poolInitial: readonly Interval[];
  /** The rune's converted line, as an index into `held`, or `-1`. */
  readonly gemmedAt: number;
  readonly seed: number;
};

/**
 * For a held line whose effect id has no upgrade interval at this star class — which
 * means an import the reader should have refused. The line stays, because it exists
 * on the rune and dropping it would understate what the player owns; its improvements
 * are worth nothing, which is the visible answer rather than an invented interval.
 */
const emptyInterval: Interval = { minimum: 0, maximum: 0 };

export function runeFuture(rune: Rune): RuneFuture {
  const { events } = remainingEvents(rune.level, runeDefaultGradeOrder(rune.defaultGrade));
  const held: EndStateLine[] = rune.subProperties.map((line) => ({
    statId: line.statId, value: line.value, grind: line.grind, gemmed: line.gemmed,
  }));
  const heldIds = new Set(held.map((line) => line.statId));
  const pool: number[] = [];
  const poolInitial: Interval[] = [];
  for (const statId of allStatIds) {
    if (heldIds.has(statId) || statId === rune.mainStatId || statId === rune.prefixStatId
      || !slotAllowsSubStat(rune.slot, statId)) continue;
    /* An Ancient rune's higher interval belongs to a line's *initial* roll, and a line
       the rune gains at +6 is having its initial roll then (`RUNE-CLEANUP-MATH.md` §8).
       Its later improvements stay on the ordinary six-star table. */
    const initial = subPropertyRange(rune.stars, statId, 'initial', rune.ancient);
    /* An id with no interval at this star class is one the game cannot roll here, so
       it is not a line the rune may gain. Keeping it with a zero-wide interval would
       put a line worth nothing into the draw and take a real one's place. */
    if (!initial) continue;
    pool.push(statId);
    poolInitial.push(initial);
  }
  return {
    rune,
    held,
    heldUpgrade: held.map((line) => subPropertyRange(rune.stars, line.statId, 'upgrade') ?? emptyInterval),
    upgrades: events.filter((event) => event === 'roll').length,
    /* A rune cannot gain a line there is no legal id left for. The import would have
       to be malformed for this to bite, and silently adding a line of no type would
       be worse than the rune simply ending with fewer. */
    additions: Math.min(events.filter((event) => event === 'add').length, pool.length),
    pool: Int32Array.from(pool),
    poolInitial,
    gemmedAt: held.findIndex((line) => line.gemmed),
    seed: runeSeedOf(rune),
  };
}

/**
 * What the role pays, and what its craft items can do — one rune against one build.
 *
 * It is separate from `RuneFuture` because the future is a fact about the rune and
 * this is a fact about the role, and every preset asks the same rune the same
 * question with a different one of these.
 */
export type EndStateScoring = {
  readonly valuation: Valuation;
  readonly prices: PriceList;
  readonly plan: CraftPlan;
  readonly options: GemOptions;
  /** The innate's contribution, which takes neither craft item and never changes. */
  readonly prefixScore: number;
};

export function endStateScoring(rune: Rune, valuation: Valuation, plan: CraftPlan): EndStateScoring {
  const prices = priceList(valuation);
  return {
    valuation,
    prices,
    plan,
    options: gemOptions(plan, prices, rune.slot, rune.mainStatId, rune.prefixStatId),
    prefixScore: rune.prefixStatId === null ? 0 : rune.prefixValue * prices[rune.prefixStatId],
  };
}

/* ------------------------------------------------------------------ the two ends */

/**
 * A line-up buffer reused across the enumerations below, which are hot enough that a
 * fresh object per arrangement was most of what they spent. Nothing here is
 * re-entrant, and nothing here is asynchronous, so one buffer serves the file.
 */
const scratchLines: EndStateLine[] = [];
let scratchValues = new Float64Array(8);

function lineUpBuffer(size: number): EndStateLine[] {
  while (scratchLines.length < size) scratchLines.push({ statId: 0, value: 0, grind: 0, gemmed: false });
  scratchLines.length = size;
  if (scratchValues.length < size) scratchValues = new Float64Array(size);
  return scratchLines;
}

/**
 * **The best end state the rune can still reach.**
 *
 * Two facts make this an enumeration of a few hundred arrangements rather than a
 * search over thousands:
 *
 * - **Every improvement concentrates on one line.** A line-up's value is linear in
 *   how the improvements are split, and the Gem's gain is a maximum of linear terms
 *   and therefore convex, so the sum is maximised at a corner of the split — all of
 *   them on one line. Which line that is depends on what the Gem then does, so all of
 *   them are offered.
 * - **The order additions arrive in cannot matter**, because no improvement follows
 *   them. So the subsets are enumerated, not the orderings.
 *
 * Every roll takes its interval's maximum, and `craftedScore` settles the Gem.
 */
export function bestEndState(future: RuneFuture, scoring: EndStateScoring): number {
  const { held, pool, upgrades, additions } = future;
  const lineCount = held.length + additions;
  if (lineCount === 0) return scoring.prefixScore;

  /* Which ids to add is not a greedy choice, because the Gem may want one of them
     gone: the best line-up is sometimes the one that leaves an id free. So the subsets
     are enumerated. `pool` is eleven ids at worst and `additions` four, which is 330
     of them, each priced against at most four places to put the improvements. */
  const chosen = new Int32Array(additions);
  let best = -Infinity;

  const withAdditions = () => {
    const lines = lineUpBuffer(lineCount);
    for (let at = 0; at < held.length; at += 1) {
      const line = held[at];
      lines[at].statId = line.statId;
      lines[at].value = line.value;
      lines[at].grind = line.grind;
      lines[at].gemmed = line.gemmed;
    }
    for (let at = 0; at < additions; at += 1) {
      const index = chosen[at];
      const line = lines[held.length + at];
      line.statId = future.pool[index];
      line.value = future.poolInitial[index].maximum;
      line.grind = 0;
      line.gemmed = false;
    }
    /* No improvements left, or no line to put them on: one arrangement. */
    if (upgrades === 0 || held.length === 0) {
      best = Math.max(best, craftedScore(scoring.plan, scoring.options, scoring.prices,
        lines, scoring.prefixScore, scratchValues));
      return;
    }
    for (let sink = 0; sink < held.length; sink += 1) {
      const gain = future.heldUpgrade[sink].maximum * upgrades;
      lines[sink].value = held[sink].value + gain;
      best = Math.max(best, craftedScore(scoring.plan, scoring.options, scoring.prices,
        lines, scoring.prefixScore, scratchValues));
      lines[sink].value = held[sink].value;
    }
  };

  const walk = (at: number, from: number) => {
    if (at === additions) { withAdditions(); return; }
    for (let index = from; index <= pool.length - (additions - at); index += 1) {
      chosen[at] = index;
      walk(at + 1, index + 1);
    }
  };
  walk(0, 0);
  return best;
}

/**
 * **A floor under the rune's end state** — what it is worth even if every remaining
 * roll is the worst its table allows and every added line is the least useful one.
 *
 * It is a bound rather than a search, and deliberately so: a Gem is never forced, so
 * ignoring it can only understate the rune, and the plain sum is linear and therefore
 * at its smallest with every improvement on the cheapest line and the cheapest ids
 * added. A rune already above the bar by this reading is a certainty, and certainty
 * is what this is for.
 */
export function leastEndState(future: RuneFuture, scoring: EndStateScoring): number {
  const { held, upgrades, additions, pool } = future;
  const { prices, plan } = scoring;
  let total = scoring.prefixScore;
  let cheapestUpgrade = Number.POSITIVE_INFINITY;
  for (let at = 0; at < held.length; at += 1) {
    const line = held[at];
    total += groundValue(plan, line.statId, line.value, line.grind) * prices[line.statId];
    const step = future.heldUpgrade[at].minimum * prices[line.statId];
    if (step < cheapestUpgrade) cheapestUpgrade = step;
  }
  if (upgrades > 0 && held.length > 0) total += cheapestUpgrade * upgrades;

  if (additions > 0) {
    const worth: number[] = [];
    for (let index = 0; index < pool.length; index += 1) {
      const statId = pool[index];
      worth.push(groundValue(plan, statId, future.poolInitial[index].minimum, 0) * prices[statId]);
    }
    worth.sort((left, right) => left - right);
    for (let at = 0; at < additions; at += 1) total += worth[at];
  }
  return total;
}

/* --------------------------------------------------------------------- the runs */

/**
 * The rune played forward through `+12`; its substat state is therefore also its
 * state at `+15`, because the last three levels improve only the main property.
 *
 * Only the *lines* are recorded, not what they are worth: what the game does to a
 * rune is a fact about the rune, so one set of runs answers every preset that asks
 * about it, and the role's price list is applied afterwards. The stones are applied
 * afterwards too, so the same runs serve every craft credit.
 *
 * Three whole numbers per line: its effect id, its rolls added up, and whatever stone
 * the rune already carries there.
 */
export type RuneRuns = {
  readonly count: number;
  readonly lineCount: number;
  /** `count × lineCount × 3`. */
  readonly lines: Int32Array;
  /** The converted line's index within each run, or `-1`. */
  readonly gemmedAt: number;
};

export function playForward(future: RuneFuture, count: number): RuneRuns {
  const { held, pool, upgrades, additions, seed } = future;
  const lineCount = held.length + additions;
  const lines = new Int32Array(count * lineCount * 3);
  /* The pool is shuffled in place per run, which is how a draw without replacement is
     done without allocating: the first `additions` entries are the drawn ids. */
  const bag = new Int32Array(pool.length);
  const bagInitial = future.poolInitial;
  const order = new Int32Array(pool.length);

  for (let run = 0; run < count; run += 1) {
    const counter = run * drawsPerRun;
    let at = run * lineCount * 3;
    /* The held lines, with this run's share of the improvements. */
    for (let line = 0; line < held.length; line += 1) {
      lines[at] = held[line].statId;
      lines[at + 1] = held[line].value;
      lines[at + 2] = held[line].grind;
      at += 3;
    }
    for (let step = 0; step < upgrades; step += 1) {
      if (held.length === 0) break;
      const target = drawBelow(seed, counter + step * 2, held.length);
      const interval = future.heldUpgrade[target];
      const roll = interval.minimum
        + drawBelow(seed, counter + step * 2 + 1, interval.maximum - interval.minimum + 1);
      lines[run * lineCount * 3 + target * 3 + 1] += roll;
    }
    /* The lines it gains, drawn without replacement, each with one initial roll. */
    for (let index = 0; index < pool.length; index += 1) { bag[index] = pool[index]; order[index] = index; }
    let left = pool.length;
    for (let step = 0; step < additions; step += 1) {
      const pick = drawBelow(seed, counter + additionDrawsAt + step * 2, left);
      const index = order[pick];
      const statId = bag[pick];
      left -= 1;
      bag[pick] = bag[left]; order[pick] = order[left];
      const interval = bagInitial[index];
      const roll = interval.minimum
        + drawBelow(seed, counter + additionDrawsAt + 1 + step * 2, interval.maximum - interval.minimum + 1);
      lines[at] = statId;
      lines[at + 1] = roll;
      lines[at + 2] = 0;
      at += 3;
    }
  }
  return { count, lineCount, lines, gemmedAt: future.gemmedAt };
}

/** The share of the runs whose best legal end state reaches `wanted`. */
export function shareReaching(runs: RuneRuns, scoring: EndStateScoring, wanted: number): number {
  if (runs.count === 0) return 0;
  const lines = lineUpBuffer(runs.lineCount);
  for (let at = 0; at < runs.lineCount; at += 1) lines[at].gemmed = at === runs.gemmedAt;
  let hits = 0;
  let read = 0;
  for (let run = 0; run < runs.count; run += 1) {
    for (let at = 0; at < runs.lineCount; at += 1) {
      lines[at].statId = runs.lines[read];
      lines[at].value = runs.lines[read + 1];
      lines[at].grind = runs.lines[read + 2];
      read += 3;
    }
    if (craftedScore(scoring.plan, scoring.options, scoring.prices,
      lines, scoring.prefixScore, scratchValues) >= wanted) hits += 1;
  }
  return hits / runs.count;
}

/** What one run came out worth, for a check that needs the value and not a share. */
export function runScore(runs: RuneRuns, scoring: EndStateScoring, run: number): number {
  const lines = lineUpBuffer(runs.lineCount);
  let read = run * runs.lineCount * 3;
  for (let at = 0; at < runs.lineCount; at += 1) {
    lines[at].statId = runs.lines[read];
    lines[at].value = runs.lines[read + 1];
    lines[at].grind = runs.lines[read + 2];
    lines[at].gemmed = at === runs.gemmedAt;
    read += 3;
  }
  return craftedScore(scoring.plan, scoring.options, scoring.prices,
    lines, scoring.prefixScore, scratchValues);
}

/**
 * **What answering one rune's odds against one bar needs**, by the three-step rule
 * this file exists to state: a certain no, a certain yes, or a count.
 *
 * The two certainties are settled here and cost nothing, which is most of a real box:
 * a rune already at `+12` has no substat gamble left, most runes cannot reach the quality
 * floor by any road, and a few cannot miss it. Only what is left becomes a job, and a
 * job is the unit the processor and the graphics card both answer in.
 */
export type ChanceStep = { settled: number; job: null } | { settled: null; job: CountingJob };

/** One rune played forward `runs` times, scored one way, against one bar. */
export type CountingJob = {
  readonly future: RuneFuture;
  readonly scoring: EndStateScoring;
  readonly wanted: number;
  readonly runs: number;
};

export function chanceStep(future: RuneFuture, scoring: EndStateScoring, wanted: number): ChanceStep {
  if (future.upgrades === 0 && future.additions === 0) {
    return { settled: bestEndState(future, scoring) >= wanted ? 1 : 0, job: null };
  }
  if (bestEndState(future, scoring) < wanted) return { settled: 0, job: null };
  if (leastEndState(future, scoring) >= wanted) return { settled: 1, job: null };
  return { settled: null, job: { future, scoring, wanted, runs: chanceRuns } };
}

/** The processor's answer to a batch of jobs, and the reference every other one
 *  is held to. Jobs are gathered by rune first, so a rune is played forward once
 *  however many presets are asking about it. */
export function countJobs(jobs: readonly CountingJob[]): Float64Array {
  const shares = new Float64Array(jobs.length);
  const byRune = new Map<RuneFuture, number[]>();
  for (let at = 0; at < jobs.length; at += 1) {
    const found = byRune.get(jobs[at].future);
    if (found) found.push(at); else byRune.set(jobs[at].future, [at]);
  }
  for (const [future, indexes] of byRune) {
    let runs: RuneRuns | null = null;
    let runCount = -1;
    for (const at of indexes) {
      const job = jobs[at];
      if (!runs || runCount !== job.runs) { runs = playForward(future, job.runs); runCount = job.runs; }
      shares[at] = shareReaching(runs, job.scoring, job.wanted);
    }
  }
  return shares;
}
