/**
 * **The single source of truth for what a rune is worth and what it may become.**
 *
 * `docs/RUNE-CLEANUP-MATH.md` owns the reasoning; this owns the arithmetic. Every
 * figure the Rune Clean-up page states — a rune's Max value, its chance of reaching a
 * threshold, which role suits it — is settled here and nowhere else. A second
 * implementation would not merely duplicate work: it would drift, and the page would
 * then state two Max values for the same rune without either being obviously wrong.
 *
 * Two modules are underneath it and own one question each, because both were being
 * answered in several places and two of the copies had already drifted:
 * `rune-craft-end-state.ts` says what a Gem and a Grindstone do to a finished rune,
 * and `rune-power-up-outcomes.ts` says what a rune may still become and how likely
 * that is. The deliberate exception to all of it is
 * `scripts/verify-rune-cleanup-calibration.mjs`, which re-derives both from the game's
 * own rules precisely so that a disagreement is caught.
 *
 * ## One currency, two questions
 *
 * Everything is counted in **max rolls** — how many best-possible sub-property rolls
 * of the rune's own star class a quantity is worth — and every max roll is then multiplied by
 * what the role is actually paying for that stat. `rune-substat-weights.ts` owns
 * that multiplier and explains it; without it a maximum Accuracy roll and a maximum
 * SPD roll price identically for a role that wants 25 of one and 215 of the other,
 * which is the one thing this model must not say.
 *
 * A rune's score is then a plain sum: every line it carries, the innate included,
 * priced and added. **Nothing is capped.** A rune that rolled past its share of a
 * target is worth more than one that stopped at it, because the surplus is what
 * frees a different rune in the finished build to carry something else.
 *
 * ## Where the odds come from
 *
 * The value a roll takes is **uniform over its range**, which is verified against
 * the observed prefix ranges rather than assumed (`RUNE-CANONICAL.md` §7). Which of
 * the lines a power-up improves, and which legal type a new line takes, are uniform
 * too, and that is a stated game rule in the same section, not a convenience of the
 * model. A box a player has kept cannot confirm or refute either, because keeping is
 * a choice that skews every count in it.
 */
import { runeMaximumLevel, slotAllowsSubStat } from '../runes';
import type { Rune } from '../runes';
import { isIntangibleRuneSet, roleRuneSetNameList } from '../rune-sets';
import {
  allStatIds, mainPropertyMaximum, maximumRoll, slotMainProperties,
} from '../rune-properties';
import type { ReferenceStats } from '../../reference/rune-reference-stats';
import type { RoleChoice, RuneRole } from '../../profiles/rune-roles';
import { runeMainStatIds } from '../../profiles/rune-roles';
import {
  newSubstatWeightScope, substatWeights, targetStats, weightedValuation,
} from '../rune-substat-weights';
import type { BuildMains, SubstatWeightScope, SubstatWeights } from '../rune-substat-weights';
import type { Valuation } from '../rune-substat-weights';
import {
  canonicalCraftCredit, craftPlan, craftedScore, gemOptions, grindCredit, priceList,
} from '../craft/rune-craft-end-state';
import type {
  CraftCredit, CraftPlan, EndStateLine,
} from '../craft/rune-craft-end-state';
import type { CraftLineage } from '../craft/rune-craft-items';
import {
  bestEndState, chanceRuns, chanceStep, countJobs, endStateScoring, expectedPlainScore, gemGainBound,
  meanGemGain, playForward, runeFuture,
} from '../rune-power-up-outcomes';
import type { CountingJob, EndStateScoring, RuneFuture, RuneRuns } from '../rune-power-up-outcomes';
import { generateRuneBody, generatedRuneGrade, upgradeRuneBody } from '../rune-generation';
import type { GeneratedRuneBody, RandomSource } from '../rune-generation';

export type { CraftCredit } from '../craft/rune-craft-end-state';

export { targetStats };

/** Whether a rune answers a role's wish in full, partly, or not at all. */
export type MatchRank = 'preferred' | 'acceptable' | 'broken';

const rankOf = <T>(choice: RoleChoice<T>, value: T): MatchRank =>
  choice.preferred.includes(value) ? 'preferred'
    : choice.acceptable.includes(value) ? 'acceptable' : 'broken';

