import { relicMaximumLevel, relicPowerUpRates, relicStrengthIndex } from './relic-properties';
import type { RelicSourceStat } from './relic-properties';
import type { Relic } from './relics';
import { relicSynergy, relicSynergyBandOrder } from './relic-synergy';
import type { RelicSynergyBand } from './relic-synergy';

/**
 * What to do with each relic, and the values behind that verdict.
 *
 * `docs/RELIC-CANONICAL.md` §7 and §8 own this. One recursion answers every
 * question the page asks. The verdict itself uses the next attempt's exact
 * game chance, adjusted by the one account-wide synergy judgement.
 */

/**
 * The chance a power-up succeeds at each level, `+0` through `+14`.
 *
 * `relicPowerUpRates` in `relic-properties.ts` is the game's published table and
 * the default everywhere. The recursions still take the curve as an argument so
 * a check can drive them with a different one — `verify:relic-maths` does — and
 * so a future change to the game's own figures moves fifteen numbers and
 * nothing else.
 */
export type RelicSuccessRates = readonly number[];

/**
 * The chance a relic ever reaches `target`.
 *
 * An attempt has two outcomes and only two: it succeeds and the level goes up,
 * or it fails and a durability goes down. So with `p(l)` the success chance at
 * level `l`,
 *
 * ```
 * P(target, d) = 1                                  already there
 * P(l, 0)      = 0            for l < target        no attempts left, ever
 * P(l, d)      = p(l)·P(l + 1, d) + (1 − p(l))·P(l, d − 1)
 * ```
 *
 * That recursion is the whole calculation, and it is exact — not an
 * approximation of one. The closed form is a sum over every way to distribute
 * at most `d − 1` failures across the remaining levels, which agrees with it
 * term for term and is far easier to get wrong; the table below is also the
 * form that keeps working if the game ever changes the ceiling or the
 * durability a relic starts with.
 *
 * Filled in ascending durability, and within a durability from `target`
 * downwards, so every cell it reads has already been written.
 */
export function relicReachChance(
  level: number, durability: number, target: number, rates: RelicSuccessRates = relicPowerUpRates,
): number {
  if (level >= target) return 1;
  if (durability <= 0) return 0;
  let spent: number[] = new Array(target + 1).fill(0);
  spent[target] = 1;
  let row = spent;
  for (let left = 1; left <= durability; left += 1) {
    row = new Array(target + 1).fill(0);
    row[target] = 1;
    for (let from = target - 1; from >= level; from -= 1) {
      const success = rates[from] ?? 0;
      row[from] = success * row[from + 1] + (1 - success) * spent[from];
    }
    spent = row;
  }
  return row[level];
}

/**
 * What the relic is expected to be worth when it finally stops, as a fraction of
 * a finished one.
 *
 * The same recursion, with the one boundary that `relicReachChance` gets wrong
 * for this question changed. There, a relic that runs out of durability below
 * the ceiling is worth nothing, because it never reached the target. Here it is
 * worth exactly what it became: `3 + level` of a finished relic's 18 points of
 * main property.
 *
 * ```
 * V(15, d) = 1
 * V(l, 0)  = relicStrengthIndex(l, source)
 * V(l, d)  = p(l)·V(l + 1, d) + (1 − p(l))·V(l, d − 1)
 * ```
 *
 * The stopped-relic boundary is where the source stat enters. A relic's two
 * halves grow at different rates — the main property by 6 over the fifteen
 * levels, a unique property reading ATK, DEF or MAX HP by 5, one reading SPD by
 * only 3 — so what a stopped relic is worth depends on which stat its unique
 * property reads. `relic-properties.ts` owns that index.
 *
 * That difference is the whole reason two runs are needed. `P` answers `0` for
 * any relic that runs out of durability on the way, and an exceptional `+12`
 * with nothing left to spend is one of the best things an account can own — so
 * a model that judged on `P` alone would sell it. `V` reads it at 75 % of a
 * finished relic instead, and `V(l, d) − V(l, 0)` is what the power-up bar is
 * read from: the published rates (`RELIC-CANONICAL.md` §7.4) leave `P` near
 * zero for everything, so it separates nothing.
 */
