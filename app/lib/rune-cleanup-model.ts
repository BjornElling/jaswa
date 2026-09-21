/**
 * **The single source of truth for what a rune is worth and what it may become.**
 *
 * `docs/RUNE-CLEANUP-MATH.md` owns the reasoning; this owns the arithmetic. Every
 * figure the Rune Clean-up page states — a rune's Max value, its chance of reaching
 * a threshold, which preset suits it — is computed here and nowhere else. A second
 * implementation would not merely duplicate work: it would drift, and the page
 * would then state two Max values for the same rune without either being obviously
 * wrong. The deliberate exception is `scripts/verify-rune-cleanup-calibration.mjs`,
 * which re-derives the chance by Monte Carlo from the game's own loop precisely so
 * that a disagreement is caught.
 *
 * ## One currency, two questions
 *
 * Everything is counted in **max rolls** — how many best-possible six-star
 * sub-property rolls a quantity is worth — and every max roll is then multiplied by
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
 * ## What is measured and what is assumed
 *
 * The value a roll takes is **uniform over its range**, which is verified against
 * 1,530 measured prefixes rather than assumed (`RUNE-CANONICAL.md` §4). Which of
 * the four lines a power-up improves, and which type a new line takes, are **not
 * established by any source** and are assumed uniform. Those two assumptions are
 * named here and in the weights module, at the two places they are used, so nothing
 * downstream can present them as game facts.
 */
import { runeDefaultGradeOrder, runeSubValue, slotAllowsSubStat } from './runes';
import type { Rune, RuneSubProperty } from './runes';
import { runeSetPieceCount } from './rune-sets';
import {
  allStatIds, mainPropertyMaximum, maximumRoll, remainingEvents, subPropertyRange,
} from './rune-properties';
import type { SubPropertyEvent } from './rune-properties';
import type { ReferenceStats } from './rune-reference-stats';
import type { PresetChoice, RunePotentialPreset } from './rune-potential-presets';
import { runeMainStatIds } from './rune-potential-presets';
import {
  newSubstatWeightScope, substatWeights, targetStats, weightedValuation,
} from './rune-substat-weights';
import type { BuildMains, SubstatWeightScope, SubstatWeights } from './rune-substat-weights';
import {
  combinations, isExactKey, probabilityKey, rollDistribution, tailMass,
  tailView, targetKey,
} from './rune-roll-distributions';
import type { Distribution, Valuation } from './rune-roll-distributions';
import { craftRollValue, craftValueRange, isGrindableStat } from './rune-craft-items';
import type { CraftLineage, CraftRollAssumption } from './rune-craft-items';
import type { ItemGrade } from './types';

export { targetStats };

/** Whether a rune answers a preset's wish in full, partly, or not at all. */
export type MatchRank = 'preferred' | 'acceptable' | 'broken';

const rankOf = <T>(choice: PresetChoice<T>, value: T): MatchRank =>
  choice.preferred.includes(value) ? 'preferred'
    : choice.acceptable.includes(value) ? 'acceptable' : 'broken';

/** The worse of two ranks — a rune is only as good as its weakest half. */
export function worseRank(left: MatchRank, right: MatchRank): MatchRank {
  const order: readonly MatchRank[] = ['preferred', 'acceptable', 'broken'];
  return order[Math.max(order.indexOf(left), order.indexOf(right))];
}

