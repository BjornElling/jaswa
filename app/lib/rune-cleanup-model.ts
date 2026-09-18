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
 * ## One currency
 *
 * Everything — what a role needs, what a rune brings, what a roll might add — is
 * counted in **max rolls**: how many best-possible six-star sub-property rolls a
 * quantity is worth. It is the same currency the artifact scorer already explains,
 * and it is what lets a flat stat be priced against a percent one by division
 * rather than by convention.
 *
 * ## What is measured and what is assumed
 *
 * The value a roll takes is **uniform over its range**, which is verified against
 * 1,530 measured prefixes rather than assumed (`RUNE-CANONICAL.md` §4). Which of
 * the four lines a power-up improves, and which type a new line takes, are **not
 * established by any source** and are assumed uniform. Those two assumptions are
 * named here, at the one place they are used, so nothing downstream can present
 * them as game facts.
 */
import { runeSubValue, slotAllowsSubStat } from './runes';
import type { Rune, RuneSubProperty } from './runes';
import { runeSetPieceCount } from './rune-sets';
import {
  allStatIds, mainPropertyMaximum, maximumRoll, remainingEvents, scalesWithBase,
  subPropertyRange, subPropertyTargetStat, targetStatSubProperties,
} from './rune-properties';
import type { TargetStat } from './rune-properties';
import type { ReferenceStats } from './rune-reference-stats';
import type { PresetChoice, RunePotentialPreset } from './rune-potential-presets';
import { runeMainStatIds } from './rune-potential-presets';
import { craftRollValue, craftValueRange } from './rune-craft-items';
import type { CraftRollAssumption } from './rune-craft-items';
import type { ItemGrade } from './types';

/** The eight stats a preset can aim at, in the order every table reads them. */
export const targetStats: readonly TargetStat[] = ['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc'];

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

/**
 * What one max roll of a stat is worth, in the unit that stat is counted in.
 *
 * HP, ATK and DEF are counted in percentage points of the monster's own base, so a
 * flat roll is divided by that base to get there — `ATK +20` against a base of 720
 * is 2.8 points against a percent roll's 8. The other five stats are already
 * points and are counted as they stand.
 */
function rollSize(statId: number, base: ReferenceStats): number {
  const stat = subPropertyTargetStat[statId];
  if (!stat) return 0;
  const maximum = maximumRoll(statId);
  if (!scalesWithBase(stat)) return maximum;
  const percent = targetStatSubProperties[stat].percent;
  return statId === percent ? maximum : (base[stat] > 0 ? maximum * 100 / base[stat] : 0);
}

/** The roll a whole stat is measured against: its percent line where it has one. */
function canonicalRoll(stat: TargetStat, base: ReferenceStats): number {
  const types = targetStatSubProperties[stat];
  return rollSize(types.percent ?? types.flat ?? 0, base);
}

/** A value of `statId` expressed in max rolls of the stat it contributes to. */
function inMaxRolls(statId: number, value: number, base: ReferenceStats): number {
  const stat = subPropertyTargetStat[statId];
  if (!stat) return 0;
  const size = canonicalRoll(stat, base);
  if (size <= 0) return 0;
  const inUnit = !scalesWithBase(stat) || statId === targetStatSubProperties[stat].percent
    ? value
    : (base[stat] > 0 ? value * 100 / base[stat] : 0);
  return inUnit / size;
}

/**
 * The relevant stats for each slot, and the universal six-star ceiling for that
 * slot. Targets select a direction; they do not create a per-rune quota. A stat
 * remains relevant even where the build's main stat or set bonus would already
 * cover its numeric target, because an excess on this rune can release capacity on
 * another rune in the eventual six-rune build.
 */
export type Demand = {
  /** Per slot, the positive target stats whose full contributions are relevant. */
  shares: ReadonlyMap<number, ReadonlyMap<TargetStat, number>>;
  /** The best `fill` a legal rune could reach in each slot. */
  ceilings: ReadonlyMap<number, number>;
};