/**
 * Intangible's set rank is a product rule, not a role preference. It completes
 * one missing set and is therefore always preferred for the set half of every
 * role. The role may still judge the rune's main stat separately.
 */
export function runeSetMatchRank(choice: RoleChoice<string>, setName: string): MatchRank {
  return isIntangibleRuneSet(setName) ? 'preferred' : rankOf(choice, setName);
}

/** The worse of two ranks — a rune is only as good as its weakest half. */
export function worseRank(left: MatchRank, right: MatchRank): MatchRank {
  const order: readonly MatchRank[] = ['preferred', 'acceptable', 'broken'];
  return order[Math.max(order.indexOf(left), order.indexOf(right))];
}

/**
 * One combination of main stats across the three slots that carry a choice.
 *
 * A role does not describe a build; it describes a family of them. Judging a rune
 * against the family as a whole would need a guess about which member the player
 * will actually assemble, and that guess is the thing the brief says cannot be
 * made. So every member is enumerated and each rune keeps its best result.
 *
 * **Every member now matters to every rune**, which it did not use to. A build's
 * main properties are subtracted from what the role still needs from sub
 * properties, so a build that puts HP % in slots 4 and 6 asks its runes for far
 * less HP than one that puts ATK % there — and the same slot-2 rune is worth
 * different amounts to the two.
 */
export type Build = {
  mains: Readonly<Record<2 | 4 | 6, number>>;
  ranks: Readonly<Record<2 | 4 | 6, MatchRank>>;
};

/** Every main-stat combination a role allows, preferred and acceptable alike. */
export function roleBuilds(role: RuneRole): Build[] {
  const options = ([2, 4, 6] as const).map((slot) => {
    const choice = role.slots[`slot${slot}` as 'slot2' | 'slot4' | 'slot6'];
    const entries = [...choice.preferred.map((stat) => ({ stat, rank: 'preferred' as MatchRank })),
      ...choice.acceptable.filter((stat) => !choice.preferred.includes(stat))
        .map((stat) => ({ stat, rank: 'acceptable' as MatchRank }))];
    /* A slot the role says nothing about accepts every main the slot allows, at
       the broken rank. Refusing to build any combination at all would make a role
       with one unstated slot judge nothing, which is not what leaving it blank
       means. */
    return entries.length > 0 ? entries : [{ stat: null, rank: 'broken' as MatchRank }];
  });
  const builds: Build[] = [];
  for (const two of options[0]) for (const four of options[1]) for (const six of options[2]) {
    builds.push({
      mains: { 2: two.stat ? runeMainStatIds[two.stat] : 0, 4: four.stat ? runeMainStatIds[four.stat] : 0, 6: six.stat ? runeMainStatIds[six.stat] : 0 },
      ranks: { 2: two.rank, 4: four.rank, 6: six.rank },
    });
  }
  return builds;
}

/** The main property each slot carries in a build. Slots 1, 3 and 5 are fixed. */
function mainOfSlot(build: Build, slot: number): number {
  if (slot === 1) return 3;
  if (slot === 3) return 5;
  if (slot === 5) return 1;
  return build.mains[slot as 2 | 4 | 6];
}

/** All six slots' main properties, which is what a requirement is measured against. */
function buildMains(build: Build): BuildMains {
  return { 1: 3, 2: build.mains[2], 3: 5, 4: build.mains[4], 5: 1, 6: build.mains[6] };
}

export type RuneOutcome = {
  /** The best legal end state against the best ordinary rune in this slot. Ancient can exceed 1. */
  maxValue: number;
  /** `0`–`1`: the chance the rune reaches the final +15 projection; RNG ends at +12. */
  chance: number;
  /** How the rune's set and the build it is read in answer the role. */
  rank: MatchRank;
};

/* ------------------------------------------------------------- the ceiling */