/**
 * One combination of main stats across the three slots that carry a choice.
 *
 * A preset does not describe a build; it describes a family of them. Judging a rune
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

/** Every main-stat combination a preset allows, preferred and acceptable alike. */
export function presetBuilds(preset: RunePotentialPreset): Build[] {
  const options = ([2, 4, 6] as const).map((slot) => {
    const choice = preset.slots[`slot${slot}` as 'slot2' | 'slot4' | 'slot6'];
    const entries = [...choice.preferred.map((stat) => ({ stat, rank: 'preferred' as MatchRank })),
      ...choice.acceptable.filter((stat) => !choice.preferred.includes(stat))
        .map((stat) => ({ stat, rank: 'acceptable' as MatchRank }))];
    /* A slot the preset says nothing about accepts every main the slot allows, at
       the broken rank. Refusing to build any combination at all would make a preset
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
  /** `0`–`1`: the chance the rune actually reaches the threshold by +12. */
  chance: number;
  /** How the rune's own set and main stat answer the preset. */
  rank: MatchRank;
};

/** The one optional Gem and one optional Grind the Clean-up policy assumes exist. */
export type CraftCredit = {
  gem: CraftRollAssumption | null;
  gemGrade: ItemGrade;
  grind: CraftRollAssumption | null;
  grindGrade: ItemGrade;
};

const creditKey = (credit: CraftCredit): string =>
  `${credit.gem ?? '-'}/${credit.gemGrade}/${credit.grind ?? '-'}/${credit.grindGrade}`;

/** What a credited Grindstone would put on this line, or `0` where none can. */
function grindCredit(statId: number, lineage: CraftLineage, credit: CraftCredit): number {
  if (credit.grind === null || !isGrindableStat(statId)) return 0;
  const range = craftValueRange('grindstone', lineage, statId, credit.grindGrade);
  return range ? craftRollValue(range, credit.grind) : 0;
}

/** What a credited Enchanted Gem would put on this line, or `null` where none can. */
function gemCredit(statId: number, lineage: CraftLineage, credit: CraftCredit): number | null {
  if (credit.gem === null) return null;
  const range = craftValueRange('gem', lineage, statId, credit.gemGrade);
  return range ? craftRollValue(range, credit.gem) : null;
}

/**
 * The one Ancient exception in the candidate projection. An Ancient initial roll
 * uses the verified Ancient interval; upgrades still use the ordinary six-star
 * interval. Everything that defines the reference box, weights or ceiling calls
 * `subPropertyRange` directly and therefore remains ordinary by construction.
 */
function candidateRollRange(
  rune: Pick<Rune, 'stars' | 'ancient'>, statId: number, kind: 'initial' | 'upgrade',
) {
  return subPropertyRange(rune.stars, statId, kind, rune.ancient && kind === 'initial');
}

/* ----------------------------------------------------------- the projection */

/**
 * The rune as it would stand once the credited craft items have been spent on it.
 *
 * `gemmedAt` is the line an Enchanted Gem is projected onto, and it is not merely
 * bookkeeping: a Gem is spent at `+12`, **after** every power-up, and it discards
 * the rolls that line collected on the way. So a reserved line contributes exactly
 * the Gem's own value however the remaining upgrades fall — and the upgrades that
 * land on it are simply lost, which is why the chance calculation still allocates
 * them there and then counts nothing for them.
 */
type LineUp = {
  lines: readonly RuneSubProperty[];
  /** The index a projected Gem replaces, or `null` when none is credited. */
  gemmedAt: number | null;
  /**
   * The effect id the reserved line carried **before** the Gem, which no line added
   * on the way to `+12` may duplicate either.
   *
   * The two ids are both barred and for different reasons. The Gem is spent at `+12`,
   * so until then the line still shows its original property and a new line may not
   * repeat it; afterwards the line shows the Gem's property, and nothing may repeat
   * that. Barring only the second would let a rune plan on drawing a line it could
   * never legally be given.
   */
  replacedStatId: number | null;
  /** The effect id that Gem puts there, which no later line may duplicate. */
  gemStatId: number | null;
  /** The lines' current value, the innate included, in this role's units. */
  have: number;
};

/** One line-up priced into the role's units, the innate included. */
function valueOfLineUp(lineUp: Omit<LineUp, 'have'>, rune: Rune, valuation: Valuation): number {
  let total = 0;
  for (const line of lineUp.lines) total += valuation.value(line.statId, runeSubValue(line));
  if (rune.prefixStatId !== null) total += valuation.value(rune.prefixStatId, rune.prefixValue);
  return total;
}

/** Every line the rune holds, with a credited Grindstone applied wherever it is legal. */
function groundLines(rune: Rune, lineage: CraftLineage, credit: CraftCredit): RuneSubProperty[] {
  return rune.subProperties.map((line) => {
    const credited = grindCredit(line.statId, lineage, credit);
    /* A Grindstone is credited as `max(existing, assumed)` rather than added to what
       is there: a rune already ground three quarters of the way is worth what an
       unground one is, because the grind can always be topped up. Adding them would
       pay the rune twice for the same line. */
    return credited > line.grind ? { ...line, grind: credited } : line;
  });
}

/**
 * The line-ups worth evaluating: the rune as it stands, and the rune with the
 * credited Gem projected onto each of the lines it holds.
 *
 * At `+12` this is exactly optimal — the end state is a sum of independent lines, so
 * the best arrangement is the best Gem on whichever line it can most afford to lose,
 * and every line is offered. Below `+12` it is a **stated projection** rather than a
 * search: the Gem goes on a line the rune already has. A line it has not gained yet
 * cannot be planned around, and the alternative — letting the Gem land on a line the
 * rune might never draw — would credit it for a rune it is not.
 */
function lineUpOptions(rune: Rune, valuation: Valuation, credit: CraftCredit): Array<Omit<LineUp, 'have'>> {
  const lineage: CraftLineage = rune.ancient ? 'ancient' : 'standard';
  const lines = groundLines(rune, lineage, credit);
  const options: Array<Omit<LineUp, 'have'>> = [{ lines, gemmedAt: null, gemStatId: null, replacedStatId: null }];
  if (credit.gem === null) return options;

  /* A rune may carry one Gem-converted line at a time, and a later Gem may only
     replace that same line (`RUNE-CANONICAL.md` §8). */
  const converted = lines.findIndex((line) => line.gemmed);
  const replaceable = converted === -1 ? lines.map((_, at) => at) : [converted];
  for (const at of replaceable) {
    const others = new Set(lines.filter((_, index) => index !== at).map((line) => line.statId));
    let bestStatId: number | null = null;
    let bestLine: RuneSubProperty | null = null;
    let bestValue = -Infinity;
    for (const statId of allStatIds) {
      if (others.has(statId) || statId === rune.mainStatId || statId === rune.prefixStatId
        || !slotAllowsSubStat(rune.slot, statId)) continue;
      const rolled = gemCredit(statId, lineage, credit);
      if (rolled === null) continue;
      /* Com2uS preserves a Grind only when the Gem keeps the same property; a fresh
         one may then be spent on whatever the new property is. */
      const kept = statId === lines[at].statId ? lines[at].grind : 0;
      const grind = Math.max(kept, grindCredit(statId, lineage, credit));
      const value = valuation.value(statId, rolled + grind);
      if (value > bestValue) {
        bestValue = value;
        bestStatId = statId;
        bestLine = { statId, value: rolled, gemmed: true, grind };
      }
    }
    if (bestStatId === null || bestLine === null) continue;
    const gemmed = [...lines];
    gemmed[at] = bestLine;
    options.push({ lines: gemmed, gemmedAt: at, gemStatId: bestStatId, replacedStatId: lines[at].statId });
  }
  return options;
}

/* ------------------------------------------------------------- the ceiling */

/**
 * The best score any legal rune in this slot could reach — the denominator that
 * makes a perfect rune read 100 %.
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
 * The scale is the best **ordinary six-star** rune even when the candidate has fewer
 * stars or is Ancient. That is what keeps a perfect 4★ rune below a perfect 6★ one
 * on a single scale; an Ancient rune's higher initial interval may move its own
 * score above the ordinary bar, but never moves the bar itself.
 */
function slotCeiling(
  valuation: Valuation, slot: number, main: number, credit: CraftCredit, lineage: CraftLineage,
): number {
  const ids = allStatIds.filter((statId) => statId !== main && slotAllowsSubStat(slot, statId))
    .filter((statId) => valuation.value(statId, maximumRoll(statId)) > 0);
  if (ids.length === 0) return 0;

  const five = new Map<number, number>();
  const one = new Map<number, number>();
  const prefix = new Map<number, number>();
  const gem = new Map<number, number>();
  for (const statId of ids) {
    const grind = grindCredit(statId, lineage, credit);
    const roll = maximumRoll(statId);
    five.set(statId, valuation.value(statId, roll * 5 + grind));
    one.set(statId, valuation.value(statId, roll + grind));
    prefix.set(statId, valuation.value(statId, roll));
    const rolled = gemCredit(statId, lineage, credit);
    if (rolled !== null) gem.set(statId, valuation.value(statId, rolled + grind));
  }
  const byOneRoll = [...ids].sort((left, right) => (one.get(right) ?? 0) - (one.get(left) ?? 0));

  /** The best three (or two) plain lines and one innate, out of what is left. */
  const fillRest = (excluded: ReadonlySet<number>, lineCount: number): number => {
    let best = 0;
    for (const innate of [null, ...ids]) {
      if (innate !== null && excluded.has(innate)) continue;
      let total = innate === null ? 0 : prefix.get(innate) ?? 0;
      let taken = 0;
      for (const statId of byOneRoll) {
        if (taken === lineCount) break;
        if (excluded.has(statId) || statId === innate) continue;
        total += one.get(statId) ?? 0;
        taken += 1;
      }
      best = Math.max(best, total);
    }
    return best;
  };

  let best = 0;
  for (const sink of ids) {
    /* Gemming the five-roll line would trade four upgrades for one Gem roll, which
       no legal Gem can repay; the arrangement is dominated by spending the Gem on
       any other line, and every other line is offered below. */
    for (const gemmed of [null, ...ids]) {
      if (gemmed === sink) continue;
      if (gemmed !== null && !gem.has(gemmed)) continue;
      const excluded = new Set<number>([sink]);
      if (gemmed !== null) excluded.add(gemmed);
      const total = (five.get(sink) ?? 0) + (gemmed === null ? 0 : gem.get(gemmed) ?? 0)
        + fillRest(excluded, gemmed === null ? 3 : 2);
      best = Math.max(best, total);
    }
  }
  return best;
}

/* ------------------------------------------------- the ordinary rune */

/**
 * How often an ordinary six-star rune carries an innate property: **51 %**, measured
 * on 2,998 runes (`RUNE-CANONICAL.md` §4). Com2uS states no rate, so this is an
 * observation rather than a game rule, and §4 says it is to be re-measured at every
 * game update.
 */
const innateFrequency = 0.51;

/**
 * What one upgrade allocation does to a line's spread.
 *
 * Four upgrades fall uniformly across four lines, so each line's count is
 * `Binomial(4, ¼)`: variance `4 · ¼ · ¾`, and two lines covary at `−4 · ¼ · ¼`
 * because an upgrade one line takes is one the other cannot. The negative term is
 * not a rounding detail — it is what stops four lines' spreads from simply adding,
 * and dropping it would overstate an ordinary rune's spread by about a fifth.
 */
const upgradeCountVariance = 4 * (1 / 4) * (3 / 4);
const upgradeCountCovariance = -4 * (1 / 4) * (1 / 4);

/** One effect id's roll statistics, in this role's own score units. */
type RollStatistics = {
  /** What one raw point of it is worth. A valuation is linear, so this is its slope. */
  factor: number;
  /** The mean and variance of one ordinary six-star roll, as whole game numbers. */
  mean: number;
  variance: number;
};

/** One build's price list for one slot's legal effect ids. */
type OrdinaryPrices = {
  ceiling: number;
  /** Two average rolls plus whatever a Grindstone adds — one line of this id. */
  line: Map<number, number>;
  /** One average roll, and no craft item may touch an innate. */
  innate: Map<number, number>;
  gem: Map<number, number>;
  roll: Map<number, RollStatistics>;
};

/**
 * One slot's box of ordinary runes, as a **distribution** over the Max-value scale.
 *
 * It is a whole curve rather than a middle and a width, and the case that settles
 * that is a maximum Gem credited to a role built around DEF: in the two slots that
 * may draw DEF the Gem hands *every* rune the stat the role wants, crushing the top
 * of the distribution, while in the four that may not it does nothing of the sort
 * and the long right tail survives. Middles and widths matched, a floor read through
 * a Gaussian still took 20 % of one slot and 13 % of another. The shape is where the
 * difference lives, so the shape is what is kept.
 */
export type OrdinaryBox = {
  /** The box's middle, which is all a box with no recorded shape has to offer. */
  readonly value: number;
  /** `below[i]` is the share of the box at or under Max value `i / (below.length - 1)`. */
  readonly below: readonly number[];
};

/**
 * How finely the box's own shape is recorded, over the whole `0`–`1` Max-value
 * scale. Every Max value a rune can have falls inside it, so no candidate is ever
 * off the end and no bound needs guarding.
 *
 * 512 steps is 0.2 of a percentage point of Max value — an order finer than the
 * column that prints it, and finer than the narrowest box's own width by enough
 * that the curve is smooth rather than steppy.
 */
const boxResolution = 512;

/**
 * A short, stable name for one valuation, for the family key above.
 *
 * Two valuations that price every line alike already *are* the same object — they
 * are memoised on the weight set that produced them — so object identity is exactly
 * as fine a distinction as their own keys make, and a counter off a `WeakMap` needs
 * no invalidation rule of its own.
 */
const valuationNumbers = new WeakMap<Valuation, number>();
let valuationCount = 0;

function valuationNumber(valuation: Valuation): number {
  let found = valuationNumbers.get(valuation);
  if (found === undefined) { valuationCount += 1; found = valuationCount; valuationNumbers.set(valuation, found); }
  return found;
}

/**
 * **Where the box of ordinary runes of this slot sits, on the Max-value scale the
 * candidate is read on.**
 *
 * This is the anchor that makes a quality floor mean the same thing in every slot,
 * and without it the floor does not. A slot is not free to carry whatever the role
 * wants: slot 1 may never carry DEF, slot 3 may never carry ATK, slot 5 may never
 * carry flat HP, and a chosen main property bars its own effect id wherever it sits.
 * So for a role built around DEF, slot 3 draws its lines from a pool that contains
 * the one stat the role is starved of and slot 1 draws from a pool that does not —
 * and the two pools produce completely different *distributions* of score even
 * though each is measured against its own slot's perfect rune. Dividing by the
 * ceiling makes the top of the two scales agree; it says nothing about the body, and
 * the body is where the verdicts are made. Measured before this existed, one absolute
 * Max-value floor kept 29.6 % of the ordinary slot-3 runes of a Def DD account and
 * 8.8 % of its slot-4 ones, and for a role built around ATK, 87.4 % of slot 3 against
 * 11.1 % of slot 5.
 *
 * ## The rune
 *
 * It is the construction §4.2 already prices a target against, plus an innate:
 * **four sub-property lines drawn uniformly without replacement from the effect ids
 * the slot allows, one initial roll each, four upgrades spread uniformly over the
 * four, and — on 51 % of runes — one innate of a further legal id.** Every roll is
 * worth the midpoint of its ordinary six-star interval, so a line that exists is
 * worth two average rolls, and the value is linear in the roll count, which is what
 * makes this an exact mean rather than a simulation. Ancient is not in it for the
 * reason it is not in the ceiling: the reference box stays ordinary, so an Ancient
 * rune's higher initial interval moves the rune and never the bar. The credited craft
 * items *are* in it, because §6 requires that turning a
 * slider up raise the bar as well as the rune.
 *
 * **§4.2 leaves the innate out and this must put it back.** There it cancels: every
 * target's ratio moves by about the same factor and the normalisation removes it.
 * Here nothing removes it — an innate is worth one average line, a rune's own score
 * counts it in full, and how much one average line is worth *relative to the gap
 * between the two anchors* is precisely the quantity that differs from slot to slot.
 *
 * ## Why it takes a family of builds and not one
 *
 * A preset describes a family of builds and §5.1 lets a rune keep its best of them.
 * A slot-1 rune fits **every** build, because its main property is fixed and no
 * build can disagree with it; a slot-2 rune fits only the builds that name its own
 * main. So the two take their maximum over pools of very different sizes — 24
 * against 6 for Bruiser — and a maximum over more draws is simply larger. Measured,
 * that alone put Bruiser's slot-1 box a tenth of a standing above its slot-4 box,
 * 0.21 against 0.11, after the legality skew above had been removed.
 *
 * **The ordinary rune is therefore offered the same choice.** Each drawn line-up is
 * priced in every build of the family and keeps its best, exactly as the candidate
 * does, and only then is the average taken. Max-then-average, in that order: the
 * other order is a different and smaller number, and it is the one that leaves the
 * bias behind.
 *
 * ## Why the whole shape and not the middle, or the middle and the width
 *
 * Putting the middles of the six boxes in the same place is not enough, because the
 * boxes are not the same width: a slot whose main property has taken the role's
 * tightest stat off its own sub-property list scores through the remaining stats,
 * which the role prices more evenly, so its box is narrower, and a floor a fixed
 * distance above the middle cuts a narrow box higher up than a wide one. Measured
 * with the middles aligned and the widths ignored, the floor still admitted 16 % of
 * one slot against 6 % of another.
 *
 * Matching the widths as well is not enough either, and a maximum Gem credited to a
 * role built around DEF is the case that shows it. In the two slots that may draw
 * DEF the Gem gives *every* rune the stat the role is starved of, so the top of the
 * distribution is crushed against the ceiling; in the four that may not, it does
 * nothing of the kind and the long right tail survives. Two boxes of the same middle
 * and the same width, and a Gaussian read of them still took 20.0 % of one slot and
 * 13.7 % of another, because the difference was in the third moment and beyond.
 *
 * **So the box is kept as a distribution.** The enumeration below already visits
 * every line-up and every innate with its exact weight, and that *is* the shape —
 * the between-line-up spread is where a peaked set of weights does all its work.
 * Each case is laid onto a `0`–`1` grid smeared by its own within-case spread, which
 * closed form gives exactly: the roll values and the upgrade allocation, both linear
 * in the valuation. Within one line-up that smear really is a sum of eight uniform
 * rolls and a Gaussian is the right shape for it; between line-ups it is not, and
 * nothing here assumes it is.
 */
export function ordinaryBox(candidates: readonly RuneCandidate[]): OrdinaryBox {
  const empty: OrdinaryBox = { value: 0, below: [] };
  if (candidates.length === 0) return empty;
  const [first] = candidates;
  /* One box describes one slot holding one main property. Every build of a preset
     that a given rune survives puts that rune's own main in its slot, or leaves the
     slot unstated for all of them, so the family is uniform by construction — but
     it is an invariant a caller could break silently by passing two runes' worth of
     candidates, and a box quietly describing the wrong slot is exactly the failure
     this whole anchor exists to prevent. */
  for (const candidate of candidates) {
    if (candidate.main !== first.main || candidate.rune.slot !== first.rune.slot) {
      throw new Error('Rune Clean-up: an ordinary box was asked to describe two different slots at once.');
    }
  }
  const ids = allStatIds.filter((statId) => statId !== first.main
    && slotAllowsSubStat(first.rune.slot, statId));
  if (ids.length < 4) return empty;

  /* The family is named by short numbers rather than by its valuations' own keys.
     This runs once per rune per preset, and a valuation key carries the whole
     target row and reference line — two dozen of them concatenated is a kilobyte
     of string built and thrown away for every lookup. A number per valuation
     identifies it exactly as well, because a valuation is already memoised per
     weight set for the life of the scope. */
  const key = `${first.rune.slot}|${first.main}|${creditKey(first.credit)}`
    + `|${candidates.map((candidate) => valuationNumber(candidate.valuation)).sort().join(' ')}`;
  const cached = first.scope.ordinary.get(key);
  if (cached !== undefined) return cached;

  const builds: OrdinaryPrices[] = [];
  for (const candidate of candidates) {
    if (candidate.ceiling <= 0) continue;
    const { valuation, credit } = candidate;
    const prices: OrdinaryPrices = {
      ceiling: slotCeiling(valuation, candidate.rune.slot, candidate.main, credit, 'standard'),
      line: new Map(), innate: new Map(), gem: new Map(), roll: new Map(),
    };
    for (const statId of ids) {
      const range = subPropertyRange(6, statId, 'upgrade');
      const width = range ? range.maximum - range.minimum + 1 : 1;
      const mean = range ? (range.minimum + range.maximum) / 2 : 0;
      const grind = grindCredit(statId, 'standard', credit);
      prices.line.set(statId, valuation.value(statId, mean * 2 + grind));
      prices.innate.set(statId, valuation.value(statId, mean));
      prices.roll.set(statId, {
        factor: valuation.value(statId, 1), mean, variance: (width * width - 1) / 12,
      });
      const rolled = gemCredit(statId, 'standard', credit);
      if (rolled !== null) prices.gem.set(statId, valuation.value(statId, rolled + grind));
    }
    builds.push(prices);
  }
  if (builds.length === 0) return empty;

  /* Every line-up the slot can draw, weighted equally, which is what "uniformly
     without replacement" means. Ten legal ids is 210 draws, the same order as the
     ceiling's own enumeration, and the whole answer is memoised on the scope. */
  const draws = combinations(ids, 4);
  let mean = 0;
  let weight = 0;
  /* The shape, laid down case by case: `density[i]` is the mass this box puts on
     Max values around `i / boxResolution`. */
  const density = new Float64Array(boxResolution + 1);
  for (const drawn of draws) {
    const held = new Set(drawn);
    /* Per build: the plain line-up, and — for each placement a Gem could take —
       the best and second-best legal Gem. The runner-up is what an innate needs:
       it bars one further id, and the only draw it changes is the one where the
       id it barred is the very one the Gem wanted. */
    const priced = builds.map((prices) => {
      const plain = drawn.reduce((sum, statId) => sum + (prices.line.get(statId) ?? 0), 0);
      const placements: Array<{ replaced: number; kept: number; barred: number; first: number; second: number }> = [];
      for (const replaced of drawn) {
        const kept = plain - (prices.line.get(replaced) ?? 0);
        let firstValue = -Infinity;
        let second = -Infinity;
        let barred = 0;
        for (const [statId, value] of prices.gem) {
          if (statId !== replaced && held.has(statId)) continue;
          if (value > firstValue) { second = firstValue; firstValue = value; barred = statId; }
          else if (value > second) second = value;
        }
        if (firstValue === -Infinity) continue;
        placements.push({ replaced, kept, barred, first: firstValue, second });
      }
      return { prices, plain, placements };
    });

    /**
     * This line-up in one build, with the Gem spent where it earns most. `gemmed`
     * is the line it froze, whose own rolls no longer vary.
     */
    const arrange = (entry: typeof priced[number], innateId: number | null) => {
      let value = entry.plain;
      let gemmed: number | null = null;
      for (const placement of entry.placements) {
        const gemValue = placement.barred === innateId ? placement.second : placement.first;
        if (gemValue === -Infinity) continue;
        if (placement.kept + gemValue > value) { value = placement.kept + gemValue; gemmed = placement.replaced; }
      }
      if (innateId !== null) value += entry.prices.innate.get(innateId) ?? 0;
      return { value, gemmed };
    };

    /** The spread one arrangement's own rolls and upgrade allocation still carry. */
    const spreadOf = (prices: OrdinaryPrices, gemmed: number | null, innateId: number | null) => {
      const active = drawn.filter((statId) => statId !== gemmed);
      let total = 0;
      for (const statId of active) {
        const roll = prices.roll.get(statId);
        if (!roll) continue;
        /* One initial roll plus `K` upgrades: the roll values contribute
           `E[1 + K]` intervals' worth of variance, and the count itself
           contributes its own variance at one mean roll apiece. */
        total += roll.factor * roll.factor * (2 * roll.variance + upgradeCountVariance * roll.mean * roll.mean);
      }
      for (const left of active) for (const right of active) {
        if (left === right) continue;
        const a = prices.roll.get(left);
        const b = prices.roll.get(right);
        if (!a || !b) continue;
        total += a.factor * b.factor * a.mean * b.mean * upgradeCountCovariance;
      }
      if (innateId !== null) {
        const roll = prices.roll.get(innateId);
        if (roll) total += roll.factor * roll.factor * roll.variance;
      }
      return total;
    };

    /** One case of the box — a line-up, with or without a named innate. */
    const record = (innateId: number | null, share: number) => {
      let best = -Infinity;
      let chosen = priced[0];
      let gemmedLine: number | null = null;
      for (const entry of priced) {
        const { value, gemmed } = arrange(entry, innateId);
        const scaled = value / entry.prices.ceiling;
        if (scaled > best) { best = scaled; chosen = entry; gemmedLine = gemmed; }
      }
      const caseVariance = Math.max(0,
        spreadOf(chosen.prices, gemmedLine, innateId) / (chosen.prices.ceiling ** 2));
      mean += share * best;
      weight += share;
      smear(density, best, Math.sqrt(caseVariance), share);
    };

    record(null, 1 - innateFrequency);
    const free = ids.filter((statId) => !held.has(statId));
    for (const statId of free) record(statId, innateFrequency / free.length);
  }

  if (weight <= 0) return empty;

  /* The shape, as the share of the box at or below each grid point. Normalised by
     the mass actually laid down rather than by `weight`, so a case whose smear was
     clipped at either end of the scale cannot bend the total off 1. */
  const below = new Array<number>(boxResolution + 1);
  let running = 0;
  for (let at = 0; at <= boxResolution; at += 1) { running += density[at]; below[at] = running; }
  if (running > 0) for (let at = 0; at <= boxResolution; at += 1) below[at] /= running;

  const box: OrdinaryBox = {
    value: Math.min(1, Math.max(0, mean / weight)),
    below: running > 0 ? below : [],
  };
  first.scope.ordinary.set(key, box);
  return box;
}

/**
 * Lay one case's mass onto the grid, as a Gaussian of its own within-case spread.
 *
 * The Gaussian is right *here* and nowhere else in this file: within one line-up the
 * score is a sum of eight uniform rolls over at most four intervals, which is as
 * close to normal as a small sum gets. It is the spread *between* line-ups that is
 * nothing like normal, and that one is carried by the enumeration rather than by a
 * formula.
 *
 * A case narrower than half a grid step is split between its two neighbouring points
 * instead, so a case with no spread at all still lands somewhere definite and the
 * grid stays a partition of the mass.
 */
function smear(density: Float64Array, centre: number, deviation: number, share: number): void {
  const at = Math.min(1, Math.max(0, centre)) * boxResolution;
  const middle = Math.round(at);
  const steps = deviation * boxResolution;
  if (!(steps > 0.5)) {
    const low = Math.min(boxResolution, Math.max(0, Math.floor(at)));
    const high = Math.min(boxResolution, low + 1);
    const part = at - low;
    density[low] += share * (1 - part);
    density[high] += share * part;
    return;
  }
  const kernel = gaussianKernel(steps, at - middle);
  const reach = (kernel.length - 1) >> 1;
  const from = middle - reach;
  /* The whole bell lands on the scale, which is almost every case: the kernel is
     already normalised, so one pass adds it. */
  if (from >= 0 && middle + reach <= boxResolution) {
    for (let index = 0; index < kernel.length; index += 1) density[from + index] += share * kernel[index];
    return;
  }
  /* Clipped by an end of the scale. What falls off is dropped rather than folded
     back, and what landed is renormalised to carry the case's whole share. */
  let total = 0;
  for (let index = Math.max(0, -from); index < kernel.length && from + index <= boxResolution; index += 1) {
    total += kernel[index];
  }
  if (total <= 0) { density[Math.min(boxResolution, Math.max(0, middle))] += share; return; }
  for (let index = Math.max(0, -from); index < kernel.length && from + index <= boxResolution; index += 1) {
    density[from + index] += share * kernel[index] / total;
  }
}

/**
 * The bell every case is smeared with, normalised, and cached by its width and its
 * sub-step offset.
 *
 * A box lays down a couple of thousand cases and each covers scores of grid points,
 * so building the curve per case put hundreds of thousands of `exp` calls behind
 * every box and trebled what a real account costs to judge. The shape depends on
 * nothing but those two numbers, and both are quantised — the width to a twentieth
 * of a grid step and the offset to a quarter of one, which moves a case's mass by at
 * most an eighth of a step, or a twentieth of a percentage point of Max value. Both
 * are folded into one integer key, because building a string key per case was itself
 * a third of what the caching saved.
 *
 * **Three deviations each way** holds all but 27 parts in 10,000, and the kernel is
 * normalised over exactly what it spans, so nothing is lost — the tails are folded
 * into the shoulders rather than dropped.
 *
 * The cache is emptied rather than trimmed when it grows past its bound. It is a
 * pure function of two numbers, so throwing it away costs only the work of building
 * the next few — and an unbounded one in a worker that lives as long as the page
 * does is a leak waiting for an account with enough distinct roles to find it.
 */
const gaussianKernels = new Map<number, Float64Array>();
const gaussianKernelLimit = 2048;

function gaussianKernel(steps: number, offset: number): Float64Array {
  const twentieths = Math.max(1, Math.round(steps * 20));
  const quarters = Math.round(offset * 4);
  const key = twentieths * 16 + quarters + 8;
  let found = gaussianKernels.get(key);
  if (!found) {
    const width = twentieths / 20;
    const shift = quarters / 4;
    const reach = Math.ceil(3 * width);
    found = new Float64Array(2 * reach + 1);
    let total = 0;
    for (let index = 0; index < found.length; index += 1) {
      const z = (index - reach - shift) / width;
      found[index] = Math.exp(-z * z / 2);
      total += found[index];
    }
    for (let index = 0; index < found.length; index += 1) found[index] /= total;
    if (gaussianKernels.size >= gaussianKernelLimit) gaussianKernels.clear();
    gaussianKernels.set(key, found);
  }
  return found;
}

/* ------------------------------------------------------------ the candidate */

/**
 * Everything one rune against one build of one preset settles before a threshold
 * is named.
 *
 * The page asks two questions of the same pair, and they arrive separately: what
 * is this rune's ceiling, and — for the few candidates still standing after the
 * value gate — what are its odds of reaching the bar. Both rest on the same
 * weights, the same craft projection and the same event count, and answering them
 * through one function meant computing all of that twice for one extra number.
 */
export type RuneCandidate = {
  readonly rune: Rune;
  readonly valuation: Valuation;
  readonly weights: SubstatWeights;
  readonly lineUp: LineUp;
  readonly ceiling: number;
  /** The main property this build puts in the rune's slot, which fixes its legal ids. */
  readonly main: number;
  readonly best: number;
  readonly mainScale: number;
  readonly events: readonly SubPropertyEvent[];
  readonly adds: number;
  readonly rolls: number;
  readonly credit: CraftCredit;
  readonly lineage: CraftLineage;
  readonly rank: MatchRank;
  readonly scope: RuneAdviceScope;
};

/**
 * The scratchpad for one whole calculation.
 *
 * The weights and the ceilings do not depend on the rune — only on the preset, the
 * build, the slot, the rune's set and the reference line — so they are memoised
 * here rather than in a module-global cache. The lifetime is what makes them safe:
 * presets are user-editable and the reference lines depend on the imported account,
 * so there is no stable key that outlives a call and no invalidation rule worth
 * inventing for one.
 *
 * A caller that passes no scope gets a fresh one and therefore no sharing, which
 * is exactly right for a single `judgeAgainstBuild` from a test or the oracle.
 */
export type RuneAdviceScope = {
  weights: SubstatWeightScope;
  /** The perfect rune of one slot, by valuation, slot, main, craft credit and lineage. */
  ceiling: Map<string, number>;
  /** The ordinary box of one slot, by the same plus the whole family of builds. */
  ordinary: Map<string, OrdinaryBox>;
  /**
   * One distribution per distinct line, shared by every rune this call judges.
   *
   * It cannot be module-global any more, because a distribution is now built in the
   * role's weighted units and is meaningless to a preset that prices that stat
   * differently. It must not be per-`reachChance` either: the same terms recur across
   * hundreds of branches *and* across every rune with the same set judged against the
   * same build, and rebuilding them per call cost a real account fourteen times its
   * run time. The key carries the valuation, so a cache hit is a cache hit for the
   * same arithmetic.
   */
  distributions: Map<string, Distribution>;
};

export const newRuneAdviceScope = (): RuneAdviceScope => ({
  weights: newSubstatWeightScope(), ceiling: new Map(), ordinary: new Map(), distributions: new Map(),
});

/** The deterministic half: everything that does not depend on the threshold. */
export function prepareRuneCandidate(
  rune: Rune, preset: RunePotentialPreset, build: Build, base: ReferenceStats, credit: CraftCredit,
  scope: RuneAdviceScope = newRuneAdviceScope(),
): RuneCandidate | null {
  /* A rune whose main property is not the one this build asks for is not a rune
     this build can use at all — it is a different build's rune. */
  if (mainOfSlot(build, rune.slot) !== rune.mainStatId && build.mains[rune.slot as 2 | 4 | 6] !== 0) return null;

  const main = mainOfSlot(build, rune.slot);
  /* The weights read nothing about this rune. Two runes that differ only in their set
     are scored identically, which is what lets the recommendation compare them; a set
     decides a verdict through the preset's own ranking and the two set sliders, never
     through the arithmetic. `verify:rune-set-neutrality` is the check. */
  const weights = substatWeights({
    targets: preset.targets, mains: buildMains(build), artifacts: preset.artifacts, base,
  }, scope.weights);
  if (weights.weights.size === 0) return null;
  const valuation = weightedValuation(base, weights);

  const lineage: CraftLineage = rune.ancient ? 'ancient' : 'standard';
  /* The slot belongs in the key. Two slots can carry the same main property — ATK +
     is slot 1's fixed main and one of slot 2's choices — while forbidding different
     sub properties, so a key without the slot handed slot 2 slot 1's ceiling. */
  const ceilingKey = `${valuation.key}|${rune.slot}|${main}|${creditKey(credit)}|${lineage}`;
  let ceiling = scope.ceiling.get(ceilingKey);
  if (ceiling === undefined) {
    ceiling = slotCeiling(valuation, rune.slot, main, credit, lineage);
    scope.ceiling.set(ceilingKey, ceiling);
  }
  if (ceiling <= 0) return null;

  const { events, adds, rolls } = remainingEvents(rune.level, runeDefaultGradeOrder(rune.defaultGrade));

  /* Which craft projection is best is decided on the **end state**, not on what the
     rune shows today: below +12 a Gem freezes the line it lands on, and a line-up
     chosen on present value alone would happily freeze the line the remaining
     upgrades were going to land on. */
  let lineUp: LineUp | null = null;
  let best = -Infinity;
  for (const option of lineUpOptions(rune, valuation, credit)) {
    const candidate: LineUp = { ...option, have: valueOfLineUp(option, rune, valuation) };
    const reachable = bestReachableScore(rune, candidate, valuation, credit, lineage, events);
    if (reachable > best) { best = reachable; lineUp = candidate; }
  }
  if (lineUp === null) return null;

  /* A main property is deterministic, but its final size depends on stars. It is
     part of a rune's potential, so a perfect 4★ rune cannot read as a perfect 6★
     rune merely because its sub properties were excellent. Ancient does not alter
     main properties. */
  const sixStarMain = mainPropertyMaximum(6, rune.mainStatId);
  const mainScale = sixStarMain > 0 ? mainPropertyMaximum(rune.stars, rune.mainStatId) / sixStarMain : 0;

  const setRank = rankOf(preset.sets, rune.setName);
  const mainRank: MatchRank = rune.slot === 2 || rune.slot === 4 || rune.slot === 6
    ? build.ranks[rune.slot as 2 | 4 | 6] : 'preferred';

  return {
    rune, valuation, weights, lineUp, ceiling, main, best, mainScale, events, adds, rolls, credit,
    lineage, rank: worseRank(setRank, mainRank), scope,
  };
}

/** The best legal end state, against the best a rune in this slot could be. */
export function candidateMaxValue(candidate: RuneCandidate): number {
  /* Ordinary runes cannot exceed their ordinary perfect-rune denominator. An
     Ancient rune may: its verified initial rolls are deliberately measured against
     that same ordinary denominator, so a maximum Ancient roll remains visible as
     more than 100 % instead of being flattened away. */
  const ratio = candidate.best / candidate.ceiling;
  return (candidate.rune.ancient ? ratio : Math.min(1, ratio)) * candidate.mainScale;
}

/* ------------------------------------------------------------ the standing */

/**
 * **The share of an ordinary box of its own slot that a rune beats, `0`–`1`.**
 *
 * This is the currency every gate and every allocation place is settled in, and Max
 * value is what the row prints. They answer different questions, and the answer to
 * the second one is not comparable between slots: a slot that may not legally carry
 * the stat the role is starved of has a lower ceiling *and* a box of ordinary runes
 * that sits at a different place on it and is a different width. Read as a position
 * in the slot's own box, `0.85` means the same thing everywhere — better than 85 %
 * of what that slot ordinarily produces for this role.
 *
 * The box is **not** scaled by the candidate's main-property factor, and that is
 * deliberate: a four-star rune is measured against the same six-star box everybody
 * else is, so its smaller main property costs it standing instead of buying it a
 * lower bar.
 *
 * It is read straight off the box's recorded shape, so nothing here assumes the six
 * boxes are alike in anything but the question asked of them.
 */
export function standingIn(box: OrdinaryBox, maxValue: number): number {
  if (box.below.length === 0) return maxValue > box.value ? 1 : 0;
  const at = Math.min(boxResolution, Math.max(0, maxValue * boxResolution));
  const low = Math.min(boxResolution - 1, Math.floor(at));
  return box.below[low] + (at - low) * (box.below[low + 1] - box.below[low]);
}

/**
 * The Max value at which the best `share` of an ordinary box of this slot begins —
 * the reading `standingIn` inverts, so a floor stated as a share of the box and the
 * odds of clearing it are one and the same bar.
 */
export function boxThreshold(box: OrdinaryBox, share: number): number {
  if (share >= 1) return Number.NEGATIVE_INFINITY;
  if (share <= 0) return Number.POSITIVE_INFINITY;
  if (box.below.length === 0) return box.value;
  const wanted = 1 - share;
  /* The first grid point the box has already reached `wanted` at, then back down
     the last step linearly — the exact inverse of the interpolation above. */
  let low = 0;
  let high = boxResolution;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (box.below[middle] < wanted) low = middle + 1; else high = middle;
  }
  if (low === 0) return 0;
  const under = box.below[low - 1];
  const over = box.below[low];
  const part = over > under ? (wanted - under) / (over - under) : 0;
  return (low - 1 + part) / boxResolution;
}

/**
 * The odds of reaching `threshold`, which is the Max value the rune has to reach.
 *
 * It is passed in rather than read from a setting because this module decides
 * nothing about policy — `rune-cleanup-advice.ts` does that.
 */
export function candidateChance(candidate: RuneCandidate, threshold: number): number {
  const wanted = candidate.mainScale > 0
    ? threshold * candidate.ceiling / candidate.mainScale : Number.POSITIVE_INFINITY;
  /* `best` is an upper bound over every legal remaining roll, so a threshold
     above it has an exact zero chance. Most account runes miss the quality floor;
     short-circuiting here prevents those certain losses from constructing their full
     addition-and-upgrade probability tree merely to discover that same zero. */
  if (!(candidate.best + 1e-12 >= wanted)) return 0;
  return reachChance(candidate, wanted);
}

/**
 * One rune against one build of one preset, both answers at once.
 *
 * `rune-cleanup-advice.ts` no longer takes this route — it prepares a candidate
 * and asks the two questions separately — but `verify-rune-cleanup-calibration.mjs`
 * calls it directly, and that script is the independent gate on everything in this
 * file. An oracle rewritten in the same commit as the model it checks has stopped
 * being independent, so this signature stays.
 */
export function judgeAgainstBuild(
  rune: Rune, preset: RunePotentialPreset, build: Build, base: ReferenceStats,
  threshold: number, credit: CraftCredit,
  /* The chance is the expensive half — it enumerates every way the remaining
     upgrades can fall — and most builds are rejected on their ceiling long before
     anyone needs it. So it is only worked out when the caller says it will be
     used, which is what makes checking every build affordable. */
  withChance = true,
): RuneOutcome | null {
  const candidate = prepareRuneCandidate(rune, preset, build, base, credit);
  if (!candidate) return null;
  return {
    maxValue: candidateMaxValue(candidate),
    chance: withChance ? candidateChance(candidate, threshold) : 0,
    rank: candidate.rank,
  };
}

/* ------------------------------------------------------- the reachable best */

/** Every effect id the projected rune occupies at any point, Gem and Gemmed alike. */
function heldStatIds(lineUp: LineUp): Set<number> {
  const held = new Set(lineUp.lines.map((line) => line.statId));
  if (lineUp.gemStatId !== null) held.add(lineUp.gemStatId);
  if (lineUp.replacedStatId !== null) held.add(lineUp.replacedStatId);
  return held;
}

/**
 * The best score this rune can still reach.
 *
 * **An improvement can only land on a line the rune already has.** That restriction
 * is the whole reason this is not a free greedy over every wanted stat: without it
 * the ceiling lets an upgrade invent a SPD line the rune does not own, while the
 * chance — correctly — will not, and the page ends up printing a 68 % ceiling beside
 * a 0 % chance. A rune with four useless lines and no additions left cannot improve,
 * however much the role wants something else.
 *
 * The event order matters below +12. A Magic, Rare or Hero rune improves its born
 * lines before it gains every later line, so an early upgrade cannot land on a line
 * that does not exist yet. The recursion follows that schedule and chooses the best
 * legal result at each event. A line reserved for a Gem is still a legal upgrade
 * target in the game, but its upgrade is discarded when the Gem is spent, so it
 * contributes zero here. A future line is credited with the same Grindstone the
 * settings credit every other line, since it will be an ordinary line by the time
 * the stone is spent.
 */
function bestReachableScore(
  rune: Rune, lineUp: LineUp, valuation: Valuation, credit: CraftCredit, lineage: CraftLineage,
  events: readonly SubPropertyEvent[],
): number {
  const upgradeValue = (statId: number) =>
    valuation.value(statId, candidateRollRange(rune, statId, 'upgrade')?.maximum ?? 0);

  const blocked = heldStatIds(lineUp);
  const visit = (at: number, lineIds: readonly number[], total: number): number => {
    if (at === events.length) return total;
    const event = events[at];
    if (event === 'add') {
      const options = allStatIds.filter((statId) => !blocked.has(statId)
        && statId !== rune.mainStatId && statId !== rune.prefixStatId
        && slotAllowsSubStat(rune.slot, statId));
      let best = -Infinity;
      for (const statId of options) {
        blocked.add(statId);
        const initial = candidateRollRange(rune, statId, 'initial')?.maximum ?? 0;
        best = Math.max(best, visit(at + 1, [...lineIds, statId], total
          + valuation.value(statId, initial + grindCredit(statId, lineage, credit))));
        blocked.delete(statId);
      }
      return best;
    }

    let best = -Infinity;
    for (let lineAt = 0; lineAt < lineIds.length; lineAt += 1) {
      const gain = lineAt === lineUp.gemmedAt ? 0 : upgradeValue(lineIds[lineAt]);
      best = Math.max(best, visit(at + 1, lineIds, total + gain));
    }
    return best;
  };

  /* A rune with no legal addition left still keeps whatever it already has. */
  return Math.max(lineUp.have, visit(0, lineUp.lines.map((line) => line.statId), lineUp.have));
}

/* ---------------------------------------------------------------- the odds */

/**
 * The chance the rune's realised score reaches `wanted` by +12.
 *
 * The grade's event sequence is followed exactly: an improvement can choose only
 * among lines that exist at that event, while an addition creates a line before any
 * later event can choose it. Every legal branch is enumerated, and a line's
 * contributions are summed without a cap.
 *
 * **Two assumptions live here and in `rune-substat-weights.ts` and nowhere else.**
 * Which of the lines an improvement lands on, and which type a new line takes, are
 * uniform. Neither is established by any source (`RUNE-CANONICAL.md` §7); the
 * roll's *value* being uniform is measured, and is the third leg this stands on.
 * `verify:rune-cleanup-calibration` holds the whole thing to a Monte Carlo written
 * from the game's loop rather than from here.
 */
function reachChance(candidate: RuneCandidate, wanted: number): number {
  const { rune, lineUp, valuation, credit, lineage, events } = candidate;
  const gap = wanted - lineUp.have;
  if (gap <= 0) return 1;
  if (events.length === 0) return 0;
  /* Everything below this line is integer key space. A gap beyond the exact
     range of the key scale would silently start losing units, so it fails
     loudly instead — a slot ceiling is three orders of magnitude below it. */
  const gapKey = targetKey(gap);
  if (!isExactKey(gapKey)) {
    throw new Error(`Rune Clean-up: a gap of ${gap} score units exceeds the exact range of the probability key.`);
  }

  /* A branch follows the actual event sequence rather than separating all additions
     from all improvements. This is the distinction that matters at level 0: a Magic
     rune's +3 improvement can target only its born line, before the +6 line exists.
     Branches with the same term list are grouped after the sequence has been walked;
     grouping changes no probability, it only avoids repeating the same convolution. */
  type Term = { statId: number; count: number; kind: 'initial' | 'upgrade' };
  type BranchState = {
    lineIds: number[];
    blocked: Set<number>;
    terms: Map<string, Term>;
    certain: number;
    weight: number;
  };
  const branches = new Map<string, { terms: Term[]; certain: number; weight: number }>();
  const addTerm = (terms: Map<string, Term>, statId: number, kind: Term['kind']) => {
    if (valuation.value(statId, candidateRollRange(rune, statId, kind)?.maximum ?? 0) === 0) return;
    const key = `${statId}:${kind}`;
    const term = terms.get(key);
    if (term) term.count += 1;
    else terms.set(key, { statId, count: 1, kind });
  };
  const cloneTerms = (terms: Map<string, Term>): Map<string, Term> =>
    new Map([...terms].map(([key, term]) => [key, { ...term }]));
  const recordBranch = (state: BranchState) => {
    const terms = [...state.terms.values()]
      .sort((left, right) => left.statId - right.statId || left.kind.localeCompare(right.kind));
    const certainKey = probabilityKey(state.certain);
    const key = `${terms.map((term) => `${term.statId}:${term.count}:${term.kind}`).join('|')}#${certainKey}`;
    const group = branches.get(key);
    if (group) group.weight += state.weight;
    else branches.set(key, { terms, certain: certainKey, weight: state.weight });
  };
  const visit = (at: number, state: BranchState) => {
    if (at === events.length) { recordBranch(state); return; }
    const event = events[at];
    if (event === 'add') {
      const options = allStatIds.filter((statId) => !state.blocked.has(statId)
        && statId !== rune.mainStatId && statId !== rune.prefixStatId
        && slotAllowsSubStat(rune.slot, statId));
      if (options.length === 0) return;
      const branchWeight = state.weight / options.length;
      for (const statId of options) {
        const terms = cloneTerms(state.terms);
        addTerm(terms, statId, 'initial');
        const blocked = new Set(state.blocked);
        blocked.add(statId);
        visit(at + 1, {
          lineIds: [...state.lineIds, statId], blocked, terms,
          certain: state.certain + valuation.value(statId, grindCredit(statId, lineage, credit)),
          weight: branchWeight,
        });
      }
      return;
    }

    if (state.lineIds.length === 0) return;
    const branchWeight = state.weight / state.lineIds.length;
    for (let lineAt = 0; lineAt < state.lineIds.length; lineAt += 1) {
      const terms = cloneTerms(state.terms);
      /* The line a Gem is reserved for still receives the game's upgrade attempts,
         but all of those rolls are discarded when the Gem is spent at +12. */
      if (lineAt !== lineUp.gemmedAt) addTerm(terms, state.lineIds[lineAt], 'upgrade');
      visit(at + 1, { ...state, terms, weight: branchWeight });
    }
  };
  visit(0, {
    lineIds: lineUp.lines.map((line) => line.statId),
    blocked: heldStatIds(lineUp), terms: new Map(), certain: 0, weight: 1,
  });

  const distributions = candidate.scope.distributions;
  const distributionFor = (term: Term): Distribution => {
    const ancientInitial = rune.ancient && term.kind === 'initial' ? 'ancient' : 'ordinary';
    const key = `${valuation.key}|${rune.stars}|${term.statId}/${term.count}/${term.kind}/${ancientInitial}`;
    let found = distributions.get(key);
    if (!found) {
      found = rollDistribution(valuation, term.statId, term.count,
        candidateRollRange(rune, term.statId, term.kind));
      distributions.set(key, found);
    }
    return found;
  };

  let chance = 0;
  for (const { terms, certain, weight } of branches.values()) {
    const branchGap = gapKey - certain;
    if (branchGap <= 0) { chance += weight; continue; }
    /* Keyed rather than summed in value space, so a bound is exactly the extreme
       the convolution can produce rather than a double that rounds differently
       from the keys it is bounding. Each term's own bounds are kept, because the
       floor below needs them term by term and not only in total.

       Narrowest first, so the widest term is the one answered by tail lookup and
       never convolved. Addition is commutative and the terms are independent, so
       the distribution of their sum does not depend on the order; only the size
       of the intermediates does, and it depends on it enormously. */
    const ordered = terms.map((term) => {
      const range = candidateRollRange(rune, term.statId, term.kind);
      if (!range) return { term, minimum: 0, maximum: 0, width: 0 };
      return {
        term,
        minimum: probabilityKey(valuation.value(term.statId, range.minimum * term.count)),
        maximum: probabilityKey(valuation.value(term.statId, range.maximum * term.count)),
        width: term.count * (range.maximum - range.minimum),
      };
    }).sort((left, right) => left.width - right.width);
    if (ordered.length === 0) continue;

    /* A branch's roll ranges bound its gain before any distributions are built.
       In a real account most addition/upgrade splits cannot make the gap, and a
       few must make it. Those are exact 0 % and 100 % answers respectively, not
       approximations, so avoid allocating convolution maps for either case. */
    let minimumGain = 0;
    let maximumGain = 0;
    for (const bound of ordered) { minimumGain += bound.minimum; maximumGain += bound.maximum; }
    if (maximumGain < branchGap) continue;
    if (minimumGain >= branchGap) { chance += weight; continue; }

    /* How much a partial sum can still gain once term `at` has been convolved.
       It is the same bound the `maximumGain` prune above already trusts, read
       one term at a time, so a state below `branchGap - stillToCome[at]` is exactly
       as certain a zero as a branch the prune skips outright. */
    const stillToCome = new Array<number>(ordered.length).fill(0);
    for (let at = ordered.length - 2; at >= 0; at -= 1) {
      stillToCome[at] = stillToCome[at + 1] + ordered[at + 1].maximum;
    }
    /* The terms are walked rather than convolved into one another.
       `P(Σ ≥ g) = Σ_x P(x)·P(rest ≥ g − x)` is the same sum either way, but the
       convolution has to *materialise* each intermediate distribution in a map, and
       the last one before the tail lookup is the largest thing the whole calculation
       builds. Weighting the stats is what made that expensive: two different stats'
       rolls used to land on the same key often enough for the map to stay small, and
       once every stat carries its own multiplier they almost never do, so the map was
       paying to merge entries that no longer merge.

       Both bounds survive intact, and they now prune a whole subtree rather than one
       pair: a partial sum that cannot reach the gap even if every later term rolls its
       maximum is skipped, and one that has already reached it contributes its entire
       remaining mass at once. The widest term is still read rather than walked. */
    const last = ordered.length - 1;
    const views = ordered.map((entry) => tailView(distributionFor(entry.term)));
    const walk = (at: number, gain: number, probability: number) => {
      if (at === last) {
        chance += weight * probability * tailMass(views[last], branchGap - gain);
        return;
      }
      const { values, probabilities, atOrAbove } = views[at];
      /* Below this the branch is a certain zero; at or above `reached` it is a
         certain one, whatever the terms after it do. */
      const hopeless = branchGap - stillToCome[at] - gain;
      const reached = branchGap - gain;
      let from = 0;
      while (from < values.length && values[from] < hopeless) from += 1;
      let until = from;
      while (until < values.length && values[until] < reached) until += 1;
      for (let index = from; index < until; index += 1) {
        walk(at + 1, gain + values[index], probability * probabilities[index]);
      }
      if (until < values.length) chance += weight * probability * atOrAbove[until];
    };
    walk(0, 0, 1);
  }
  return Math.min(1, Math.max(0, chance));
}

/** Whether a set takes four runes, which the "keep twice as many" setting reads. */
export const isFourPieceSet = (setName: string): boolean => runeSetPieceCount[setName] === 4;