/** Build-local relevant stats and the legal six-star denominator for each slot. */
export function buildDemand(
  preset: RunePotentialPreset, build: Build, base: ReferenceStats,
): Demand {
  /* The stats this role actually aims at. A stat left unset is one the role does
     not aim at (`rune-potential-presets.ts`), and a stated 0 is a target of
     nothing; both ask the runes for nothing, so both drop out here. */
  const wanted = targetStats.filter((stat) => (preset.targets[stat] ?? 0) > 0);

  /* A target belongs to every slot that can legally carry one of its effect ids.
     Its numeric height is deliberately not used as a cap (see Demand above). */
  const shares = new Map<number, Map<TargetStat, number>>([1, 2, 3, 4, 5, 6].map((slot) => [slot, new Map()]));
  for (const slot of [1, 2, 3, 4, 5, 6]) {
    const main = mainOfSlot(build, slot);
    for (const stat of wanted) {
      const types = targetStatSubProperties[stat];
      if ([types.percent, types.flat].some((statId) => statId !== undefined && statId !== main && slotAllowsSubStat(slot, statId))) {
        shares.get(slot)?.set(stat, preset.targets[stat] ?? 0);
      }
    }
  }

  const ceilings = new Map<number, number>();
  for (const slot of [1, 2, 3, 4, 5, 6]) {
    ceilings.set(slot, slotCeiling(shares.get(slot) ?? new Map(), slot, mainOfSlot(build, slot), base));
  }
  return { shares, ceilings };
}

/**
 * The best `fill` any legal rune in this slot could reach — the denominator that
 * makes a perfect rune read 100 %.
 *
 * The scale is the best ordinary six-star rune, even when the candidate has fewer
 * stars. That is what keeps a perfect 4★ rune below a perfect 6★ rune on one
 * scale. With uncapped contributions the optimal legal layout is five rolls on
 * the strongest sub property, three on the next and a prefix on a third property.
 * Prefix and sub properties cannot duplicate an effect id.
 */
function slotCeiling(
  shares: ReadonlyMap<TargetStat, number>, slot: number, main: number, base: ReferenceStats,
): number {
  const legal = allStatIds
    .filter((statId) => statId !== main && slotAllowsSubStat(slot, statId))
    .filter((statId) => {
      const stat = subPropertyTargetStat[statId];
      return stat !== undefined && shares.has(stat);
    })
    .map((statId) => inMaxRolls(statId, maximumRoll(statId, 6), base));
  if (legal.length === 0) return 0;
  legal.sort((a, b) => b - a);
  return (legal[0] ?? 0) * 5 + (legal[1] ?? 0) * 3 + (legal[2] ?? 0);
}

/**
 * The value a supply contributes to a role.
 *
 * A target is a direction, not a local cap. A 21 SPD rune remains better than a
 * 17 SPD rune because the excess lets another slot spend its rolls elsewhere. The
 * role's map therefore selects relevant stats but never truncates their value.
 */
function fillOf(supply: ReadonlyMap<TargetStat, number>, shares: ReadonlyMap<TargetStat, number>): number {
  let fill = 0;
  for (const stat of shares.keys()) fill += supply.get(stat) ?? 0;
  return fill;
}

export type RuneOutcome = {
  /** `0`–`1`: the best legal end state, against the best a rune in this slot could be. */
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

/**
 * One rune against one build of one preset.
 *
 * `threshold` is the Max value the rune has to reach, which is what the chance is
 * the chance *of*. It is passed in rather than read from a setting because this
 * module decides nothing about policy — `rune-cleanup-advice.ts` does that.
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
  /* A rune whose main property is not the one this build asks for is not a rune
     this build can use at all — it is a different build's rune. */
  if (mainOfSlot(build, rune.slot) !== rune.mainStatId && build.mains[rune.slot as 2 | 4 | 6] !== 0) return null;

  const { shares, ceilings } = buildDemand(preset, build, base);
  const slotShares = shares.get(rune.slot) ?? new Map<TargetStat, number>();
  const ceiling = ceilings.get(rune.slot) ?? 0;
  if (ceiling <= 0) return null;

  const supply = projectedSupply(rune, slotShares, base, credit);

  const { adds, rolls } = remainingEvents(rune.level, rune.subProperties.length);
  const best = bestReachableFill(rune, supply, slotShares, base, adds, rolls);
  /* A main property is deterministic, but its final size depends on stars. It is
     part of a rune's potential, so a perfect 4★ rune cannot read as a perfect 6★
     rune merely because its sub properties were excellent. Ancient does not alter
     main properties. */
  const sixStarMain = mainPropertyMaximum(6, rune.mainStatId);
  const mainScale = sixStarMain > 0 ? mainPropertyMaximum(rune.stars, rune.mainStatId) / sixStarMain : 0;
  /* `best` is an upper bound over every legal remaining roll, so a threshold
     above it has an exact zero chance. Most account runes miss the quality floor;
     short-circuiting here prevents those certain losses from constructing their full
     addition-and-upgrade probability tree merely to discover that same zero. */
  const wanted = mainScale > 0 ? threshold * ceiling / mainScale : Number.POSITIVE_INFINITY;

  const setRank = rankOf(preset.sets, rune.setName);
  const mainRank: MatchRank = rune.slot === 2 || rune.slot === 4 || rune.slot === 6
    ? build.ranks[rune.slot as 2 | 4 | 6] : 'preferred';

  return {
    maxValue: Math.min(1, best / ceiling) * mainScale,
    chance: withChance && best + 1e-12 >= wanted
      ? reachChance(rune, supply, slotShares, base, wanted, adds, rolls) : 0,
    rank: worseRank(setRank, mainRank),
  };
}

