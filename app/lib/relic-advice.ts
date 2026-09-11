import { relicMaximumLevel, relicPowerUpRates, relicStrengthIndex } from './relic-properties';
import type { RelicSourceStat } from './relic-properties';
import type { Relic } from './relics';
import { relicSynergy } from './relic-synergy';
import type { RelicSynergy, RelicSynergyBand } from './relic-synergy';

/**
 * What to do with each relic, and the arithmetic behind it.
 *
 * `docs/RELIC-CANONICAL.md` §7 and §8 own this. One recursion answers every
 * question the page asks, run three times with different boundaries, and one
 * ladder of synergy weights turns its answers into a verdict.
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
 * A ladder that mirrors itself about Neutral: ten times and five times above,
 * a fifth and a tenth below. Every band is the exact reciprocal of its opposite
 * number, so the scale says the same thing read from either end — an
 * exceptional fit is worth ten neutral ones, and a poor fit is worth a tenth of
 * one. It is the same ladder on both numbers the verdict reads.
 *
 * The spread is deliberately wide. A relic rides a hundred monsters, so the
 * difference between the right pairing and the wrong one is not a matter of
 * degree, and a ladder narrow enough to let a poor fit out-argue a good one on
 * level alone would be describing a different game.
 */
export const relicSynergyWeights: Record<RelicSynergyBand, number> = {
  exceptional: 10,
  strong: 5,
  neutral: 1,
  weak: 1 / 5,
  poor: 1 / 10,
};

/** The user's appetite for spending power-up stones, `1` cautious to `5` bold. */
export type RelicRisk = 1 | 2 | 3 | 4 | 5;

export const relicRiskLevels: readonly RelicRisk[] = [1, 2, 3, 4, 5];

export const isRelicRisk = (value: unknown): value is RelicRisk =>
  typeof value === 'number' && relicRiskLevels.includes(value as RelicRisk);

/**
 * The two bars the slider moves. Both are read against a weighted number on the
 * same 0–4 scale, so one appetite governs both questions:
 *
 * - `stones` is what `weight × (V(l, d) − V(l, 0))` must clear before a relic is
 *   worth power-up stones — the fit times what there is left to win.
 * - `hold` is what `weight × V(l, d)` must clear before a relic is worth a slot
 *   at all.
 *
 * At risk 1 only a barely-touched exceptional relic earns stones; at risk 5 a
 * weak fit with a full three attempts does.
 */
const riskBars: Record<RelicRisk, { stones: number; hold: number }> = {
  1: { stones: 2.50, hold: 0.40 },
  2: { stones: 1.60, hold: 0.33 },
  3: { stones: 1.00, hold: 0.26 },
  4: { stones: 0.50, hold: 0.19 },
  5: { stones: 0.25, hold: 0.12 },
};

export type RelicVerdict = 'power-up' | 'keep' | 'sell';

export type RelicAdvice = {
  verdict: RelicVerdict;
  /** The arithmetic that decided it, short enough for a table cell. */
  reason: string;
  /** `P(l, d)` — the chance this relic ever reaches `+15`. Near zero for most. */
  reachChance: number;
  /** Levels the relic is expected to gain before its durability runs out. */
  expectedGain: number;
  /** `weight × V(l, d)` — what the relic is worth holding, on a 0–10 scale. */
  merit: number;
  /** The level the relic is expected to stop at, as a mean. */
  expectedLevel: number;
  /** Where the relic comes to rest: the median level, and the mode beside it. */
  landing: RelicLanding;
  /**
   * The better copy of the same pair this relic stands behind, or `null` when
   * it is the copy to keep. Two identical relics cannot both be used — one
   * relic already covers a hundred monsters — so the second is only worth
   * holding while it can still overtake the first.
   */
  supersededBy: Relic | null;
  /** `P(l, d, that copy's level + 1)`, or `null` when there is no such copy. */
  overtakeChance: number | null;
};

const pairKey = (relic: Relic) => `${relic.mainProperty}:${relic.unique.definition.id}`;

/**
 * Which copy of a pair is the one to keep: the highest level, then the one with
 * the most attempts left, then the one held longest. Every step is a fact about
 * the relic rather than about the list, so the choice does not move when the
 * table is sorted.
 */
function comparePairStanding(left: Relic, right: Relic): number {
  return right.level - left.level
    || right.durability - left.durability
    || left.obtainedOrder - right.obtainedOrder;
}

const percent = (fraction: number) => `${Math.round(fraction * 100)} %`;
/* Two places below one, whole numbers above it: the weights now span a factor
   of a hundred, and four significant digits on a merit of 8 is noise. */
const score = (value: number) => value >= 1 ? value.toFixed(1) : value.toFixed(2);

/**
 * The whole account's advice at once, because a verdict on one relic depends on
 * which other relics the account holds.
 */