/**
 * The best score an ordinary rune in this slot reaches — the denominator that makes a
 * perfect ordinary rune read 100 %. It is a reference point and not a limit: an
 * Ancient rune, or a line already ground past the canonical stone, reads above it.
 *
 * A perfect rune is a concrete arrangement, not a formula: **four sub properties at
 * their maximum, the most valuable of them carrying all four later upgrades as well,
 * an innate property at the maximum of the next most valuable effect id, and the
 * credited Gem and Grindstone spent where they help.** Nine rolls, five distinct
 * effect ids, and every one of the game's own duplication and slot rules respected.
 *
 * The five-roll line and the three one-roll lines are what a rune can actually do:
 * four lines each start with one roll, so the four upgrades can concentrate on one
 * line but the other three never fall below one. An earlier form of this wrote five
 * rolls on the best line and three on the second, which is nine rolls across two
 * lines and a rune the game cannot produce. It made no difference while every stat
 * priced alike; with weights it flatters the second-best stat by two whole rolls.
 *
 * **The scale is the best ordinary rune of the candidate's own star class**, so a
 * perfect five-star rune reads 100 % exactly as a perfect six-star one does. It used
 * to be the six-star rune for everyone, with a main-property factor on top, which
 * read a perfect 5★ rune at 67 % and a perfect 4★ at 45 %: a statement about how far
 * the star tables shrink, printed as though it were a judgement of the rune. Whether
 * a lower-star rune is worth keeping at all is the quality floor's question, asked of the rune's own star class.
 *
 * An Ancient rune is a six-star rune and is measured against the **ordinary**
 * six-star one: its higher initial interval may move its own score above the bar,
 * but never moves the bar itself.
 *
 * **That includes the craft tables, and it used not to.** An Ancient candidate was
 * given an *Ancient* perfect rune to divide by, so its stronger Ancient Gem and stone
 * paid for its own denominator and cancelled most of what they had just earned it. On
 * a Legend Ancient slot-2 rune at `+15`, then credited with Hero items at three
 * quarters, the bar stood 4.1 % higher and the rune read 71.5 % where the ordinary bar
 * says 74.5 %.
 * §6's "Ancient runes use Ancient craft tables" is a rule about what a *rune* may be
 * spent on; the reference is the ordinary six-star rune of §5, whole, which is why
 * this takes no lineage.
 */
export function slotCeiling(
  valuation: Valuation, slot: number, main: number, credit: CraftCredit, stars: number,
): number {
  const prices = priceList(valuation);
  const plan = craftPlan('standard', credit);
  const most = (statId: number) => maximumRoll(statId, stars);
  const ids = allStatIds.filter((statId) => statId !== main && slotAllowsSubStat(slot, statId))
    .filter((statId) => most(statId) * prices[statId] > 0);
  if (ids.length === 0) return 0;

  /* A line of one maximum roll, with its Grindstone. The order this produces is the
     order the three plain lines are filled in, and it is the same for every
     arrangement below, so it is worked out once. */
  const oneRoll = new Map<number, number>();
  for (const statId of ids) {
    oneRoll.set(statId, (most(statId) + grindCredit(plan, statId)) * prices[statId]);
  }
  const byOneRoll = [...ids].sort((left, right) => (oneRoll.get(right) ?? 0) - (oneRoll.get(left) ?? 0));

  const buffer: EndStateLine[] = [0, 1, 2, 3].map(() => ({ statId: 0, value: 0, grind: 0, gemmed: false }));
  let best = 0;
  for (const sink of ids) {
    /* An innate bars one further effect id, and which id that is changes what a Gem
       may then take — so the innate is part of the arrangement rather than a constant
       added at the end. `null` is the rune that has none. */
    for (const innate of [null, ...ids]) {
      if (innate === sink) continue;
      buffer[0].statId = sink;
      /* Four lines each begin with one roll, so the four later upgrades may all
         concentrate on one line but the other three never fall below one. */
      buffer[0].value = most(sink) * 5;
      let filled = 1;
      for (const statId of byOneRoll) {
        if (filled === 4) break;
        if (statId === sink || statId === innate) continue;
        buffer[filled].statId = statId;
        buffer[filled].value = most(statId);
        filled += 1;
      }
      /* A role that values fewer than four of the slot's effect ids has fewer than
         four lines worth writing down. The rune still has four, and the rest are worth
         nothing to it — which is the same arrangement with the zeroes left out. */
      const lines = filled === 4 ? buffer : buffer.slice(0, filled);
      const prefixScore = innate === null ? 0 : most(innate) * prices[innate];
      /* The Gem is settled by the one craft rule, which considers replacing every
         line — including trading the five-roll line for one Gem roll, an arrangement
         no legal Gem can repay and which is therefore never the one it keeps. */
      const options = gemOptions(plan, prices, slot, main, innate);
      const total = craftedScore(plan, options, prices, lines, prefixScore);
      if (total > best) best = total;
    }
  }
  return best;
}