/**
 * The gem and grindstone the settings credit a rune with before one is spent.
 *
 * The grind is credited as `max(existing, assumed)` rather than added to what is
 * there: a rune already ground three quarters of the way is worth exactly what an
 * unground one is worth, because the grind can always be topped up. Adding them
 * would pay a rune twice for the same line.
 *
 * The gem is greedy — the weakest line becomes the most wanted stat the rune is
 * missing. The exhaustive search over every line against every legal stat finds the
 * same answer in all but a rounding of cases, because replacing a rune's best line
 * is never right and the wanted stat is never in doubt.
 */
function supplyOf(properties: readonly RuneSubProperty[], rune: Rune, base: ReferenceStats): Map<TargetStat, number> {
  const supply = new Map<TargetStat, number>();
  const add = (statId: number, value: number) => {
    const stat = subPropertyTargetStat[statId];
    if (stat) supply.set(stat, (supply.get(stat) ?? 0) + inMaxRolls(statId, value, base));
  };
  for (const property of properties) add(property.statId, runeSubValue(property));
  if (rune.prefixStatId !== null) add(rune.prefixStatId, rune.prefixValue);
  return supply;
}

/**
 * Evaluate legal craft actions on the rune's actual lines, rather than adding an
 * imaginary number to a target stat. A Gem replaces one line, carries a grind only
 * when it keeps that exact stat, and a Grind can touch only a grindable property.
 */
function projectedSupply(
  rune: Rune, shares: ReadonlyMap<TargetStat, number>, base: ReferenceStats, credit: CraftCredit,
): Map<TargetStat, number> {
  const lineage = rune.ancient ? 'ancient' : 'standard';
  const gemOptions: RuneSubProperty[][] = [[...rune.subProperties]];
  if (credit.gem !== null && rune.level >= 12) {
    const converted = rune.subProperties.findIndex((property) => property.gemmed);
    const replaceable = converted === -1 ? rune.subProperties.map((_, at) => at) : [converted];
    for (const at of replaceable) {
      const old = rune.subProperties[at];
      const otherIds = new Set(rune.subProperties.filter((_, index) => index !== at).map((property) => property.statId));
      for (const statId of allStatIds) {
        if (statId !== old.statId && (otherIds.has(statId) || statId === rune.mainStatId || statId === rune.prefixStatId
          || !slotAllowsSubStat(rune.slot, statId))) continue;
        const range = craftValueRange('gem', lineage, statId, credit.gemGrade);
        if (!range) continue;
        const properties = [...rune.subProperties];
        properties[at] = {
          statId, value: craftRollValue(range, credit.gem), gemmed: true,
          /* Com2uS preserves a grind only when the Gem keeps the same property. */
          grind: statId === old.statId ? old.grind : 0,
        };
        gemOptions.push(properties);
      }
    }
  }

  let winner = gemOptions[0];
  let best = fillOf(supplyOf(winner, rune, base), shares);
  for (const gemmed of gemOptions) {
    const grindOptions: RuneSubProperty[][] = [gemmed];
    if (credit.grind !== null) for (let at = 0; at < gemmed.length; at += 1) {
      const property = gemmed[at];
      const range = craftValueRange('grindstone', lineage, property.statId, credit.grindGrade);
      if (!range) continue;
      const assumed = craftRollValue(range, credit.grind);
      if (assumed <= property.grind) continue;
      const properties = [...gemmed];
      properties[at] = { ...property, grind: assumed };
      grindOptions.push(properties);
    }
    for (const option of grindOptions) {
      const value = fillOf(supplyOf(option, rune, base), shares);
      if (value > best) { best = value; winner = option; }
    }
  }
  return supplyOf(winner, rune, base);
}

