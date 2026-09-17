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
import type { Rune } from './runes';
import { runeSetPieceCount } from './rune-sets';
import {
  allStatIds, mainPropertyAtMaximum, maximumRoll, remainingEvents, scalesWithBase,
  setBonuses, subPropertyRanges, subPropertyTargetStat, targetStatSubProperties,
} from './rune-properties';
import type { TargetStat } from './rune-properties';
import type { ReferenceStats } from './rune-reference-stats';
import type { PresetChoice, RuneMainStat, RunePotentialPreset } from './rune-potential-presets';

/** The eight stats a preset can aim at, in the order every table reads them. */
export const targetStats: readonly TargetStat[] = ['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc'];

/** How a preset's main-stat vocabulary maps onto the game's own effect ids. */
const mainStatIds: Readonly<Record<RuneMainStat, number>> = {
  'HP%': 2, 'Atk%': 4, 'Def%': 6, Spd: 8, 'CtR%': 9, 'CtD%': 10, 'Res%': 11, 'Acc%': 12,
};

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
      mains: { 2: two.stat ? mainStatIds[two.stat] : 0, 4: four.stat ? mainStatIds[four.stat] : 0, 6: six.stat ? mainStatIds[six.stat] : 0 },
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
 * What the runes of a build must find, per stat, in max rolls — and then what one
 * slot's share of it is.
 *
 * The set bonus is subtracted **before** anything is asked of the runes, because
 * judging a Fatal rune means assuming the Fatal set gets built: that is the only
 * reason to keep it. A Fatal rune is therefore asked for less ATK than an Energy
 * rune is, which is the whole point.
 *
 * The share is the demand divided by **how many slots can legally carry the stat**
 * rather than by six. That is what dissolves the slot 2/4/6 ambiguity: a rune's bar
 * never depends on what another rune turned out to be, because capacity is a fact
 * about the build and not a guess about the player.
 */
export type Demand = {
  /** Per slot, per stat, the max rolls that slot is asked to supply. */
  shares: ReadonlyMap<number, ReadonlyMap<TargetStat, number>>;
  /** The best `fill` a legal rune could reach in each slot. */
  ceilings: ReadonlyMap<number, number>;
};

/**
 * The sets a rune of this set will actually be wearing, once the build exists.
 *
 * A six-slot build is never one set. A four-piece set leaves room for exactly one
 * two-piece, and two-piece sets stack up to three times (`RUNE-CANONICAL.md` §10),
 * so a Fatal rune ends up beside a second set whether or not the preset says which.
 * Crediting only the rune's own set would hold a Fatal rune in a `Fatal / Blade`
 * role to a CRI Rate target that the Blade half is going to supply, and sell a rune
 * that is exactly right for the job.
 *
 * The partner is the best-ranked set the preset asks for that can share the build.
 * It is the set the player would actually reach for, and naming it here keeps the
 * assumption in one place instead of leaving a rune judged as though it were worn
 * alone.
 */
function buildSets(preset: RunePotentialPreset, setName: string): string[] {
  const own = runeSetPieceCount[setName] ?? 2;
  const partners = [...preset.sets.preferred, ...preset.sets.acceptable]
    .filter((name) => name !== setName && setBonuses[name] !== undefined
      /* A four-piece set leaves room for one two-piece only; a two-piece leaves
         room for either. */
      && (own === 4 ? runeSetPieceCount[name] === 2 : true));
  if (partners.length === 0) return [setName];
  /* Preferred before acceptable, and the first of those — a stable choice rather
     than the most flattering one, so the figure does not move when a preset's list
     is reordered. */
  return [setName, partners[0]];
}

function setContribution(setNames: readonly string[], stat: TargetStat, base: ReferenceStats): number {
  let total = 0;
  for (const name of setNames) {
    const bonus = setBonuses[name];
    if (!bonus || subPropertyTargetStat[bonus.statId] !== stat) continue;
    total += (bonus.percent ? base[stat] * bonus.percent / 100 : 0) + (bonus.flat ?? 0);
  }
  return total;
}

