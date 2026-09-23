/**
 * **The single source of truth for what a rune is worth and what it may become.**
 *
 * `docs/RUNE-CLEANUP-MATH.md` owns the reasoning; this owns the arithmetic. Every
 * figure the Rune Clean-up page states — a rune's Max value, its chance of reaching a
 * threshold, which preset suits it — is settled here and nowhere else. A second
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
 * named in `rune-power-up-outcomes.ts` and in the weights module, at the two places
 * they are used, so nothing downstream can present them as game facts.
 */
import { slotAllowsSubStat } from './runes';
import type { Rune } from './runes';
import { isIntangibleRuneSet, runeSetPieceCount } from './rune-sets';
import { allStatIds, mainPropertyMaximum, maximumRoll, subPropertyRange } from './rune-properties';
import type { ReferenceStats } from './rune-reference-stats';
import type { PresetChoice, RunePotentialPreset } from './rune-potential-presets';
import { runeMainStatIds } from './rune-potential-presets';
import {
  newSubstatWeightScope, substatWeights, targetStats, weightedValuation,
} from './rune-substat-weights';
import type { BuildMains, SubstatWeightScope, SubstatWeights } from './rune-substat-weights';
import type { Valuation } from './rune-substat-weights';
import {
  craftPlan, craftedScore, creditKey, gemOptions, grindCredit, hasCraftCredit,
  priceList, withoutCraft,
} from './rune-craft-end-state';
import type {
  CraftCredit, CraftPlan, EndStateLine, GemOptions, PriceList,
} from './rune-craft-end-state';
import type { CraftLineage } from './rune-craft-items';
import {
  bestEndState, chanceRuns, chanceStep, countJobs, endStateScoring, runeFuture,
} from './rune-power-up-outcomes';
import type { CountingJob, EndStateScoring, RuneFuture } from './rune-power-up-outcomes';

export type { CraftCredit } from './rune-craft-end-state';

export { targetStats };

/** Whether a rune answers a preset's wish in full, partly, or not at all. */
export type MatchRank = 'preferred' | 'acceptable' | 'broken';

const rankOf = <T>(choice: PresetChoice<T>, value: T): MatchRank =>
  choice.preferred.includes(value) ? 'preferred'
    : choice.acceptable.includes(value) ? 'acceptable' : 'broken';

/**
 * Intangible's set rank is a product rule, not a preset preference. It completes
 * one missing set and is therefore always preferred for the set half of every
 * preset. The preset may still judge the rune's main stat separately.
 */
export function runeSetMatchRank(choice: PresetChoice<string>, setName: string): MatchRank {
  return isIntangibleRuneSet(setName) ? 'preferred' : rankOf(choice, setName);
}

/** Whether the set is a four-piece set for the relative retention preference. */
export const isFourPieceSet = (setName: string): boolean => runeSetPieceCount[setName] === 4;

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
 *
 * **That includes the craft tables, and it used not to.** An Ancient candidate was
 * given an *Ancient* perfect rune to divide by, so its stronger Ancient Gem and stone
 * paid for its own denominator and cancelled most of what they had just earned it. On
 * a Legend Ancient slot-2 rune at `+12` with Hero items at three quarters the bar
 * stood 4.1 % higher and the rune read 71.5 % where the ordinary bar says 74.5 %.
 * §6's "Ancient runes use Ancient craft tables" is a rule about what a *rune* may be
 * spent on; the reference is the ordinary six-star rune of §5, whole, which is why
 * this takes no lineage.
 */