/**
 * The best `fill` this rune can still reach.
 *
 * **An improvement can only land on a line the rune already has.** That restriction
 * is the whole reason this function is not a free greedy over every wanted stat,
 * and leaving it out is what made the first draft report a 68 % ceiling beside a
 * 0 % chance: the ceiling let an upgrade invent an SPD line the rune did not own,
 * while the chance — correctly — would not. A rune with four useless lines and no
 * additions left cannot improve, however much the role wants something else.
 *
 * Additions are separate and come last (`RUNE-CANONICAL.md` §6), and each one takes
 * a distinct legal type the rune does not already hold.
 *
 * With no per-stat quota, every improvement goes to the held line whose legal
 * maximum is largest. Additions are independently chosen from legal missing effect
 * ids; an added type is by definition one no line already holds.
 */
function bestReachableFill(
  rune: Rune, supply: ReadonlyMap<TargetStat, number>, shares: ReadonlyMap<TargetStat, number>,
  base: ReferenceStats, adds: number, rolls: number,
): number {
  const held = new Map(supply);
  /* A newly added line exists before any later improvement. Evaluate every legal
     added set, then put all future upgrades on whichever line in that completed
     four-line state has the greatest real maximum. */
  const onLines = rune.subProperties.filter((property) => {
    const stat = subPropertyTargetStat[property.statId];
    return stat !== undefined && shares.has(stat);
  });
  /* Additions are distinct effect ids, but HP% and HP+ may both appear and both
     contribute. Pick the best legal real rolls, not one collapsed target stat. */
  const held2 = new Set(rune.subProperties.map((property) => property.statId));
  const addable = allStatIds
    .filter((statId) => !held2.has(statId) && statId !== rune.mainStatId
      && statId !== rune.prefixStatId && slotAllowsSubStat(rune.slot, statId))
    .filter((statId) => {
      const stat = subPropertyTargetStat[statId];
      return stat !== undefined && shares.has(stat);
    })
    .sort((left, right) => {
      const leftValue = subPropertyRange(rune.stars, left, 'upgrade')?.maximum ?? 0;
      const rightValue = subPropertyRange(rune.stars, right, 'upgrade')?.maximum ?? 0;
      return inMaxRolls(right, rightValue, base) - inMaxRolls(left, leftValue, base);
    });
  /* A line gained at +9/+12 is a new ordinary line, not an Ancient drop line. */
  const choices = combinations(addable, adds);
  let best = 0;
  for (const added of choices) {
    const candidate = new Map(held);
    const candidateAdd = (statId: number, value: number) => {
      const stat = subPropertyTargetStat[statId];
      if (!stat || !shares.has(stat)) return;
      candidate.set(stat, (candidate.get(stat) ?? 0) + inMaxRolls(statId, value, base));
    };
    for (const statId of added) candidateAdd(statId, subPropertyRange(rune.stars, statId, 'initial')?.maximum ?? 0);
    const upgradeIds = [...onLines.map((property) => property.statId), ...added];
    const strongest = upgradeIds.sort((left, right) => {
      const leftValue = subPropertyRange(rune.stars, left, 'upgrade')?.maximum ?? 0;
      const rightValue = subPropertyRange(rune.stars, right, 'upgrade')?.maximum ?? 0;
      return inMaxRolls(right, rightValue, base) - inMaxRolls(left, leftValue, base);
    })[0];
    if (strongest !== undefined) for (let at = 0; at < rolls; at += 1) {
      candidateAdd(strongest, subPropertyRange(rune.stars, strongest, 'upgrade')?.maximum ?? 0);
    }
    best = Math.max(best, fillOf(candidate, shares));
  }
  return best;
}

/**
 * Every way `events` upgrades can be split across `lines` lines — the compositions
 * of `events` into `lines` non-negative parts, with the multinomial weight of each.
 *
 * This exists because a stat's need can only be filled once. Two upgrades landing
 * on the same line together close at most what that line still needs, and treating
 * each upgrade as an independent draw credits the same shortfall twice over. So the
 * split has to be enumerated first and the cap applied to each line's *total*.
 * Four events across four lines is 35 splits, which is nothing.
 */