export function buildDemand(
  preset: RunePotentialPreset, build: Build, setName: string, base: ReferenceStats,
): Demand {
  /* The stats this role actually aims at. A stat left unset is one the role does
     not aim at (`rune-potential-presets.ts`), and a stated 0 is a target of
     nothing; both ask the runes for nothing, so both drop out here. */
  const wanted = targetStats.filter((stat) => (preset.targets[stat] ?? 0) > 0);

  /* Which slots may carry each stat, given the build's main stats and the slot
     bans — and what the main stats already supply. */
  const carriers = new Map<TargetStat, number[]>();
  const fromMains = new Map<TargetStat, number>();
  for (const slot of [1, 2, 3, 4, 5, 6]) {
    const main = mainOfSlot(build, slot);
    const mainStat = subPropertyTargetStat[main];
    if (mainStat) {
      const value = mainPropertyAtMaximum[main] ?? 0;
      const asUnit = !scalesWithBase(mainStat) || main === targetStatSubProperties[mainStat].percent
        ? value
        : (base[mainStat] > 0 ? value * 100 / base[mainStat] : 0);
      fromMains.set(mainStat, (fromMains.get(mainStat) ?? 0) + asUnit);
    }
    for (const stat of wanted) {
      const types = targetStatSubProperties[stat];
      const canCarry = [types.percent, types.flat].some((statId) =>
        statId !== undefined && statId !== main && slotAllowsSubStat(slot, statId));
      if (canCarry) carriers.set(stat, [...(carriers.get(stat) ?? []), slot]);
    }
  }

  const wearing = buildSets(preset, setName);
  const shares = new Map<number, Map<TargetStat, number>>([1, 2, 3, 4, 5, 6].map((slot) => [slot, new Map()]));
  for (const stat of wanted) {
    const target = preset.targets[stat] ?? 0;
    /* What the monster and its completed sets bring before a single sub property is
       counted. Percent bonuses scale the base; flat ones are added outright. */
    const need = target - base[stat] - setContribution(wearing, stat, base);
    const inUnit = scalesWithBase(stat)
      ? (base[stat] > 0 ? need * 100 / base[stat] : 0)
      : need;
    const size = canonicalRoll(stat, base);
    const afterMains = inUnit - (fromMains.get(stat) ?? 0);
    const demand = size > 0 ? Math.max(0, afterMains) / size : 0;
    const slots = carriers.get(stat) ?? [];
    if (slots.length === 0 || demand <= 0) continue;
    for (const slot of slots) shares.get(slot)?.set(stat, demand / slots.length);
  }

  const ceilings = new Map<number, number>();
  for (const slot of [1, 2, 3, 4, 5, 6]) {
    ceilings.set(slot, slotCeiling(shares.get(slot) ?? new Map(), slot, mainOfSlot(build, slot)));
  }
  return { shares, ceilings };
}

/**
 * The best `fill` any legal rune in this slot could reach — the denominator that
 * makes a perfect rune read 100 %.
 *
 * A finished rune carries eight rolls' worth of sub property (four initial, four
 * from power-ups) spread across four lines, plus a prefix worth one more. So the
 * ceiling is the best way to spend nine rolls across five legal stats, with each
 * stat capped at the share it was asked for — spending an eleventh SPD roll on a
 * role that wanted three buys nothing.
 *
 * Greedy allocation is optimal here, and not merely convenient: each stat's
 * contribution is `min(rolls, share)`, which is concave in `rolls`, so taking the
 * largest marginal gain at each step cannot be beaten.
 */
function slotCeiling(
  shares: ReadonlyMap<TargetStat, number>, slot: number, main: number,
): number {
  const legal = [...shares.entries()].filter(([stat]) => {
    const types = targetStatSubProperties[stat];
    return [types.percent, types.flat].some((statId) =>
      statId !== undefined && statId !== main && slotAllowsSubStat(slot, statId));
  });
  if (legal.length === 0) return 0;
  /* Four lines plus a prefix. A line may hold up to five rolls on a Legend rune
     (its own plus the four power-ups), which is the per-stat cap below. */
  return allocate(legal.map(([, share]) => share), 9, 5, Math.min(5, legal.length));
}

/**
 * Spend `rolls` across the stats with the largest unmet share, one roll at a time,
 * taking the best marginal gain each step. `lineCap` bounds one stat; `lines`
 * bounds how many distinct stats can be carried at once.
 */