export function relicExpectedStrength(
  level: number, durability: number, source: RelicSourceStat,
  rates: RelicSuccessRates = relicPowerUpRates, mainShare?: number,
): number {
  let spent: number[] = Array.from(
    { length: relicMaximumLevel + 1 }, (_, at) => relicStrengthIndex(at, source, mainShare),
  );
  let row = spent;
  for (let left = 1; left <= durability; left += 1) {
    row = new Array(relicMaximumLevel + 1).fill(0);
    row[relicMaximumLevel] = 1;
    for (let from = relicMaximumLevel - 1; from >= 0; from -= 1) {
      const success = rates[from] ?? 0;
      row[from] = success * row[from + 1] + (1 - success) * spent[from];
    }
    spent = row;
  }
  return row[level];
}

/**
 * The level the relic is expected to stop at, as the mean of the landing
 * distribution. It cannot be read back off `V` any more: the strength index is
 * no longer linear in the level, so inverting it would answer a different
 * question.
 */
export function relicExpectedLevel(chances: readonly number[]): number {
  return chances.reduce((mean, chance, at) => mean + chance * at, 0);
}

/**
 * Where the relic ends up, level by level: the chance it comes to rest at each
 * of `+0` through `+15`.
 *
 * The same recursion a third time, now carrying a whole distribution instead of
 * a single number. A relic stops in exactly one of two ways, which are the two
 * boundaries:
 *
 * ```
 * D(15, d) = all of the mass on +15                    finished
 * D(l, 0)  = all of the mass on +l                     stopped where it stands
 * D(l, d)  = p(l)·D(l + 1, d) + (1 − p(l))·D(l, d − 1)
 * ```
 *
 * `P` and `V` are both readings of this distribution — `P` is its mass on `+15`
 * and `V` its mean — and `verify:relic-maths` holds all three to each other.
 * They are still computed separately because each is a scalar recursion and
 * cheaper, and because two recursions written from different boundaries
 * agreeing is a check worth having.
 */
export function relicFinalLevelChances(
  level: number, durability: number, rates: RelicSuccessRates = relicPowerUpRates,
): readonly number[] {
  const size = relicMaximumLevel + 1;
  const restingOn = (at: number) => {
    const mass = new Array<number>(size).fill(0);
    mass[at] = 1;
    return mass;
  };
  let spent: number[][] = Array.from({ length: size }, (_, at) => restingOn(at));
  let rows = spent;
  for (let left = 1; left <= durability; left += 1) {
    rows = new Array<number[]>(size);
    rows[relicMaximumLevel] = restingOn(relicMaximumLevel);
    for (let from = relicMaximumLevel - 1; from >= 0; from -= 1) {
      const success = rates[from] ?? 0;
      const climbed = rows[from + 1];
      const stalled = spent[from];
      rows[from] = climbed.map((chance, at) => success * chance + (1 - success) * stalled[at]);
    }
    spent = rows;
  }
  return rows[level];
}

export type RelicLanding = {
  /** The level the relic lands on or above at least half the time. */
  level: number;
  /** The chance of landing at least there — at least a half, by construction. */
  chance: number;
  /** The single likeliest landing level, and its own chance. */
  likeliest: { level: number; chance: number };
};

/**
 * Where the relic comes to rest, read two ways.
 *
 * `likeliest` is the distribution's **mode** — the single outcome with the most
 * mass on it. It is the literal answer to "which level is it most likely to
 * land on", and it is a poor column on its own: for any relic with durability
 * left it is `+15`, because `+15` absorbs every path that gets there while the
 * fourteen intermediate levels split what is left between them. Its probability
 * is then exactly `P(l, d)`, which the table already shows one column earlier.
 *
 * `level` is the **median**, and it is what the table prints: the level the
 * relic reaches or beats half the time. It answers the same question without
 * collapsing — a `+9` with two attempts reads `+14`, a fresh relic with three
 * reads `+10`, a spent one reads where it stands — and it stays a whole level,
 * which a mean does not. `chance` travels with it because a median is a
 * statement about a tail, and the tail is never exactly a half.
 */