function compositions(events: number, lines: number): Array<{ counts: number[]; weight: number }> {
  const out: Array<{ counts: number[]; weight: number }> = [];
  const counts = new Array<number>(lines).fill(0);
  const factorial = (n: number) => { let f = 1; for (let at = 2; at <= n; at += 1) f *= at; return f; };
  const walk = (at: number, left: number) => {
    if (at === lines - 1) {
      counts[at] = left;
      const ways = factorial(events) / counts.reduce((p, c) => p * factorial(c), 1);
      out.push({ counts: [...counts], weight: ways / lines ** events });
      return;
    }
    for (let take = 0; take <= left; take += 1) { counts[at] = take; walk(at + 1, left - take); }
    counts[at] = 0;
  };
  if (lines === 0) return events === 0 ? [{ counts: [], weight: 1 }] : [];
  walk(0, events);
  return out;
}

/** The exact distribution of `n` uniform rolls of one stat. */
type Distribution = Map<number, number>;

/* The exact same line distribution recurs across builds, presets and addition
   branches. Cache only immutable probability maps; callers never mutate them. This
   keeps exact enumeration practical for a large synthetic population without
   replacing it with a coarse approximation. */
const lineDistributionCache = new Map<string, Distribution>();

/**
 * A distribution is keyed by whole units of 10⁻¹² max rolls, as an integer.
 *
 * The key exists because two arithmetically equal sums must land on one entry,
 * and a double does not guarantee that. Quantising to an integer does — and it
 * quantises **once**, where a single roll's contribution is first converted,
 * rather than at every step of every convolution. A sum of two keys is then
 * exact, so `convolveDistribution` needs no rounding in its inner loop at all.
 *
 * Unlike the former 0.025 grid this never coarsens a game outcome: the smallest
 * difference two distinct outcomes can have is one flat point of HP, about
 * 7 × 10⁻⁴ max rolls, nine orders of magnitude above one unit here.
 *
 * **The key's precision and the comparison's tolerance used to be a matched
 * pair** — a key rounded coarser than the old `+ 1e-12` epsilon silently
 * rejected the very mass the cap was collecting. `targetKey` folds that one unit
 * of slack into the target instead, once, so the two can no longer drift apart
 * and every downstream comparison is a plain integer `>=`.
 *
 * Keys stay exact while a quantity is under `Number.MAX_SAFE_INTEGER / SCALE`,
 * about 9,007 max rolls. A slot ceiling is nine — five rolls on the strongest
 * legal line, three on the next and a prefix — so there are three orders of
 * magnitude of headroom. `reachChance` asserts it rather than trusting it.
 */
const SCALE = 1e12;
const probabilityKey = (value: number): number => Math.round(value * SCALE);
/* `gain + 1e-12 >= gap` becomes `gainKey >= targetKey(gap)`: the same one-unit
   slack, applied to the target once instead of at every comparison. */
const targetKey = (value: number): number => Math.round(value * SCALE) - 1;

function convolveDistribution(left: Distribution, right: Distribution, cap = Number.POSITIVE_INFINITY): Distribution {
  const out: Distribution = new Map();
  for (const [a, leftWeight] of left) for (const [b, rightWeight] of right) {
    const sum = a + b;
    const key = sum < cap ? sum : cap;
    out.set(key, (out.get(key) ?? 0) + leftWeight * rightWeight);
  }
  return out;
}

/** The exact distribution of `n` future rolls of one property. */
function lineDistribution(
  statId: number, n: number, base: ReferenceStats, stars: number, kind: 'initial' | 'upgrade' = 'upgrade',
): Distribution {
  const cacheKey = `${statId}/${n}/${stars}/${kind}/${base.hp}/${base.atk}/${base.def}`;
  const cached = lineDistributionCache.get(cacheKey);
  if (cached) return cached;
  if (n === 0) return new Map([[0, 1]]);
  /* New lines added while powering up use the ordinary initial table. An Ancient
     initial value is the value it dropped with, not a bonus applied at +9/+12. */
  const range = subPropertyRange(stars, statId, kind);
  if (!range) return new Map([[0, 1]]);
  const values = range.maximum - range.minimum + 1;
  let total: Distribution = new Map([[0, 1]]);
  const one: Distribution = new Map();
  for (let value = range.minimum; value <= range.maximum; value += 1) {
    const key = probabilityKey(inMaxRolls(statId, value, base));
    one.set(key, (one.get(key) ?? 0) + 1 / values);
  }
  for (let step = 0; step < n; step += 1) {
    total = convolveDistribution(total, one);
  }
  lineDistributionCache.set(cacheKey, total);
  return total;
}