function allocate(shares: readonly number[], rolls: number, lineCap: number, lines: number): number {
  const wanted = [...shares].sort((a, b) => b - a).slice(0, lines);
  const spent = new Array<number>(wanted.length).fill(0);
  let fill = 0;
  for (let step = 0; step < rolls; step += 1) {
    let best = -1;
    let bestGain = 0;
    for (let at = 0; at < wanted.length; at += 1) {
      if (spent[at] >= lineCap) continue;
      const gain = Math.min(spent[at] + 1, wanted[at]) - Math.min(spent[at], wanted[at]);
      if (gain > bestGain) { bestGain = gain; best = at; }
    }
    if (best === -1) break;
    spent[best] += 1;
    fill += bestGain;
  }
  return fill;
}

/** What one rune already brings, per stat, in max rolls. */
function currentSupply(rune: Rune, base: ReferenceStats): Map<TargetStat, number> {
  const supply = new Map<TargetStat, number>();
  const add = (statId: number, value: number) => {
    const stat = subPropertyTargetStat[statId];
    if (!stat) return;
    supply.set(stat, (supply.get(stat) ?? 0) + inMaxRolls(statId, value, base));
  };
  for (const property of rune.subProperties) add(property.statId, runeSubValue(property));
  if (rune.prefixStatId !== null) add(rune.prefixStatId, rune.prefixValue);
  return supply;
}