/* ------------------------------------------------- synthetic Statistics births */

export type OrdinarySampleLevel = 0 | 3 | 6 | 9 | 12 | 15;

export type OrdinarySampleCheckpointLevel = 0 | 3 | 6 | 9 | 12;

export type OrdinarySamplePath = Readonly<{
  id: string;
  checkpoints: readonly Readonly<{ level: OrdinarySampleCheckpointLevel; rune: Rune }>[];
}>;

type OrdinarySampleBirth = Readonly<{
  index: number;
  body: GeneratedRuneBody;
  next: RandomSource;
}>;

function ordinarySampleBirths(
  slot: number, stars: number, count: number, population: 'legend' | 'drop', sampleOffset: number,
): OrdinarySampleBirth[] {
  const births: OrdinarySampleBirth[] = [];
  for (let at = 0; at < count; at += 1) {
    /* One stream belongs to one birth. Callers that need several checkpoints keep
       advancing this stream with the same body, rather than reseeding each level. */
    let state = (0x9e3779b9 ^ Math.imul(slot, 0x85ebca6b) ^ Math.imul(stars, 0xc2b2ae35)
      ^ Math.imul(at + sampleOffset + 1, 0x27d4eb2d)) >>> 0;
    /* Avalanche neighbouring sample ids before the xorshift stream. Without this,
       cycling main ids by sample index can correlate a main with its set and grade. */
    state ^= state >>> 16;
    state = Math.imul(state, 0x7feb352d);
    state ^= state >>> 15;
    state = Math.imul(state, 0x846ca68b);
    state = (state ^ (state >>> 16)) >>> 0 || 1;
    const next = () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5; state >>>= 0;
      return state / 0x1_0000_0000;
    };
    const mains = slotMainProperties[slot] ?? [];
    const sampleIndex = at + sampleOffset;
    const mainIndex = sampleIndex % Math.max(1, mains.length);
    const occurrence = Math.floor(sampleIndex / Math.max(1, mains.length));
    const gradeIndex = (occurrence + mainIndex) % 4;
    /* Cover each main × grade × set combination before repeating it. Pure random
       set and grade draws gave a different Statistics population mix
       in independently seeded populations. */
    const setIndex = (Math.floor(occurrence / 4) + mainIndex * 7 + gradeIndex * 5)
      % roleRuneSetNameList.length;
    const mainStatId = mains[mainIndex];
    const body = generateRuneBody({
      setName: roleRuneSetNameList[setIndex] ?? null,
      slot, stars, rarity: population === 'drop'
        ? generatedRuneGrade(slot, () => (gradeIndex + 0.5) / 4) : 'Legend', mainStatId, random: next,
    });
    births.push({ index: sampleIndex, body, next });
  }
  return births;
}

function ordinarySampleRune(
  body: GeneratedRuneBody, slot: number, stars: number, level: OrdinarySampleLevel, id: string,
): Rune {
  return {
    id, setId: 0, setName: body.setName ?? '', slot, stars,
    ancient: false, rarity: body.rarity, level, mainStatId: body.mainStatId,
    mainValue: level === runeMaximumLevel ? mainPropertyMaximum(stars, body.mainStatId) : 0,
    prefixStatId: body.prefixStatId, prefixValue: body.prefixValue,
    subProperties: body.subProperties.map(({ statId, value, gemmed, grind }) => ({ statId, value, gemmed, grind })),
    occupiedId: null, obtainedOrder: 0,
  };
}

export function ordinarySample(
  slot: number, stars: number, count: number, level: OrdinarySampleLevel = 15,
  population: 'legend' | 'drop' = 'legend', sampleOffset = 0,
): Rune[] {
  return ordinarySampleBirths(slot, stars, count, population, sampleOffset).map(({ index, body, next }) => {
    const atLevel = upgradeRuneBody(body, level, next);
    const id = `ordinary-sample:${population}:${slot}:${stars}:${level}:${index}`;
    return ordinarySampleRune(atLevel, slot, stars, level, id);
  });
}

/**
 * One birth carried forward through every sub-property decision point. Each saved
 * rune is a snapshot of the same evolving body and random stream, so funnel outcomes
 * preserve the conditioning from earlier investments.
 */