export function relicLanding(chances: readonly number[]): RelicLanding {
  let likeliestLevel = 0;
  let likeliestChance = -1;
  for (let at = 0; at < chances.length; at += 1) {
    /* A tie goes to the lower level: two equally likely outcomes are not a
       reason to report the more flattering one. */
    if (chances[at] > likeliestChance) {
      likeliestChance = chances[at];
      likeliestLevel = at;
    }
  }
  /* Accumulated from the top down, so the first level whose tail reaches a half
     is the highest level the relic meets or beats half the time. */
  let tail = 0;
  let level = 0;
  let chance = 1;
  for (let at = chances.length - 1; at >= 0; at -= 1) {
    tail += chances[at];
    level = at;
    chance = tail;
    if (tail >= 0.5) break;
  }
  return { level, chance, likeliest: { level: likeliestLevel, chance: Math.max(likeliestChance, 0) } };
}

/**
 * What a band of fit is worth, as a multiplier.
 *
 * The multiplier makes the one synergy judgement matter without pretending
 * that the ordinal bands are measured utilities. Applied to a chance it creates
 * a decision score, not another probability — scores above 100 % are expected.
 */
export const relicSynergyWeights: Record<RelicSynergyBand, number> = {
  exceptional: 4,
  strong: 2,
  neutral: 1,
  weak: 1 / 2,
  poor: 1 / 4,
};

/** The user's stone selectivity, `1` cautious to `5` bold. */
export type RelicInvestmentSelectivity = 1 | 2 | 3 | 4 | 5;

export const relicInvestmentSelectivityLevels: readonly RelicInvestmentSelectivity[] = [1, 2, 3, 4, 5];

export const isRelicInvestmentSelectivity = (value: unknown): value is RelicInvestmentSelectivity =>
  typeof value === 'number' && relicInvestmentSelectivityLevels.includes(value as RelicInvestmentSelectivity);

/**
 * The score threshold the slider chooses, as a percentage. It controls how
 * selective the player is about stones; it is not a measure of statistical
 * risk, which is already the game's success chance.
 */
export const relicInvestmentThresholds: Record<RelicInvestmentSelectivity, number> = {
  1: 180,
  2: 120,
  3: 80,
  4: 50,
  5: 20,
};

/** The same control also gates the minimum synergy band that may be invested. */
export const relicMinimumSynergyBands: Record<RelicInvestmentSelectivity, RelicSynergyBand> = {
  1: 'exceptional',
  2: 'strong',
  3: 'neutral',
  4: 'weak',
  5: 'poor',
};

export type RelicVerdict = 'power-up' | 'keep' | 'sell';

export type RelicAdvice = {
  verdict: RelicVerdict;
  /** The short chance or status shown below the verdict in the table. */
  reason: string;
  /** `P(l, d)` — the chance this relic ever reaches `+15`. Near zero for most. */
  reachChance: number;
  /** Levels the relic is expected to gain before its durability runs out. */
  expectedGain: number;
  /** The chance of the next level-up attempt succeeding. */
  nextChance: number;
  /** `100 × synergy multiplier × chance`: a decision score, not a probability. */
  investmentScore: number;
  /** The level the relic is expected to stop at, as a mean. */
  expectedLevel: number;
  /** Where the relic comes to rest: the median level, and the mode beside it. */
  landing: RelicLanding;
  /** A strictly higher same-pair copy this relic must pass, or `null`. */
  supersededBy: Relic | null;
  /** `P(l, d, higher copy's level + 1)`, or `null` when there is no such copy. */
  overtakeChance: number | null;
};

const pairKey = (relic: Relic) => `${relic.mainProperty}:${relic.unique.definition.id}`;

const percent = (fraction: number) => {
  const value = fraction * 100;
  if (value >= 10 || Number.isInteger(value)) return `${Math.round(value)}%`;
  if (value >= 1) return `${value.toFixed(1).replace(/\.0$/, '')}%`;
  return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
};
const investmentScore = (chance: number, weight: number) => 100 * chance * weight;
const nextChance = (relic: Relic, rates: RelicSuccessRates) =>
  relic.level >= relicMaximumLevel || relic.durability === 0 ? 0 : (rates[relic.level] ?? 0);

/**
 * The whole account's advice at once, because a verdict on one relic depends on
 * which other relics the account holds.
 */