/** The `fill` a supply produces against a set of shares: each stat capped at its own. */
function fillOf(supply: ReadonlyMap<TargetStat, number>, shares: ReadonlyMap<TargetStat, number>): number {
  let fill = 0;
  for (const [stat, share] of shares) fill += Math.min(supply.get(stat) ?? 0, share);
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

/**
 * One rune against one build of one preset.
 *
 * `threshold` is the Max value the rune has to reach, which is what the chance is
 * the chance *of*. It is passed in rather than read from a setting because this
 * module decides nothing about policy — `rune-cleanup-advice.ts` does that.
 */
export function judgeAgainstBuild(
  rune: Rune, preset: RunePotentialPreset, build: Build, base: ReferenceStats,
  threshold: number, credit: { gem: number; grind: number },
  /* The chance is the expensive half — it enumerates every way the remaining
     upgrades can fall — and most builds are rejected on their ceiling long before
     anyone needs it. So it is only worked out when the caller says it will be
     used, which is what makes checking every build affordable. */
  withChance = true,
): RuneOutcome | null {
  /* A rune whose main property is not the one this build asks for is not a rune
     this build can use at all — it is a different build's rune. */
  if (mainOfSlot(build, rune.slot) !== rune.mainStatId && build.mains[rune.slot as 2 | 4 | 6] !== 0) return null;

  const { shares, ceilings } = buildDemand(preset, build, rune.setName, base);
  const slotShares = shares.get(rune.slot) ?? new Map<TargetStat, number>();
  const ceiling = ceilings.get(rune.slot) ?? 0;
  if (ceiling <= 0) return null;

  const supply = currentSupply(rune, base);
  applyCredits(rune, supply, slotShares, base, credit);

  const { adds, rolls } = remainingEvents(rune.level, rune.subProperties.length);
  const best = bestReachableFill(rune, supply, slotShares, adds, rolls);

  const setRank = rankOf(preset.sets, rune.setName);
  const mainRank: MatchRank = rune.slot === 2 || rune.slot === 4 || rune.slot === 6
    ? build.ranks[rune.slot as 2 | 4 | 6] : 'preferred';

  return {
    maxValue: Math.min(1, best / ceiling),
    chance: withChance ? reachChance(rune, supply, slotShares, base, threshold * ceiling, adds, rolls) : 0,
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
function applyCredits(
  rune: Rune, supply: Map<TargetStat, number>, shares: ReadonlyMap<TargetStat, number>,
  base: ReferenceStats, credit: { gem: number; grind: number },
): void {
  if (credit.grind > 0) {
    let bestGain = 0; let bestStat: TargetStat | null = null;
    for (const property of rune.subProperties) {
      const stat = subPropertyTargetStat[property.statId];
      if (!stat || !shares.has(stat)) continue;
      const added = Math.max(0, credit.grind - property.grind);
      const gain = inMaxRolls(property.statId, added, base);
      if (gain > bestGain) { bestGain = gain; bestStat = stat; }
    }
    if (bestStat) supply.set(bestStat, (supply.get(bestStat) ?? 0) + bestGain);
  }
  if (credit.gem > 0 && rune.level >= 12) {
    const held = new Set(rune.subProperties.map((property) => subPropertyTargetStat[property.statId]));
    let bestGain = 0; let bestStat: TargetStat | null = null;
    for (const [stat, share] of shares) {
      if (held.has(stat)) continue;
      const gain = Math.min(credit.gem, share - (supply.get(stat) ?? 0));
      if (gain > bestGain) { bestGain = gain; bestStat = stat; }
    }
    if (bestStat) supply.set(bestStat, (supply.get(bestStat) ?? 0) + bestGain);
  }
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
 * Greedy is optimal within each half: every stat's contribution is `min(rolls,
 * share)`, which is concave, so the largest marginal gain at each step cannot be
 * beaten. It stays optimal across the two halves because the additions' choices do
 * not overlap the improvements' — an added type is by definition one no line holds.
 */
function bestReachableFill(
  rune: Rune, supply: ReadonlyMap<TargetStat, number>, shares: ReadonlyMap<TargetStat, number>,
  adds: number, rolls: number,
): number {
  const held = new Map(supply);
  let fill = fillOf(held, shares);
  const spend = (choices: readonly TargetStat[], times: number) => {
    for (let step = 0; step < times; step += 1) {
      let bestGain = 0; let bestStat: TargetStat | null = null;
      for (const stat of choices) {
        const share = shares.get(stat) ?? 0;
        const have = held.get(stat) ?? 0;
        const gain = Math.min(have + 1, share) - Math.min(have, share);
        if (gain > bestGain) { bestGain = gain; bestStat = stat; }
      }
      if (!bestStat) break;
      held.set(bestStat, (held.get(bestStat) ?? 0) + 1);
      fill += bestGain;
    }
  };

  /* Improvements: the stats the rune's own lines already feed, and nothing else. */
  const onLines = [...new Set(rune.subProperties
    .map((property) => subPropertyTargetStat[property.statId])
    .filter((stat): stat is TargetStat => stat !== undefined && shares.has(stat)))];
  spend(onLines, rolls);

  /* Additions: a legal type the rune does not hold, once each. */
  const held2 = new Set(rune.subProperties.map((property) => property.statId));
  const addable = [...new Set(allStatIds
    .filter((statId) => !held2.has(statId) && statId !== rune.mainStatId
      && statId !== rune.prefixStatId && slotAllowsSubStat(rune.slot, statId))
    .map((statId) => subPropertyTargetStat[statId])
    .filter((stat): stat is TargetStat => stat !== undefined && shares.has(stat)))];
  spend(addable, adds);

  return fill;
}

/**
 * The grid the chance distribution is carried on.
 *
 * It spans the four max rolls a rune can still gain — one per remaining event, and
 * a roll can never be worth more than one max roll — rather than a bare 0 to 1. The
 * first draft used a unit grid on the assumption that a fill was a fraction, and it
 * is not: a fill is counted in max rolls and a role wanting several of them puts a
 * slot's share well above 1. Every gap past the end of the grid read as impossible,
 * so runes with a 68 % ceiling were reported at a 0 % chance and sold.
 */
const gridStep = 0.025;
const gridSpan = 4;
const gridSize = Math.round(gridSpan / gridStep) + 1;

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

/** The distribution of `n` uniform rolls of one stat, capped at what it still needs. */
function cappedLine(statId: number, n: number, room: number, base: ReferenceStats): Float64Array<ArrayBuffer> {
  const out = new Float64Array(gridSize);
  if (n === 0 || room <= 0) { out[0] = 1; return out; }
  const range = subPropertyRanges[statId];
  if (!range) { out[0] = 1; return out; }
  const values = range.maximum - range.minimum + 1;
  /* The sum of n rolls, built up exactly, and only then capped — which is the whole
     correction. Capping each roll separately is what overstated the chance. */
  let total = new Float64Array(gridSize);
  total[0] = 1;
  for (let step = 0; step < n; step += 1) {
    const one = new Float64Array(gridSize);
    for (let value = range.minimum; value <= range.maximum; value += 1) {
      one[Math.min(gridSize - 1, Math.round(inMaxRolls(statId, value, base) / gridStep))] += 1 / values;
    }
    total = convolve(total, one);
  }
  const capAt = Math.min(gridSize - 1, Math.round(room / gridStep));
  for (let at = 0; at < gridSize; at += 1) {
    if (total[at] === 0) continue;
    out[Math.min(at, capAt)] += total[at];
  }
  return out;
}

/**
 * The chance the rune's realised `fill` reaches `wanted` by +12.
 *
 * **The shape of the calculation follows a rule of the game: improvements come
 * before additions.** A Hero rune improves at +3, +6 and +9 and only gains its
 * fourth line at +12; a Rare rune improves at +3 and +6 and gains lines at +9 and
 * +12 (`RUNE-CANONICAL.md` §6). So no improvement ever lands on a line that was
 * added later, which is what lets the two halves be worked out separately.
 *
 * For the improvements, every way they can be spread across the existing lines is
 * enumerated, and each line's rolls are **summed and only then capped** at what
 * that stat still needs. Capping each roll on its own was the error the first draft
 * made: two rolls into one line would each be credited with closing the same
 * shortfall, so the chance came out too high and a rune that should have been sold
 * read as worth rolling.
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
  /* One event can never be worth more than one max roll, so a gap wider than the
     events remaining is out of reach whatever they roll. Saying so here keeps the
     grid from having to represent it. */
  if (gap > adds + rolls) return 0;
  const needed = Math.ceil(gap / gridStep);
  if (needed >= gridSize) return 0;

  /* What each stat still needs, which is the cap every line's total is held to.
     Shared between an existing line and a later addition of the other type — HP %
     and HP + both pay into the same HP need — so it is keyed by the target stat. */
  const room = new Map<TargetStat, number>();
  for (const [stat, share] of shares) room.set(stat, Math.max(0, share - (supply.get(stat) ?? 0)));

  const lines = rune.subProperties.map((property) => property.statId);
  const held = new Set(lines);
  const missing = allStatIds.filter((statId) => !held.has(statId)
    && statId !== rune.mainStatId && statId !== rune.prefixStatId && slotAllowsSubStat(rune.slot, statId));

  /* The improvements: one distribution per way of splitting them over the lines. */
  let distribution = new Float64Array(gridSize);
  if (rolls === 0 || lines.length === 0) {
    distribution[0] = 1;
  } else {
    for (const { counts, weight } of compositions(rolls, lines.length)) {
      if (weight === 0) continue;
      let branch = new Float64Array(gridSize);
      branch[0] = 1;
      const spent = new Map<TargetStat, number>();
      for (let at = 0; at < lines.length; at += 1) {
        if (counts[at] === 0) continue;
        const stat = subPropertyTargetStat[lines[at]];
        if (!stat) continue;
        /* Two lines of the same target stat — HP % beside HP + — share one need, so
           what an earlier line already claimed is taken off this one's cap. */
        const left = (room.get(stat) ?? 0) - (spent.get(stat) ?? 0);
        branch = convolve(branch, cappedLine(lines[at], counts[at], left, base));
        spent.set(stat, (spent.get(stat) ?? 0) + left);
      }
      for (let at = 0; at < gridSize; at += 1) distribution[at] += weight * branch[at];
    }
  }

  /* The additions: each takes a distinct legal type it does not already hold, so
     they are draws without replacement. Their contributions are averaged over which
     types come up, which is exact because each new line receives exactly one roll. */
  for (let at = 0; at < adds; at += 1) {
    if (missing.length === 0) break;
    const one = new Float64Array(gridSize);
    for (const statId of missing) {
      const stat = subPropertyTargetStat[statId];
      const single = cappedLine(statId, 1, stat ? room.get(stat) ?? 0 : 0, base);
      for (let bin = 0; bin < gridSize; bin += 1) one[bin] += single[bin] / missing.length;
    }
    distribution = convolve(distribution, one);
  }

  let tail = 0;
  for (let at = needed; at < gridSize; at += 1) tail += distribution[at];
  return Math.min(1, Math.max(0, tail));
}

function convolve(left: Float64Array<ArrayBuffer>, right: Float64Array<ArrayBuffer>): Float64Array<ArrayBuffer> {
  const out = new Float64Array(gridSize);
  for (let a = 0; a < gridSize; a += 1) {
    const weight = left[a];
    if (weight === 0) continue;
    for (let b = 0; b < gridSize; b += 1) {
      const mass = right[b];
      if (mass === 0) continue;
      out[Math.min(gridSize - 1, a + b)] += weight * mass;
    }
  }
  return out;
}

/** Whether a set takes four runes, which the "keep twice as many" setting reads. */
export const isFourPieceSet = (setName: string): boolean => runeSetPieceCount[setName] === 4;