export function ordinarySamplePaths(
  slot: number, stars: number, count: number, population: 'legend' | 'drop' = 'legend', sampleOffset = 0,
): OrdinarySamplePath[] {
  return ordinarySampleBirths(slot, stars, count, population, sampleOffset).map(({ index, body: birth, next }) => {
    const pathId = `ordinary-sample-path:${population}:${slot}:${stars}:${index}`;
    let body = birth;
    const checkpoints = ([0, 3, 6, 9, 12] as const).map((level) => {
      if (level > body.level) body = upgradeRuneBody(body, level, next);
      const id = `ordinary-sample:${population}:${slot}:${stars}:${level}:${index}`;
      return { level, rune: ordinarySampleRune(body, slot, stars, level, id) };
    });
    return { id: pathId, checkpoints };
  });
}

/* ------------------------------------------------------------ the candidate */

/**
 * Everything one rune against one build of one role settles before a threshold
 * is named.
 *
 * The page asks two questions of the same pair, and they arrive separately: what
 * is this rune's ceiling, and — for the few candidates still standing after the
 * value gate — what are its odds of reaching the bar. Both rest on the same
 * weights, the same optional craft end state and the same event count, and answering them
 * through one function meant computing all of that twice for one extra number.
 */
export type RuneCandidate = {
  readonly rune: Rune;
  readonly valuation: Valuation;
  readonly weights: SubstatWeights;
  readonly ceiling: number;
  /** The build this candidate is priced in. Its slot 2, 4 and 6 mains decide what the
      role still asks of sub properties, so a reading is not explained without it. */
  readonly build: Build;
  /** The main property this build puts in the rune's slot, which fixes its legal ids. */
  readonly main: number;
  /** The best legal end state the rune can still reach, in this role's units. */
  readonly best: number;
  /** The star class its Max value is read in (`referenceStars`). */
  readonly stars: number;
  /** What the rune may still become, which is a fact about the rune and not the role. */
  readonly future: RuneFuture;
  /** What this role pays, and what its craft items could do to this rune. */
  readonly scoring: EndStateScoring;
  readonly credit: CraftCredit;
  readonly plan: CraftPlan;
  readonly lineage: CraftLineage;
  /** The rune's set against the role, and the build it is read in (`buildRank`). */
  readonly rank: MatchRank;
  readonly scope: RuneAdviceScope;
};

/** The deterministic inputs shared by a single percentile reading. */
export type RuneAdviceScope = {
  builds: WeakMap<RuneRole, readonly Build[]>;
  weights: SubstatWeightScope;
  /** The perfect rune of one slot, by valuation, craft credit, slot and main. */
  ceiling: Remembered;
  /** One build's weights and valuation, by role, build, reference line, credit and stars. */
  pricing: Remembered;
  /**
   * What a rune may still become, which every role judging it asks the same way.
   *
   * It is also what the runs are gathered by: playing a rune forward is a fact about
   * the rune, so one set of runs answers every role and every build. That sharing is the whole reason the odds are
   * affordable, and it is why a job carries this object rather than a copy of it.
   */
  futures: Map<string, RuneFuture>;
};

export const newRuneAdviceScope = (): RuneAdviceScope => ({
  builds: new WeakMap(), weights: newSubstatWeightScope(), ceiling: new Map(), pricing: new Map(),
  futures: new Map(),
});

/**
 * A cache addressed by the objects a result depends on rather than by a string made
 * of them. The weights and ceilings are asked for by every candidate of every rune,
 * and building their key strings was most of what asking cost: measured on the slot
 * balance's sample, 3.5 of its 5.4 seconds went on concatenating keys for answers
 * already known. Every object on a path is fixed for the scope's life, which is what
 * makes identity a sound key.
 */
type Remembered = Map<unknown, unknown>;

function remembered<T>(tree: Remembered, path: readonly unknown[], make: () => T): T {
  let node = tree;
  for (let at = 0; at < path.length - 1; at += 1) {
    let next = node.get(path[at]) as Remembered | undefined;
    if (!next) { next = new Map(); node.set(path[at], next); }
    node = next;
  }
  const last = path[path.length - 1];
  if (node.has(last)) return node.get(last) as T;
  const value = make();
  node.set(last, value);
  return value;
}