/** Every unordered draw without replacement. Each has equal probability. */
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
 * The chance the rune's realised `fill` reaches `wanted` by +12.
 *
 * Additions come first, so later improvements choose among the completed set of
 * four lines. Each legal added set and each subsequent upgrade split is enumerated.
 * A line's contributions are summed without a target cap.
 *
 * **Two assumptions live here and nowhere else.** Which of the lines an improvement
 * lands on, and which type a new line takes, are uniform. Neither is established by
 * any source (`RUNE-CANONICAL.md` §7); the roll's *value* being uniform is measured,
 * and is the third leg this stands on. `verify:rune-cleanup-calibration` holds the
 * whole thing to a Monte Carlo written from the game's loop rather than from here.
 */
function reachChance(
  rune: Rune, supply: ReadonlyMap<TargetStat, number>, shares: ReadonlyMap<TargetStat, number>,
  base: ReferenceStats, wanted: number, adds: number, rolls: number,
): number {
  const have = fillOf(supply, shares);
  const gap = wanted - have;
  if (gap <= 0) return 1;
  if (adds + rolls === 0) return 0;
  /* Everything below this line is integer key space. A gap beyond the exact
     range of the key scale would silently start losing units, so it fails
     loudly instead — a slot ceiling is three orders of magnitude below it. */
  const gapKey = targetKey(gap);
  if (!Number.isSafeInteger(gapKey)) {
    throw new Error(`Rune Clean-up: a gap of ${gap} max rolls exceeds the exact range of the probability key.`);
  }

  const lines = rune.subProperties.map((property) => property.statId);
  const held = new Set(lines);
  const missing = allStatIds.filter((statId) => !held.has(statId)
    && statId !== rune.mainStatId && statId !== rune.prefixStatId && slotAllowsSubStat(rune.slot, statId));

  const additionChoices = combinations(missing, adds);
  if (additionChoices.length === 0) return 0;
  const splits = compositions(rolls, lines.length + adds);
  let chance = 0;

  /* A branch is identified by the upgrade allocation and the unordered, legal
     set of new properties. A target is never capped: surplus SPD, Accuracy or any
     other wanted stat remains useful because it frees another rune to cover a
     different need. */
  for (const split of splits) for (const added of additionChoices) {
    const terms: Array<{ statId: number; count: number; kind: 'initial' | 'upgrade' }> = [];
    const add = (statId: number, count: number, kind: 'initial' | 'upgrade') => {
      const stat = subPropertyTargetStat[statId];
      if (!stat || count === 0 || !shares.has(stat)) return;
      terms.push({ statId, count, kind });
    };
    for (let at = 0; at < lines.length; at += 1) add(lines[at], split.counts[at] ?? 0, 'upgrade');
    for (let at = 0; at < added.length; at += 1) {
      const statId = added[at];
      const upgradeCount = split.counts[lines.length + at] ?? 0;
      /* An added line has one initial roll, then may receive later upgrades. */
      add(statId, 1, 'initial');
      add(statId, upgradeCount, 'upgrade');
    }

    const branchWeight = split.weight / additionChoices.length;
    /* A branch's roll ranges bound its gain before any distributions are built.
       In a real account most addition/upgrade splits cannot make the gap, and a
       few must make it. Those are exact 0 % and 100 % answers respectively, not
       approximations, so avoid allocating convolution maps for either case. */
    let minimumGain = 0;
    let maximumGain = 0;
    for (const term of terms) {
      const range = subPropertyRange(rune.stars, term.statId, term.kind);
      if (!range) continue;
      /* Keyed rather than summed in value space, so the bound is exactly the
         extreme the convolution can actually produce rather than a double that
         rounds differently from the keys it is bounding. */
      minimumGain += term.count * probabilityKey(inMaxRolls(term.statId, range.minimum, base));
      maximumGain += term.count * probabilityKey(inMaxRolls(term.statId, range.maximum, base));
    }
    if (maximumGain < gapKey) continue;
    if (minimumGain >= gapKey) { chance += branchWeight; continue; }
    let branch: Distribution = new Map([[0, 1]]);
    for (const term of terms) branch = convolveDistribution(branch,
      lineDistribution(term.statId, term.count, base, rune.stars, term.kind), gapKey);
    for (const [gain, probability] of branch) if (gain >= gapKey) chance += branchWeight * probability;
  }
  return Math.min(1, Math.max(0, chance));
}

/** Whether a set takes four runes, which the "keep twice as many" setting reads. */
export const isFourPieceSet = (setName: string): boolean => runeSetPieceCount[setName] === 4;