export function slotCeiling(
  valuation: Valuation, slot: number, main: number, credit: CraftCredit,
): number {
  const prices = priceList(valuation);
  const plan = craftPlan('standard', credit);
  const ids = allStatIds.filter((statId) => statId !== main && slotAllowsSubStat(slot, statId))
    .filter((statId) => maximumRoll(statId) * prices[statId] > 0);
  if (ids.length === 0) return 0;

  /* A line of one maximum roll, with its Grindstone. The order this produces is the
     order the three plain lines are filled in, and it is the same for every
     arrangement below, so it is worked out once. */
  const oneRoll = new Map<number, number>();
  for (const statId of ids) {
    oneRoll.set(statId, (maximumRoll(statId) + grindCredit(plan, statId)) * prices[statId]);
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
      buffer[0].value = maximumRoll(sink) * 5;
      let filled = 1;
      for (const statId of byOneRoll) {
        if (filled === 4) break;
        if (statId === sink || statId === innate) continue;
        buffer[filled].statId = statId;
        buffer[filled].value = maximumRoll(statId);
        filled += 1;
      }
      /* A role that values fewer than four of the slot's effect ids has fewer than
         four lines worth writing down. The rune still has four, and the rest are worth
         nothing to it — which is the same arrangement with the zeroes left out. */
      const lines = filled === 4 ? buffer : buffer.slice(0, filled);
      const prefixScore = innate === null ? 0 : maximumRoll(innate) * prices[innate];
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

/* ------------------------------------------------- the ordinary rune */

/**
 * Every unordered draw without replacement, each of them equally likely.
 *
 * It lives here because the box below is the one thing left that needs it: the lines a
 * slot can draw are a *set*, and the order they arrive in cannot matter to what the
 * line-up is worth. Ten legal ids is 210 draws.
 */
function combinations<T>(items: readonly T[], count: number): T[][] {
  if (count === 0) return [[]];
  const out: T[][] = [];
  const chosen: T[] = [];
  const visit = (from: number) => {
    if (chosen.length === count) { out.push([...chosen]); return; }
    for (let at = from; at <= items.length - (count - chosen.length); at += 1) {
      chosen.push(items[at]); visit(at + 1); chosen.pop();
    }
  };
  visit(0);
  return out;
}

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

/**
 * One build's price list for one slot's legal effect ids.
 *
 * It carries no craft arithmetic of its own. The end state of an ordinary rune is
 * settled by `craftedScore` — the same function a candidate's own end state and the
 * §5 ceiling go through — because this used to be a sixth place that applied
 * `RUNE-CANONICAL.md` §8, and §6.1 is the account of what two copies of those rules
 * cost the last time. `verify:rune-craft-single-source` now guards the decision as
 * well as the tables.
 */
type OrdinaryPrices = {
  ceiling: number;
  /** What one raw point of each effect id is worth, as `craftedScore` reads it. */
  unit: PriceList;
  /** The legal Gems for this build, by the innate that bars one of them; `-1` is none. */
  options: Map<number, GemOptions>;
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
  /* One box describes one slot holding one main property, at one craft credit. Every
     build of a preset that a given rune survives puts that rune's own main in its
     slot, or leaves the slot unstated for all of them, and the credit is the
     account's rather than the build's — so the family is uniform by construction. It
     is still an invariant a caller could break silently by passing two runes' worth
     of candidates, and a box quietly describing the wrong slot is exactly the failure
     this whole anchor exists to prevent. */
  for (const candidate of candidates) {
    if (candidate.main !== first.main || candidate.rune.slot !== first.rune.slot
      || creditKey(candidate.credit) !== creditKey(first.credit)) {
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

  /* Ordinary throughout, Ancient candidates included: both ends of the scale have to
     stand still while the candidate moves, so the box is built with the ordinary
     lineage's craft tables as well as its roll tables. The credit is the account's and
     therefore one for the whole family, which the key above already assumes. */
  const plan = craftPlan('standard', first.credit);

  const builds: OrdinaryPrices[] = [];
  for (const candidate of candidates) {
    if (candidate.ceiling <= 0) continue;
    const { valuation, credit } = candidate;
    const unitPrices = priceList(valuation);
    const prices: OrdinaryPrices = {
      ceiling: slotCeiling(valuation, candidate.rune.slot, candidate.main, credit),
      unit: unitPrices, options: new Map(), roll: new Map(),
    };
    for (const statId of ids) {
      const range = subPropertyRange(6, statId, 'upgrade');
      const width = range ? range.maximum - range.minimum + 1 : 1;
      const mean = range ? (range.minimum + range.maximum) / 2 : 0;
      prices.roll.set(statId, {
        factor: unitPrices[statId], mean, variance: (width * width - 1) / 12,
      });
    }
    /* Which Gems are legal depends on the innate, because an innate bars one further
       effect id — so one list per innate, and `-1` for the runes that have none. They
       are worked out here rather than inside the draw loop: nothing about which ids a
       Gem may take depends on which four lines the rune happened to draw, and the
       blocked-by-another-line half is `craftedScore`'s own business. */
    prices.options.set(-1, gemOptions(plan, unitPrices, first.rune.slot, first.main, null));
    for (const statId of ids) {
      prices.options.set(statId, gemOptions(plan, unitPrices, first.rune.slot, first.main, statId));
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
  /* One line-up, reused across the draws. Each line stands at two average rolls —
     one initial and one upgrade, since four upgrades fall over four lines — and
     carries no stone of its own, so `craftedScore` credits whatever the settings
     assume exactly as it does for a real rune. */
  const lineUp: EndStateLine[] = [0, 1, 2, 3].map(() => ({ statId: 0, value: 0, grind: 0, gemmed: false }));
  const lineValues = new Float64Array(4);
  const report = { replaced: -1 };
  /* An interval's midpoint is a game number rather than a role's opinion, so it is
     the same in every build of the family. */
  const [firstBuild] = builds;
  for (const drawn of draws) {
    for (let at = 0; at < 4; at += 1) {
      lineUp[at].statId = drawn[at];
      lineUp[at].value = (firstBuild.roll.get(drawn[at])?.mean ?? 0) * 2;
    }

    /**
     * This line-up in one build, with the Gem spent where §8 says it earns most.
     * `gemmed` is the line it froze, whose own rolls no longer vary.
     *
     * The decision is `craftedScore`'s and not this file's — the same function that
     * settles a candidate's own end state and the §5 ceiling. It used to be written
     * out again here, with its own reading of which ids an innate bars and its own
     * "a Gem is never forced", and `RUNE-CLEANUP-MATH.md` §6.1 is the account of what
     * the last two copies of those rules cost.
     */
    const arrange = (prices: OrdinaryPrices, innateId: number | null) => {
      /* The innate takes neither craft item (`RUNE-CANONICAL.md` §4), so it is one
         average roll and no stone, and it is handed over as the prefix rather than as
         a line — which is also what keeps a Gem from being offered it. */
      const innate = innateId === null ? null : prices.roll.get(innateId);
      const prefixScore = innate ? innate.mean * innate.factor : 0;
      const options = prices.options.get(innateId ?? -1);
      const value = options === undefined ? prefixScore
        : craftedScore(plan, options, prices.unit, lineUp, prefixScore, lineValues, report);
      return { value, gemmed: report.replaced < 0 ? null : drawn[report.replaced] };
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
      let chosen = builds[0];
      let gemmedLine: number | null = null;
      for (const prices of builds) {
        const { value, gemmed } = arrange(prices, innateId);
        const scaled = value / prices.ceiling;
        if (scaled > best) { best = scaled; chosen = prices; gemmedLine = gemmed; }
      }
      const caseVariance = Math.max(0,
        spreadOf(chosen, gemmedLine, innateId) / (chosen.ceiling ** 2));
      mean += share * best;
      weight += share;
      smear(density, best, Math.sqrt(caseVariance), share);
    };

    record(null, 1 - innateFrequency);
    const free = ids.filter((statId) => !drawn.includes(statId));
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
 * weights, the same optional craft end state and the same event count, and answering them
 * through one function meant computing all of that twice for one extra number.
 */
export type RuneCandidate = {
  readonly rune: Rune;
  readonly valuation: Valuation;
  readonly weights: SubstatWeights;
  readonly ceiling: number;
  /** The main property this build puts in the rune's slot, which fixes its legal ids. */
  readonly main: number;
  /** The best legal end state the rune can still reach, in this role's units. */
  readonly best: number;
  readonly mainScale: number;
  /** What the rune may still become, which is a fact about the rune and not the role. */
  readonly future: RuneFuture;
  /** What this role pays, and what its craft items could do to this rune. */
  readonly scoring: EndStateScoring;
  readonly credit: CraftCredit;
  readonly plan: CraftPlan;
  readonly lineage: CraftLineage;
  readonly rank: MatchRank;
  readonly scope: RuneAdviceScope;
  /** The same candidate with no craft credit, used only for monotonic comparisons. */
  readonly baseline: RuneCandidate | null;
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
   * What a rune may still become, which every preset judging it asks the same way.
   *
   * It is also what the runs are gathered by: playing a rune forward is a fact about
   * the rune, so one set of runs answers every preset, every build and both the
   * credited and the neutral reading. That sharing is the whole reason the odds are
   * affordable, and it is why a job carries this object rather than a copy of it.
   */
  futures: Map<string, RuneFuture>;
};

export const newRuneAdviceScope = (): RuneAdviceScope => ({
  weights: newSubstatWeightScope(), ceiling: new Map(), ordinary: new Map(), futures: new Map(),
});

/** The deterministic half: everything that does not depend on the threshold. */
export function prepareRuneCandidate(
  rune: Rune, preset: RunePotentialPreset, build: Build, base: ReferenceStats, credit: CraftCredit,
  scope: RuneAdviceScope = newRuneAdviceScope(),
  includeBaseline = true,
): RuneCandidate | null {
  /* A rune whose main property is not the one this build asks for is not a rune
     this build can use at all — it is a different build's rune. */
  if (mainOfSlot(build, rune.slot) !== rune.mainStatId && build.mains[rune.slot as 2 | 4 | 6] !== 0) return null;

  /* **The scale is the one for the main property the rune actually carries.**
     A slot the preset says nothing about accepts every main it allows (§3), so the
     build states none and `mainOfSlot` answers `0`. That is the right answer for the
     *requirement* — a slot that promised nothing subtracts nothing (§4.1) — and the
     wrong one for the *scale*, because `0` is not a main property: it bars no effect
     id, so the perfect rune of §5 and the ordinary box of §9.1 are both built from a
     rune with four sub properties and no main at all, which the game cannot produce.
     Measured on a slot-2 ATK % rune against Fast DD with slot 2 cleared, the ceiling
     rose from 6.52 to 7.23 and the rune read 61.3 % where its own scale says 67.9 %.
     The rune's own main is a fact about the rune whatever the preset left blank. */
  const main = mainOfSlot(build, rune.slot) || rune.mainStatId;
  /* The weights read nothing about this rune. Two runes that differ only in their set
     are scored identically, which is what lets the recommendation compare them; a set
     decides a verdict through the preset's own ranking and the relative retention
     preferences, never through the arithmetic. Intangible's set rank is permanently
     preferred; its slider only widens the retained share. `verify:rune-set-neutrality`
     is the check. */
  const weights = substatWeights({
    targets: preset.targets, mains: buildMains(build), artifacts: preset.artifacts, base,
  }, scope.weights);
  if (weights.weights.size === 0) return null;
  const valuation = weightedValuation(base, weights);

  /* The rune's own lineage, which decides what *it* may be crafted with. The
     denominator below takes no lineage at all: both ends of the scale stand still
     while the candidate moves (§5), so the ceiling has no lineage in its key either. */
  const lineage: CraftLineage = rune.ancient ? 'ancient' : 'standard';
  /* The slot belongs in the key. Two slots can carry the same main property — ATK +
     is slot 1's fixed main and one of slot 2's choices — while forbidding different
     sub properties, so a key without the slot handed slot 2 slot 1's ceiling. */
  const ceilingKey = `${valuation.key}|${rune.slot}|${main}|${creditKey(credit)}`;
  let ceiling = scope.ceiling.get(ceilingKey);
  if (ceiling === undefined) {
    ceiling = slotCeiling(valuation, rune.slot, main, credit);
    scope.ceiling.set(ceilingKey, ceiling);
  }
  if (ceiling <= 0) return null;

  let future = scope.futures.get(rune.id);
  if (future === undefined || future.rune !== rune) {
    future = runeFuture(rune);
    scope.futures.set(rune.id, future);
  }
  const plan = craftPlan(lineage, credit);
  const scoring = endStateScoring(rune, valuation, plan);
  const best = bestEndState(future, scoring);

  /* A main property is deterministic, but its final size depends on stars. It is
     part of a rune's potential, so a perfect 4★ rune cannot read as a perfect 6★
     rune merely because its sub properties were excellent. Ancient does not alter
     main properties. */
  const sixStarMain = mainPropertyMaximum(6, rune.mainStatId);
  const mainScale = sixStarMain > 0 ? mainPropertyMaximum(rune.stars, rune.mainStatId) / sixStarMain : 0;

  const setRank = runeSetMatchRank(preset.sets, rune.setName);
  const mainRank: MatchRank = rune.slot === 2 || rune.slot === 4 || rune.slot === 6
    ? build.ranks[rune.slot as 2 | 4 | 6] : 'preferred';

  const baseline = includeBaseline && hasCraftCredit(credit)
    ? prepareRuneCandidate(rune, preset, build, base, withoutCraft(credit), scope, false)
    : null;

  return {
    rune, valuation, weights, ceiling, main, best, mainScale, future, scoring, credit, plan,
    lineage, rank: worseRank(setRank, mainRank), scope, baseline,
  };
}

/** The best legal end state, against the best a rune in this slot could be. */
export function candidateMaxValue(candidate: RuneCandidate): number {
  /* Ordinary runes cannot exceed their ordinary perfect-rune denominator. An
     Ancient rune may: its verified initial rolls are deliberately measured against
     that same ordinary denominator, so a maximum Ancient roll remains visible as
     more than 100 % instead of being flattened away. */
  const ownRatio = candidate.best / candidate.ceiling;
  const own = (candidate.rune.ancient ? ownRatio : Math.min(1, ownRatio)) * candidate.mainScale;
  /* Craft is optional. Comparing with the neutral candidate prevents a larger
     denominator or a poor assumed craft roll from making the displayed score fall. */
  return Math.max(own, candidate.baseline === null ? 0 : candidateMaxValue(candidate.baseline));
}

/* ------------------------------------------------------------ the standing */

/**
 * **The share of an ordinary box of its own slot that a rune beats, `0`–`1`.**
 *
 * This is the currency every gate and every comparison is settled in, and Max
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
 * **What answering one candidate's odds against one bar needs.**
 *
 * The threshold is passed in rather than read from a setting because this module
 * decides nothing about policy - `rune-cleanup-advice.ts` does that.
 *
 * It is an *ask* rather than an answer so that a whole account's worth can be
 * gathered and settled together. Most of them need nothing gathered: a rune at `+12`
 * has no gamble left, and most of the rest cannot reach the bar by any road or cannot
 * miss it. Those come back settled, and only what is left becomes a job - which is
 * what makes one pass over the graphics card, rather than one pass per rune, a shape
 * this can take at all.
 */
export type ChanceAsk = {
  readonly jobs: readonly CountingJob[];
  /** The answer, given what each of this ask's jobs came back with. */
  combine(shares: readonly number[]): number;
};

const settledAsk = (answer: number): ChanceAsk => ({ jobs: [], combine: () => answer });

export function candidateChanceAsk(candidate: RuneCandidate, threshold: number): ChanceAsk {
  if (threshold === Number.NEGATIVE_INFINITY) return settledAsk(1);
  if (threshold === Number.POSITIVE_INFINITY || candidate.mainScale <= 0) return settledAsk(0);
  /* The neutral candidate is a legal choice even when craft credit is present.
     Taking the larger of the two makes considering a Gem or Grindstone incapable of
     being a penalty, while the craft-aware reading still uses the item wherever it
     wins on the realised end state. */
  const subjects = candidate.baseline === null ? [candidate] : [candidate, candidate.baseline];
  const steps = subjects.map((subject) =>
    chanceStep(subject.future, subject.scoring, threshold * subject.ceiling / subject.mainScale));
  const jobs = steps.map((step) => step.job).filter((job): job is CountingJob => job !== null);
  if (jobs.length === 0) return settledAsk(Math.max(...steps.map((step) => step.settled ?? 0)));
  return {
    jobs,
    combine(shares) {
      let best = 0;
      let at = 0;
      for (const step of steps) {
        let answer = step.settled ?? 0;
        if (step.job !== null) { answer = shares[at] ?? 0; at += 1; }
        if (answer > best) best = answer;
      }
      return Math.min(1, Math.max(0, best));
    },
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
export type { CountingJob } from './rune-power-up-outcomes';

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
  /* The chance is still the expensive half, and most builds are rejected on their
     ceiling long before anyone needs it. So it is only worked out when the caller
     says it will be used, which is what makes checking every build affordable. */
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