/**
 * **The one ruler every rune is read against** — the weights and the perfect rune — priced with `canonicalCraftCredit` and with nothing a caller passes.
 * It is not a parameter, because a ruler a caller may choose is a ruler two callers
 * can choose differently.
 */
const rulerCredit = canonicalCraftCredit;

/**
 * The deterministic half: everything that does not depend on the threshold.
 *
 * `credit` is the candidate's own craft: what the rune's end state is projected with.
 * Rune Clean-up passes `canonicalCraftCredit`; Gems & Grinds and Rune Optimization
 * pass `noCraftCredit`, because they price the lines in front of them and add the
 * items they judge themselves. The ruler is the same for all three.
 */
export function prepareRuneCandidate(
  rune: Rune, role: RuneRole, build: Build, base: ReferenceStats, credit: CraftCredit,
  scope: RuneAdviceScope = newRuneAdviceScope(),
): RuneCandidate | null {
  const stars = referenceStars(rune);
  const scale = readingScale(role, build, base, rune.slot, rune.mainStatId, stars, scope);
  if (!scale) return null;
  const { valuation, weights, ceiling, rank: mainRank } = scale;
  const main = rune.mainStatId;
  const lineage: CraftLineage = rune.ancient ? 'ancient' : 'standard';
  let future = scope.futures.get(rune.id);
  if (future === undefined || future.rune !== rune) {
    future = runeFuture(rune);
    scope.futures.set(rune.id, future);
  }
  const plan = craftPlan(lineage, credit);
  const scoring = endStateScoring(rune, valuation, plan);
  /* Callers that only price a visible line do not need to enumerate future maxima. */
  let best: number | undefined;

  /* No main-property factor. A rune is judged on its sub properties against the
     best rune of its own star class, and its main property is the same at `+15`
     whatever it rolled — it decides which build the rune belongs to, not how good a
     member of it the rune is. The factor this replaced read a perfect five-star rune
     at two thirds of a perfect six-star one, which is the star table talking. */
  const setRank = runeSetMatchRank(role.sets, rune.setName);

  return {
    rune, valuation, weights, ceiling, build, main, stars,
    get best() { return best ??= bestEndState(future, scoring); },
    future, scoring, credit, plan,
    lineage, rank: worseRank(setRank, mainRank), scope,
  };
}

/** A blank build slot accepts the rune's actual main, which still excludes that sub property. */
export function readingScale(
  role: RuneRole, build: Build, base: ReferenceStats, slot: number, main: number,
  stars: number, scope: RuneAdviceScope,
) {
  if (!slotMainProperties[slot]?.includes(main) || !buildAccepts(build, slot, main)) return null;
  const priced = buildPricing(role, build, base, rulerCredit, stars, scope);
  if (!priced) return null;
  const ceiling = cachedCeiling(priced.valuation, slot, main, rulerCredit, stars, scope);
  if (!Number.isFinite(ceiling) || ceiling <= 0) return null;
  return { ...priced, prices: priceList(priced.valuation), ceiling, rank: buildRank(build, slot) };
}

/**
 * **How far the build a rune is read in answers the role: its weakest stated slot.**
 *
 * It used to be the rune's own slot alone, which left a slot-5 rune "preferred" in
 * every build. A rune whose best reading needed DEF % in slots 4 and 6 — mains the
 * HP tank only accepts — was therefore compared undiscounted with its reading in the
 * preferred HP % build, and a Gem that won only by moving the rune into the merely
 * accepted build was recommended as if it improved the rune. The accepted discount
 * exists to make a lesser build earn its place; it has to see the whole build.
 *
 * Another slot left blank is no preference, not a lesser one (§3), so it does not
 * count against the rune; its own slot left blank still reads as broken, as before.
 */
export function buildRank(build: Build, slot: number): MatchRank {
  let rank: MatchRank = 'preferred';
  for (const at of [2, 4, 6] as const) {
    if (at !== slot && build.mains[at] === 0) continue;
    rank = worseRank(rank, build.ranks[at]);
  }
  return rank;
}

/**
 * **The star class a rune is measured in: its own.** A five-star rune's lines are
 * priced in five-star max rolls, its perfect rune is a five-star one and its ordinary
 * box is five-star runes, so its efficiency, quality and chance all answer
 * "how good a five-star rune is this". An Ancient rune is a six-star rune measured
 * against the ordinary six-star reference (§5), which is why its higher initial
 * interval reads above 100 % — as any rune may.
 */