export function relicAdvice(
  relics: readonly Relic[], selectivity: RelicInvestmentSelectivity, rates: RelicSuccessRates = relicPowerUpRates,
): Map<string, RelicAdvice> {
  const threshold = relicInvestmentThresholds[selectivity];
  const minimumBand = relicMinimumSynergyBands[selectivity];
  const pairs = new Map<string, Relic[]>();
  for (const relic of relics) {
    const key = pairKey(relic);
    const group = pairs.get(key);
    if (group) group.push(relic);
    else pairs.set(key, [relic]);
  }
  const advice = new Map<string, RelicAdvice>();
  for (const relic of relics) {
    const weight = relicSynergyWeights[relicSynergy(relic.mainProperty, relic.unique.definition.id)];
    const band = relicSynergy(relic.mainProperty, relic.unique.definition.id);
    const reachChance = relicReachChance(relic.level, relic.durability, relicMaximumLevel, rates);
    const chances = relicFinalLevelChances(relic.level, relic.durability, rates);
    const higher = (pairs.get(pairKey(relic)) ?? []).find((candidate) => candidate.level > relic.level) ?? null;
    /* Measured against the standing copy's *present* level rather than its own
       projection. The question is whether to spend stones on the challenger at
       all, and holding it to a level the incumbent has not reached yet would
       answer a different one. */
    const overtakeChance = higher === null
      ? null
      : relicReachChance(relic.level, relic.durability, higher.level + 1, rates);

    const chance = nextChance(relic, rates);
    const score = investmentScore(chance, weight);
    advice.set(relic.id, {
      ...decide({ weight, chance, score, overtakeChance, higher, relic, threshold, band, minimumBand }),
      reachChance,
      expectedGain: relicExpectedLevel(chances) - relic.level,
      nextChance: chance,
      investmentScore: score,
      expectedLevel: relicExpectedLevel(chances),
      landing: relicLanding(chances),
      supersededBy: higher,
      overtakeChance,
    });
  }
  return advice;
}

/**
 * The decision, in the order the rules outrank each other.
 *
 * The next-attempt chance is exact: with durability left, reaching `+l + 1` is
 * precisely the game's published rate at `l`. The synergy multiplier turns it
 * into a score for choosing where scarce stones go; it must not be described as
 * a probability after that multiplication.
 */
function decide({ weight, chance, score, overtakeChance, higher, relic, threshold, band, minimumBand }: {
  weight: number;
  chance: number;
  score: number;
  overtakeChance: number | null;
  higher: Relic | null;
  relic: Relic;
  threshold: number;
  band: RelicSynergyBand;
  minimumBand: RelicSynergyBand;
}): { verdict: RelicVerdict; reason: string } {
  if (relic.level >= relicMaximumLevel) return { verdict: 'keep', reason: 'Cannot power up.' };
  if (relic.durability === 0) {
    if (higher !== null) return { verdict: 'sell', reason: `No power-up; +${higher.level} higher.` };
    return { verdict: 'keep', reason: 'Cannot power up.' };
  }
  if (relicSynergyBandOrder.indexOf(band) > relicSynergyBandOrder.indexOf(minimumBand)) {
    return { verdict: 'sell', reason: 'Synergy < threshold.' };
  }
  if (relic.level < 3) return { verdict: 'power-up', reason: `Free +1: ${percent(chance)}` };

  if (higher !== null) {
    const overtakeScore = investmentScore(overtakeChance ?? 0, weight);
    const working = `Beat +${higher.level}: ${percent(overtakeChance ?? 0)}`;
    if (overtakeScore >= threshold) return { verdict: 'power-up', reason: working };
    return { verdict: 'sell', reason: working };
  }

  const working = `Next +1: ${percent(chance)}`;
  if (score >= threshold) return { verdict: 'power-up', reason: working };
  return { verdict: 'keep', reason: working };
}

export const relicVerdictOrder: readonly RelicVerdict[] = ['power-up', 'keep', 'sell'];

export const relicVerdictLabels: Record<RelicVerdict, string> = {
  'power-up': 'Power up',
  keep: 'Keep',
  sell: 'Sell',
};
