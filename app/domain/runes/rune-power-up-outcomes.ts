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
import { runeRarityOrder, slotAllowsSubStat } from './runes';
import type { Rune } from './runes';
import { addedSubPropertyRange, allStatIds, remainingEvents, subPropertyRange } from './rune-properties';
import { craftedScore, craftedScoreAgainst, craftedScoreCeiling, gemOptions, grindCredit, groundValue, priceList } from './craft/rune-craft-end-state';
import type { CraftPlan, EndStateLine, GemOptions, PriceList } from './craft/rune-craft-end-state';
import type { Valuation } from './rune-substat-weights';
import type { CalculationBackend } from '../shared/calculation-summary';

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
 * shipped roles: 1,024 runs retained 67 Keep and 170 Power up, 4,096 retained 67 and
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
 *
 * **A stone is not one of those fields.** It prices an end state and never decides
 * which improvement lands where, so it cannot change what the rune may become. Taking
 * it in gave a rune ground to exactly the credited stone a different stream from the
 * same rune bare, and once the Gem's expectation began choosing Best role from that
 * stream, the grind moved the role and the Max value with it — against the one
 * standard of `RUNE-CLEANUP-MATH.md` §9.2 that a stone the credit already counts
 * changes nothing.
 */
export function runeSeedOf(rune: Rune): number {
  let seed = 0x811c9dc5;
  const take = (value: number) => { seed = Math.imul(seed ^ (value | 0), 0x01000193) >>> 0; };
  take(rune.slot);
  take(rune.stars);
  take(rune.ancient ? 1 : 0);
  take(runeRarityOrder(rune.rarity));
  take(rune.level);
  take(rune.mainStatId);
  take(rune.prefixStatId ?? -1);
  take(rune.prefixValue);
  for (const line of rune.subProperties) {
    take(line.statId);
    take(line.value);
    /* The stone's place, held at an unground line's zero: a ground rune draws its bare
       twin's stream, and every unground rune keeps the one it always had. */
    take(0);
    take(line.gemmed ? 1 : 0);
  }
  return mix(seed);
}

/** One end of a roll, as the tables state it. */
type Interval = { minimum: number; maximum: number };

/**
 * Everything about what a rune may still become, worked out once per rune.
 *
 * It reads nothing about the role, so one of these serves every role the rune is
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
  const { events } = remainingEvents(rune.level, rune.rarity);
  const held: EndStateLine[] = rune.subProperties.map((line) => ({
    statId: line.statId, value: line.value, grind: line.grind, gemmed: line.gemmed,
  }));
  const heldIds = new Set(held.map((line) => line.statId));
  const pool: number[] = [];
  const poolInitial: Interval[] = [];
  for (const statId of allStatIds) {
    if (heldIds.has(statId) || statId === rune.mainStatId || statId === rune.prefixStatId
      || !slotAllowsSubStat(rune.slot, statId)) continue;
    /* An Ancient rune's higher interval belongs to the lines it was born with. A line
       it gains by power-up rolls from the ordinary six-star table, as the user's own
       Hero and Rare Ancient runes show with added lines below the Ancient minimum
       (`rune-properties.ts`). Reading the Ancient table here inflated the Max value
       and Chance of every unfinished non-Legend Ancient rune by about a roll-step per
       line still to come. */
    const initial = addedSubPropertyRange(rune.stars, statId);
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
 * this is a fact about the role, and every role asks the same rune the same
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

export function runeInnateScore(rune: Pick<Rune, 'prefixStatId' | 'prefixValue'>, prices: PriceList): number {
  return rune.prefixStatId === null ? 0 : rune.prefixValue * prices[rune.prefixStatId];
}