export const referenceStars = (rune: Pick<Rune, 'ancient' | 'stars'>): number => (rune.ancient ? 6 : rune.stars);

/** One build's weights and the valuation they price a rune of `stars` with. */
function buildPricing(
  role: RuneRole, build: Build, base: ReferenceStats, credit: CraftCredit, stars: number,
  scope: RuneAdviceScope,
): { weights: SubstatWeights; valuation: Valuation } | null {
  return remembered(scope.pricing, [role, build, base, credit, stars],
    () => priceBuild(role, build, base, credit, stars, scope));
}

function priceBuild(
  role: RuneRole, build: Build, base: ReferenceStats, credit: CraftCredit, stars: number,
  scope: RuneAdviceScope,
): { weights: SubstatWeights; valuation: Valuation } | null {
  /* The weights read nothing about the rune. Two runes that differ only in their set
     are scored identically, which is what lets the recommendation compare them; a set
     decides a verdict through the role's own ranking and the relative retention
     preferences, never through the arithmetic. Intangible's set rank is permanently
     preferred; its slider only widens the retained share. `verify:rune-set-neutrality`
     is the check. */
  const weights = substatWeights({
    targets: role.targets, mains: buildMains(build), artifacts: role.artifacts, base, credit,
  }, scope.weights);
  if (weights.weights.size === 0) return null;
  return { weights, valuation: weightedValuation(base, weights, stars) };
}

function cachedCeiling(
  valuation: Valuation, slot: number, main: number, credit: CraftCredit, stars: number, scope: RuneAdviceScope,
): number {
  /* The slot belongs in the path. Two slots can carry the same main property — ATK +
     is slot 1's fixed main and one of slot 2's choices — while forbidding different
     sub properties, so a key without the slot handed slot 2 slot 1's ceiling. The
     valuation already carries the star class. */
  return remembered(scope.ceiling, [valuation, credit, slot, main],
    () => slotCeiling(valuation, slot, main, credit, stars));
}

/** Whether a build accepts `main` in `slot`: its own choice there, or none stated. */
export function buildAccepts(build: Build, slot: number, main: number): boolean {
  if (slot === 1 || slot === 3 || slot === 5) return mainOfSlot(build, slot) === main;
  const named = build.mains[slot as 2 | 4 | 6];
  return named === main || named === 0;
}

/**
 * **One standard for every rune: its `+15` projection with the canonical items spent,
 * against the ruler priced with the same items.** Uncapped (`onScale`).
 * `RUNE-CLEANUP-MATH.md` §9.2.
 */
export function candidateMaxValue(candidate: RuneCandidate): number {
  return onScale(candidate, candidate.best);
}

/**
 * **What the rune is expected to be worth at `+15`**, on the scale `candidateMaxValue`
 * prints and against the same perfect rune. `RUNE-CLEANUP-MATH.md` §9.6.
 *
 * The part without a Gem is linear in every roll and is therefore exact; only what the
 * Gem adds is averaged, over the first of the runs the chance is counted on, so `runs` is asked for
 * only where a Gem is credited. A rune with no substat event left has one end state,
 * and that is its expectation.
 */
export function candidateExpectedValue(candidate: RuneCandidate, runs: () => RuneRuns): number {
  const { future, scoring } = candidate;
  if (future.upgrades === 0 && future.additions === 0) return onScale(candidate, candidate.best);
  const gem = scoring.plan.hasGem ? meanGemGain(runs(), scoring) : 0;
  /* The exact part and a counted part together can, on a rune with almost no spread
     left, read a hair above the best end state; no expectation can. */
  return Math.min(candidateMaxValue(candidate), onScale(candidate, expectedPlainScore(future, scoring) + gem));
}

/**
 * **A ceiling on `candidateExpectedValue` that needs no runs**: the exact part plus the
 * most a Gem can add to any run, and never above the Max value, since no run beats the
 * best end state. It is what lets Best role skip a reading without counting it.
 */
export function candidateExpectedBound(candidate: RuneCandidate): number {
  const { future, scoring } = candidate;
  if (future.upgrades === 0 && future.additions === 0) return onScale(candidate, candidate.best);
  const bound = expectedPlainScore(future, scoring) + gemGainBound(future, scoring);
  return Math.min(candidateMaxValue(candidate), onScale(candidate, bound));
}

