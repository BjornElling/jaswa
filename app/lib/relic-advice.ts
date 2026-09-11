import { relicMainPercent, relicMaximumDurability, relicMaximumLevel } from './relic-properties';
import type { Relic } from './relics';
import { relicSynergy } from './relic-synergy';
import type { RelicSynergy } from './relic-synergy';

/**
 * What to do with each relic, and the arithmetic behind it.
 *
 * `docs/RELIC-CANONICAL.md` §6 and §7 own this. Three facts drive every verdict
 * and nothing else does: how well the relic's two halves fit each other, how
 * much strength it can still gain before its durability runs out, and whether
 * the account already holds a better copy of the same pair.
 */

/**
 * How often a power-up succeeds, estimated from the account's own relics.
 *
 * The game does not publish the rate and JASWA will not invent one. It does not
 * have to: every relic is a complete record of its own attempts. Its level is
 * the number that succeeded and the durability it has spent is the number that
 * failed, so the account carries the evidence in plain sight.
 *
 * The estimate is the mean of a Beta posterior on a uniform prior, so an
 * account with no history reads an even chance rather than a division by zero,
 * and one attempt does not move the answer to certainty. It pools every level,
 * which the game almost certainly does not — a relic near the ceiling is surely
 * harder to push than one at `+0` — and `RELIC-CANONICAL.md` §7 records that
 * simplification and what would replace it.
 */
export type RelicPowerUpChance = {
  /** Levels gained across the account. */
  successes: number;
  /** Durability spent across the account. */
  failures: number;
  /** Posterior mean, strictly between 0 and 1. */
  chance: number;
};

export function relicPowerUpChance(relics: readonly Relic[]): RelicPowerUpChance {
  let successes = 0;
  let failures = 0;
  for (const relic of relics) {
    successes += relic.level;
    failures += relicMaximumDurability - relic.durability;
  }
  return { successes, failures, chance: (successes + 1) / (successes + failures + 2) };
}

/**
 * The chance of gaining at least `levels` more before durability runs out.
 *
 * A power-up either raises the level or spends a durability, so the number of
 * successes a relic still has in it is the number of successes before its
 * `durability`-th failure: a negative binomial. With at most three failures and
 * fifteen levels the sum is short enough to take directly, which keeps the
 * arithmetic exact and readable instead of hiding it in an incomplete beta.
 */
export function relicGainChance(levels: number, durability: number, chance: number): number {
  if (levels <= 0) return 1;
  if (durability <= 0) return 0;
  /* Certainty at either end would otherwise divide by zero or loop forever. */
  if (chance >= 1) return 1;
  if (chance <= 0) return 0;
  /* P(X = j) = C(j + d - 1, j) q^j (1 - q)^d, accumulated by its own ratio so
     no binomial coefficient is ever built. */
  let term = (1 - chance) ** durability;
  let below = term;
  for (let gained = 1; gained < levels; gained += 1) {
    term *= chance * (gained + durability - 1) / gained;
    below += term;
  }
  return Math.max(0, Math.min(1, 1 - below));
}

/**
 * How many more levels the relic is expected to gain, counting the ceiling.
 *
 * `E[min(X, headroom)]` as the sum of its tail probabilities, which is both the
 * shortest way to write it and the one that never overshoots `+15`.
 */
export function relicExpectedGain(relic: Relic, chance: number): number {
  const headroom = relicMaximumLevel - relic.level;
  let expected = 0;
  for (let levels = 1; levels <= headroom; levels += 1) {
    expected += relicGainChance(levels, relic.durability, chance);
  }
  return expected;
}

/** The user's appetite for spending power-up stones, `1` cautious to `5` bold. */
export type RelicRisk = 1 | 2 | 3 | 4 | 5;

export const relicRiskLevels: readonly RelicRisk[] = [1, 2, 3, 4, 5];

export const isRelicRisk = (value: unknown): value is RelicRisk =>
  typeof value === 'number' && relicRiskLevels.includes(value as RelicRisk);

/**
 * The two bars the slider moves, stated together because they are one appetite
 * read two ways: how much upside a relic must still hold before it is worth
 * stones, and how likely a second copy must be to overtake the first before it
 * is worth keeping instead of selling.
 */