export function endStateScoring(rune: Rune, valuation: Valuation, plan: CraftPlan): EndStateScoring {
  const prices = priceList(valuation);
  return {
    valuation,
    prices,
    plan,
    options: gemOptions(plan, prices, rune.slot, rune.mainStatId, rune.prefixStatId),
    prefixScore: runeInnateScore(rune, prices),
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
 * **The best end state the rune can still reach**, every remaining roll at its
 * maximum: the Max value a view prints.
 *
 * Two facts make this an enumeration of a few hundred arrangements rather than a
 * search over thousands:
 *
 * - **Every improvement concentrates on one line.** A line-up's value is linear in
 *   how the improvements are split, and a Gem placed where it gains most is a maximum
 *   of linear terms and therefore convex, so the sum is maximised at a corner of the
 *   split — all of them on one line. Which line that is depends on what the Gem then
 *   does, so all of them are offered. The Gem's placement is chosen on the reference
 *   rune rather than at the credit, so for `craftedScore` this is the maxima corner by
 *   definition, not a proven maximum over every run; `reachableCeiling` is the bound.
 * - **The order additions arrive in cannot matter**, because no improvement follows
 *   them. So the subsets are enumerated, not the orderings.
 *
 * Every roll takes its interval's maximum, and `craftedScore` settles the Gem.
 */
export function bestEndState(future: RuneFuture, scoring: EndStateScoring): number {
  return endStateAtMaxima(future, scoring, craftedScore);
}

/**
 * **No run of the rune ends above this**, which is what lets a chance be ruled out
 * without counting. It is `bestEndState` with the Gem wherever it gains most at the
 * credit (`craftedScoreCeiling`): the placement a Gem actually takes is chosen on the
 * reference rune and is one of those, so the convexity argument above holds for this
 * reading and only bounds the other. A bound, never a figure a view prints.
 */
export function reachableCeiling(future: RuneFuture, scoring: EndStateScoring): number {
  return endStateAtMaxima(future, scoring, craftedScoreCeiling);
}

function endStateAtMaxima(future: RuneFuture, scoring: EndStateScoring,
  score: (plan: CraftPlan, options: GemOptions, prices: PriceList, lines: readonly EndStateLine[],
    prefixScore: number, lineValues?: Float64Array) => number): number {
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
      best = Math.max(best, score(scoring.plan, scoring.options, scoring.prices,
        lines, scoring.prefixScore, scratchValues));
      return;
    }
    for (let sink = 0; sink < held.length; sink += 1) {
      const gain = future.heldUpgrade[sink].maximum * upgrades;
      lines[sink].value = held[sink].value + gain;
      best = Math.max(best, score(scoring.plan, scoring.options, scoring.prices,
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
 * rune is a fact about the rune, so one set of runs answers every role that asks
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
    if (craftedScoreAgainst(scoring.plan, scoring.options, scoring.prices,
      lines, scoring.prefixScore, scratchValues, wanted, wanted) >= wanted) hits += 1;
  }
  return hits / runs.count;
}

/* ------------------------------------------------------------ the expectation */

/**
 * **What the rune is expected to be worth without a Gem, exactly.**
 *
 * Every line is ground and nothing else is decided, so the score is linear in every
 * roll and its expectation needs no runs: each improvement lands on each held line
 * alike and averages its interval's midpoint, and each line the rune gains is any legal
 * id alike, at its initial interval's midpoint plus its stone. The Gem is the only part
 * that is not linear, and `meanGemGain` counts that.
 */
export function expectedPlainScore(future: RuneFuture, scoring: EndStateScoring): number {
  const { held, upgrades, additions, pool } = future;
  const { prices, plan } = scoring;
  let total = scoring.prefixScore;
  let upgrade = 0;
  for (let at = 0; at < held.length; at += 1) {
    const line = held[at];
    total += groundValue(plan, line.statId, line.value, line.grind) * prices[line.statId];
    const interval = future.heldUpgrade[at];
    upgrade += (interval.minimum + interval.maximum) / 2 * prices[line.statId];
  }
  if (upgrades > 0 && held.length > 0) total += upgrades * upgrade / held.length;
  if (additions > 0 && pool.length > 0) {
    let gained = 0;
    for (let index = 0; index < pool.length; index += 1) {
      const interval = future.poolInitial[index];
      gained += groundValue(plan, pool[index], (interval.minimum + interval.maximum) / 2, 0) * prices[pool[index]];
    }
    total += additions * gained / pool.length;
  }
  return total;
}

/**
 * **The most a Gem can add to any run of this rune**, which is what lets a reading be
 * skipped without counting it. A Gem gains its new line's worth less the worth of the
 * line it replaces; the new line is worth at most the best legal Gem, plus whatever a
 * stone already on that line exceeds the credit by, and the replaced line is worth at
 * least the least any line of the rune can end at.
 */
export function gemGainBound(future: RuneFuture, scoring: EndStateScoring): number {
  const { options, plan, prices } = scoring;
  if (!plan.hasGem || options.values.length === 0) return 0;
  let excess = 0;
  let least = Number.POSITIVE_INFINITY;
  for (const line of future.held) {
    excess = Math.max(excess, Math.max(0, line.grind - grindCredit(plan, line.statId)) * prices[line.statId]);
    least = Math.min(least, groundValue(plan, line.statId, line.value, line.grind) * prices[line.statId]);
  }
  if (future.additions > 0) {
    for (let index = 0; index < future.pool.length; index += 1) {
      const statId = future.pool[index];
      least = Math.min(least, groundValue(plan, statId, future.poolInitial[index].minimum, 0) * prices[statId]);
    }
  }
  return Math.max(0, options.values[0] + excess - (Number.isFinite(least) ? least : 0));
}

/** What the Gem added on average, over the runs the chance is counted on. */
export function meanGemGain(runs: RuneRuns, scoring: EndStateScoring): number {
  if (runs.count === 0 || !scoring.plan.hasGem) return 0;
  const lines = lineUpBuffer(runs.lineCount);
  for (let at = 0; at < runs.lineCount; at += 1) lines[at].gemmed = at === runs.gemmedAt;
  let total = 0;
  let read = 0;
  for (let run = 0; run < runs.count; run += 1) {
    for (let at = 0; at < runs.lineCount; at += 1) {
      lines[at].statId = runs.lines[read];
      lines[at].value = runs.lines[read + 1];
      lines[at].grind = runs.lines[read + 2];
      read += 3;
    }
    const crafted = craftedScore(scoring.plan, scoring.options, scoring.prices,
      lines, scoring.prefixScore, scratchValues);
    let plain = scoring.prefixScore;
    for (let at = 0; at < runs.lineCount; at += 1) plain += scratchValues[at];
    total += crafted - plain;
  }
  return total / runs.count;
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

export function chanceStep(future: RuneFuture, scoring: EndStateScoring, wanted: number, runs = chanceRuns): ChanceStep {
  if (future.upgrades === 0 && future.additions === 0) {
    return { settled: bestEndState(future, scoring) >= wanted ? 1 : 0, job: null };
  }
  if (reachableCeiling(future, scoring) < wanted) return { settled: 0, job: null };
  // The cheap bound sums in a different order from the scorer. Leave borderline
  // cases to the exact comparison on each sampled body.
  const least = leastEndState(future, scoring);
  if (least - least * Number.EPSILON * 8 >= wanted) return { settled: 1, job: null };
  return { settled: null, job: { future, scoring, wanted, runs } };
}

/**
 * Late upgrades revisit the same few bodies many times. Preserve their exact
 * multiplicities so checking the bar still counts every run in the fixed stream.
 */
function repeatedOutcomes(runs: RuneRuns): Map<number, number> {
  const width = runs.lineCount * 3;
  const firstByHash = new Map<number, number>();
  const counts = new Map<number, number>();
  for (let offset = 0; offset < runs.lines.length; offset += width) {
    let key = 0;
    for (let at = 0; at < width; at += 1) key = Math.imul(key, 16777619) ^ runs.lines[offset + at];
    let match = firstByHash.get(key);
    while (match !== undefined) {
      let at = 0;
      while (at < width && runs.lines[match + at] === runs.lines[offset + at]) at += 1;
      if (at === width) break;
      key = (key + 1) | 0;
      match = firstByHash.get(key);
    }
    if (match === undefined) firstByHash.set(key, offset);
    const start = match ?? offset;
    counts.set(start, (counts.get(start) ?? 0) + 1);
  }
  if (width === 0 && runs.count > 0) counts.set(0, runs.count);
  return counts;
}

export type ChanceScoreCache = {
  read: (scoring: EndStateScoring) => Float64Array | undefined;
  hasRoom: () => boolean;
  remember: (scoring: EndStateScoring, scores: Float64Array) => void;
};

/** Count the marginal events and their union on one shared stream of outcomes. */
export function countChanceGroup(future: RuneFuture, jobs: readonly CountingJob[], cache?: ChanceScoreCache) {
  const count = jobs[0]?.runs ?? 0;
  type Bar = { wanted: number; index: number };
  const byScoring = new Map<EndStateScoring, Bar[]>();
  const hits = new Uint32Array(jobs.length);
  for (const [index, job] of jobs.entries()) {
    if (job.future !== future || job.runs !== count) throw new Error('Chance events must share their future and run count.');
    const bars = byScoring.get(job.scoring) ?? [];
    bars.push({ wanted: job.wanted, index });
    byScoring.set(job.scoring, bars);
  }

  const scores = [...byScoring].map(([scoring, bars]) => {
    const known = cache?.read(scoring);
    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;
    for (const { wanted } of bars) { lowest = Math.min(lowest, wanted); highest = Math.max(highest, wanted); }
    return { scoring, bars, known, lowest, highest,
      computed: !known && cache?.hasRoom() ? new Float64Array(count) : undefined };
  });
  const runs = scores.every(({ known }) => known) ? null : playForward(future, count);
  const lines = lineUpBuffer(runs?.lineCount ?? 0);
  for (let at = 0; at < lines.length; at += 1) lines[at].gemmed = at === runs?.gemmedAt;
  const width = lines.length * 3;
  let union = 0;
  const scoreOutcome = (run: number, offset: number, weight: number) => {
    if (runs) for (let at = 0; at < lines.length; at += 1) {
      const read = offset + at * 3;
      lines[at].statId = runs.lines[read];
      lines[at].value = runs.lines[read + 1];
      lines[at].grind = runs.lines[read + 2];
    }
    let reached = false;
    for (const entry of scores) {
      const { scoring, bars, known, computed, lowest, highest } = entry;
      /* A stored stream must hold exact scores, because a later policy asks other bars of it. */
      const score = known?.[run] ?? (computed
        ? craftedScore(scoring.plan, scoring.options, scoring.prices, lines, scoring.prefixScore, scratchValues)
        : craftedScoreAgainst(scoring.plan, scoring.options, scoring.prices, lines, scoring.prefixScore,
          scratchValues, lowest, highest));
      if (computed) computed[run] = score;
      for (const { wanted, index } of bars) {
        if (score < wanted) continue;
        hits[index] += weight;
        reached = true;
      }
    }
    if (reached) union += weight;
  };
  if (!cache && runs && count >= 512 && (future.additions === 0 || future.upgrades + future.additions <= 2)) {
    for (const [offset, weight] of repeatedOutcomes(runs)) scoreOutcome(0, offset, weight);
  } else {
    for (let run = 0; run < count; run += 1) scoreOutcome(run, run * width, 1);
  }
  for (const { scoring, computed } of scores) if (computed) cache?.remember(scoring, computed);
  return { hits, union };
}

/** The processor's answer to a batch of jobs, and the reference every other one
 *  is held to. Jobs are gathered by rune first, so a rune is played forward once
 *  however many roles are asking about it. */
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

/** How a procedure asks for Clean-up's odds; the platform supplies the accelerated one. */
export type CountRuneChances = (jobs: readonly CountingJob[], preferWebGpu: boolean, chanceBar?: number)
  => Promise<{ shares: Float64Array; backend: CalculationBackend }>;

/** The processor reference every accelerated count is held to. */
export const countRuneChancesOnProcessor: CountRuneChances = async (jobs) => ({ shares: countJobs(jobs), backend: 'cpu' });