/**
 * **The perfect rune is a reference point, never a ceiling.** 100 % says "as good as
 * the best ordinary rune of this class"; a rune that reads more — an Ancient rune's
 * higher initial rolls, a stone already ground past the canonical one — reads more,
 * and keeps every recommendation that would lift it further. A cap here once made
 * every rune above the mark look alike and left nothing to recommend for them.
 */
const onScale = (candidate: RuneCandidate, score: number): number => score / candidate.ceiling;

/**
 * **The runs a rune's expected Gem is averaged over: the first 256 of the ones its
 * chance is counted on.** A run is a function of its own number, so these are exactly
 * those runs, not a second stream.
 *
 * So few are enough because only the Gem is averaged — the rest of the expectation is
 * exact — and what a Gem adds moves far less from run to run than whether a run clears
 * a bar. Measured against an exact enumeration it stays within half a point; on a real
 * account of 2,958 runes, all 4,096 runs named another role for 8 of them, each a
 * near-tie. More runs cost the calculation a tenth of its time for that.
 */
export const expectationRuns = 256;

export const runeRuns = (future: RuneFuture): RuneRuns => playForward(future, expectationRuns);

/** A settled answer or the processor/card work needed to answer one normalized oracle question. */
export type ChanceAsk = {
  readonly jobs: readonly CountingJob[];
  /** The answer, given what each of this ask's jobs came back with. */
  combine(shares: readonly number[]): number;
};

const settledAsk = (answer: number): ChanceAsk => ({ jobs: [], combine: () => answer });

/** One candidate against one threshold, in the Max-value units `candidateMaxValue` prints. */
export const candidateChanceAskAt = (candidate: RuneCandidate, wanted: number, runs = chanceRuns) =>
  chanceStep(candidate.future, candidate.scoring, wanted, runs);

export function candidateChanceAsk(candidate: RuneCandidate, threshold: number): ChanceAsk {
  if (threshold === Number.NEGATIVE_INFINITY) return settledAsk(1);
  if (threshold === Number.POSITIVE_INFINITY) return settledAsk(0);
  const step = candidateChanceAskAt(candidate, threshold * candidate.ceiling);
  if (step.job === null) return settledAsk(step.settled ?? 0);
  return {
    jobs: [step.job],
    combine: (shares) => Math.min(1, Math.max(0, shares[0] ?? 0)),
  };
}

/**
 * The same question answered on the spot, on the processor.
 *
 * `judgeAgainstBuild` and the verification scripts ask about one rune at a time and
 * have nothing to batch, so they take this. It is the same ask and the same counting
 * the batched path uses, run immediately instead of gathered.
 */
export function candidateChance(candidate: RuneCandidate, threshold: number): number {
  const ask = candidateChanceAsk(candidate, threshold);
  return ask.combine([...countJobs(ask.jobs)]);
}

/** The resolution the odds are counted at, for a check that wants to state it. */
export { chanceRuns };
export type { CountingJob } from '../rune-power-up-outcomes';

/**
 * One rune against one build of one role, both answers at once.
 *
 * `rune-cleanup-advice.ts` no longer takes this route — it prepares a candidate
 * and asks the two questions separately — but `verify-rune-cleanup-calibration.mjs`
 * calls it directly, and that script is the independent gate on everything in this
 * file. An oracle rewritten in the same commit as the model it checks has stopped
 * being independent, so this signature stays. It reads against the product's own
 * ruler, so the oracle checks the reading the page prints.
 */
export function judgeAgainstBuild(
  rune: Rune, role: RuneRole, build: Build, base: ReferenceStats,
  threshold: number, credit: CraftCredit,
  /* The chance is still the expensive half, and most builds are rejected on their
     ceiling long before anyone needs it. So it is only worked out when the caller
     says it will be used, which is what makes checking every build affordable. */
  withChance = true,
): RuneOutcome | null {
  const candidate = prepareRuneCandidate(rune, role, build, base, credit);
  if (!candidate) return null;
  return {
    maxValue: candidateMaxValue(candidate),
    chance: withChance ? candidateChance(candidate, threshold) : 0,
    rank: candidate.rank,
  };
}