export function relicAdvice(
  relics: readonly Relic[], risk: RelicRisk, rates: RelicSuccessRates = relicPowerUpRates,
): Map<string, RelicAdvice> {
  const bars = riskBars[risk];
  const pairs = new Map<string, Relic[]>();
  for (const relic of relics) {
    const key = pairKey(relic);
    const group = pairs.get(key);
    if (group) group.push(relic);
    else pairs.set(key, [relic]);
  }
  for (const group of pairs.values()) group.sort(comparePairStanding);

  const advice = new Map<string, RelicAdvice>();
  for (const relic of relics) {
    const synergy = relicSynergy(relic.mainProperty, relic.unique.definition.id);
    /* An unjudged pair is neither good nor bad, so it counts once — the same
       weight a neutral fit carries — rather than being scored as a failure. */
    const weight = synergy === null ? relicSynergyWeights.neutral : relicSynergyWeights[synergy.band];
    const source = relic.unique.definition.per;
    const reachChance = relicReachChance(relic.level, relic.durability, relicMaximumLevel, rates);
    const chances = relicFinalLevelChances(relic.level, relic.durability, rates);
    const strength = relicExpectedStrength(relic.level, relic.durability, source, rates);
    /* What having durability left is worth: the expected finished strength of
       this relic, less what it would be worth if it could never be touched
       again. On the same 0–1 scale as the strength beside it, so the merit and
       the power-up bar are read off one ruler. */
    const upside = strength - relicStrengthIndex(relic.level, source);
    const kept = pairs.get(pairKey(relic))?.[0] ?? relic;
    const superseded = kept.id === relic.id ? null : kept;
    /* Measured against the standing copy's *present* level rather than its own
       projection. The question is whether to spend stones on the challenger at
       all, and holding it to a level the incumbent has not reached yet would
       answer a different one. */
    const overtakeChance = superseded === null
      ? null
      : relicReachChance(relic.level, relic.durability, superseded.level + 1, rates);

    const merit = weight * strength;
    advice.set(relic.id, {
      ...decide({ synergy, weight, merit, upside, overtakeChance, superseded, relic, bars }),
      reachChance,
      expectedGain: relicExpectedLevel(chances) - relic.level,
      merit,
      expectedLevel: relicExpectedLevel(chances),
      landing: relicLanding(chances),
      supersededBy: superseded,
      overtakeChance,
    });
  }
  return advice;
}

/**
 * The decision, in the order the rules outrank each other.
 *
 * Everything below is `weight × a probability` or `weight × a strength`, read
 * against a bar on the same scale. Nothing else enters, and no band is special
 * cased: a poor fit sells because a quarter of its finished strength cannot
 * clear the holding bar, not because a rule says poor fits sell.
 */
function decide({ synergy, weight, merit, upside, overtakeChance, superseded, relic, bars }: {
  synergy: RelicSynergy | null;
  weight: number;
  merit: number;
  upside: number;
  overtakeChance: number | null;
  superseded: Relic | null;
  relic: Relic;
  bars: { stones: number; hold: number };
}): { verdict: RelicVerdict; reason: string } {
  if (synergy === null) return { verdict: 'keep', reason: 'Fit not judged' };

  /* A second copy is settled before anything else that could keep it, because
     no fit is good enough to make an account want two of the same relic: one
     already covers a hundred monsters. It earns stones on the same bar every
     other relic does, measured against passing the copy in front of it. */
  if (superseded !== null) {
    const weighted = weight * (overtakeChance ?? 0);
    if (weighted >= bars.stones) {
      return {
        verdict: 'power-up',
        reason: `${score(weight)} × ${percent(overtakeChance ?? 0)} past +${superseded.level} = ${score(weighted)}`,
      };
    }
    return { verdict: 'sell', reason: `Second copy; ${score(weighted)} under ${score(bars.stones)}` };
  }

  if (merit < bars.hold) {
    return { verdict: 'sell', reason: `Merit ${score(merit)} under ${score(bars.hold)}` };
  }
  if (relic.level >= relicMaximumLevel) return { verdict: 'keep', reason: 'Finished; nothing to spend' };
  if (relic.durability === 0) return { verdict: 'keep', reason: 'No attempts left; nothing to spend' };

  const weighted = weight * upside;
  if (weighted >= bars.stones) {
    return { verdict: 'power-up', reason: `${score(weight)} × ${percent(upside)} left to win = ${score(weighted)}` };
  }
  return { verdict: 'keep', reason: `${score(weighted)} left to win, bar is ${score(bars.stones)}` };
}

export const relicVerdictOrder: readonly RelicVerdict[] = ['power-up', 'keep', 'sell'];

export const relicVerdictLabels: Record<RelicVerdict, string> = {
  'power-up': 'Power up',
  keep: 'Keep',
  sell: 'Sell',
};