const riskBars: Record<RelicRisk, { upside: number; confidence: number }> = {
  1: { upside: 0.40, confidence: 0.60 },
  2: { upside: 0.28, confidence: 0.45 },
  3: { upside: 0.18, confidence: 0.30 },
  4: { upside: 0.10, confidence: 0.20 },
  5: { upside: 0.04, confidence: 0.10 },
};

export type RelicVerdict = 'power-up' | 'keep' | 'sell';

export type RelicAdvice = {
  verdict: RelicVerdict;
  /** One short clause saying which of the rules decided it. */
  reason: string;
  /** Expected level once durability is spent, never above `+15`. */
  expectedLevel: number;
  /** Expected gain as a fraction of the relic's present strength. */
  upside: number;
  /**
   * The better copy of the same pair this relic stands behind, or `null` when
   * it is the copy to keep. Two identical relics cannot both be used — one
   * relic already covers a hundred monsters — so the second is only worth
   * holding while it can still overtake the first.
   */
  supersededBy: Relic | null;
  /** The chance this relic ends above `supersededBy`'s present level. */
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

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`;
}

/**
 * The whole account's advice at once, because a verdict on one relic depends on
 * which other relics the account holds.
 */
export function relicAdvice(
  relics: readonly Relic[], risk: RelicRisk, chance: number,
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
    const expectedGain = relicExpectedGain(relic, chance);
    const expectedLevel = relic.level + expectedGain;
    const upside = expectedGain / relicMainPercent(relic.level);
    const synergy = relicSynergy(relic.mainProperty, relic.unique.definition.id);
    const kept = pairs.get(pairKey(relic))?.[0] ?? relic;
    const superseded = kept.id === relic.id ? null : kept;
    const overtakeChance = superseded === null
      ? null
      /* Measured against the standing copy's *present* level rather than its
         own projection. The question the user is asking is whether to spend
         stones on the challenger at all, and holding it to a level the
         incumbent has not reached yet would answer a different one. */
      : relicGainChance(superseded.level - relic.level + 1, relic.durability, chance);

    advice.set(relic.id, {
      ...decide({ synergy, superseded, overtakeChance, upside, relic, bars }),
      expectedLevel,
      upside,
      supersededBy: superseded,
      overtakeChance,
    });
  }
  return advice;
}

/**
 * The decision itself, in the order the rules outrank each other.
 *
 * A poor fit is settled first, because no amount of room left makes a relic
 * whose halves pull apart worth stones — and that verdict has to reach both
 * copies of a poor pair, not just the second one. Then the second copy, because
 * no fit is good enough to make an account want two of the same relic: one
 * relic already covers a hundred monsters. What survives both is judged on how
 * much it can still gain, and only a relic that already fits well is ever sent
 * to the power-up bench, which is the rule the durability mechanic makes
 * expensive to break.
 */
function decide({ synergy, superseded, overtakeChance, upside, relic, bars }: {
  synergy: RelicSynergy | null;
  superseded: Relic | null;
  overtakeChance: number | null;
  upside: number;
  relic: Relic;
  bars: { upside: number; confidence: number };
}): { verdict: RelicVerdict; reason: string } {
  if (synergy !== null && (synergy.band === 'poor' || synergy.band === 'weak')) {
    return { verdict: 'sell', reason: 'Main and unique pull apart' };
  }
  if (superseded !== null) {
    if (overtakeChance !== null && overtakeChance >= bars.confidence) {
      return {
        verdict: 'power-up',
        reason: `${formatPercent(overtakeChance)} to pass the +${superseded.level} copy`,
      };
    }
    return { verdict: 'sell', reason: `Second copy behind a +${superseded.level}` };
  }
  if (synergy === null) return { verdict: 'keep', reason: 'Fit not judged' };
  if (synergy.band === 'neutral') return { verdict: 'keep', reason: 'Fits some monsters, not many' };
  if (relic.durability === 0) return { verdict: 'keep', reason: 'Good fit, no attempts left' };
  if (relic.level >= relicMaximumLevel) return { verdict: 'keep', reason: 'Good fit, already finished' };
  if (upside >= bars.upside) return { verdict: 'power-up', reason: `Good fit, ${formatPercent(upside)} still to gain` };
  return { verdict: 'keep', reason: 'Good fit, little left to gain' };
}

export const relicVerdictOrder: readonly RelicVerdict[] = ['power-up', 'keep', 'sell'];

export const relicVerdictLabels: Record<RelicVerdict, string> = {
  'power-up': 'Power up',
  keep: 'Keep',
  sell: 'Sell',
};
