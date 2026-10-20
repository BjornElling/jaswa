import { relicMaximumLevel, relicPowerUpRates, relicStrengthIndex } from './relic-properties';
import type { RelicSourceStat } from './relic-properties';

/**
 * **The single source of truth for what a power-up attempt is likely to do.**
 *
 * Every probability the Relics page states — the chance of the next level, the
 * chance of ever reaching a target, where a relic will come to rest, what it
 * will be worth when it stops — is read from this file and computed nowhere
 * else. `docs/RELIC-CANONICAL.md` §7 owns the reasoning; this owns the
 * arithmetic.
 *
 * **Nothing outside this module may derive these quantities.** Not a component
 * multiplying two rates together for a tooltip, not a helper estimating an
 * average, not a check re-deriving a figure it wants to assert. A second
 * implementation would not merely duplicate work: it would drift, and the page
 * would then state two different chances for the same relic without either
 * being obviously wrong. Import from here, or the number does not get shown.
 * The one deliberate exception is `scripts/verify-relic-maths.mjs`, which
 * re-derives these results from independent closed forms precisely so that a
 * disagreement is caught — that is a check on this file, not a second copy of
 * it, and it is the reason the functions take `rates` as an argument.
 *
 * ## The mechanic these four functions model
 *
 * A power-up attempt has two outcomes and only two. It succeeds, and the level
 * goes up; or it fails, and one durability is spent. The level never falls and
 * durability never returns, so a relic walks a strictly one-way path through
 * `(level, durability)` and stops in exactly one of two states: it reaches the
 * `+15` ceiling, or it runs out of durability where it stands.
 *
 * Both stopping states matter and they are not interchangeable, which is why
 * there is more than one function here. A relic that halts at `+12` with nothing
 * left has failed to reach `+15` and is still one of the best things an account
 * can own.
 *
 * **Durability is a real resource, and it is counted exactly.** Every function
 * takes the attempts actually remaining and recurses down to `d = 0`; none of
 * them assumes three, and none of them treats an attempt as unlimited. A relic
 * with one durability left and a relic with three are different relics facing
 * different odds, and asking with `d = 0` is always answered from where the
 * relic stands rather than from where it might have gone. `verify:relic-maths`
 * holds this to a Monte Carlo of the mechanic above, which is written from the
 * game's loop rather than from these recursions.
 *
 * Each function fills its table in ascending durability, and within one
 * durability from the top level downwards, so every cell it reads has already
 * been written. `p(l)` below is the published success rate at level `l`.
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
 * Rejects a curve that cannot be a set of per-level success chances.
 *
 * **A malformed curve used to produce a well-formed wrong answer**, which is the
 * worst way for this module to fail. Drive the recursions with a table of four
 * entries and the missing rates read back as `undefined`, which `?? 0` turned
 * into "this level never succeeds": the landing distribution still summed to 1,
 * still looked like a distribution, and put 99 % of its mass on `+4`. Nothing
 * raised. Since the whole point of taking `rates` as an argument is that a check
 * can swap the curve, a truncated or misordered table is exactly the mistake
 * that will be made, and it has to be loud.
 *
 * Checked once per call rather than per cell: the inner step runs thousands of
 * times and is the arithmetic this file exists for.
 */
function checkedRates(rates: RelicSuccessRates): RelicSuccessRates {
  if (rates.length !== relicMaximumLevel) {
    throw new RangeError(
      `A power-up curve needs one rate per level below the ceiling: expected ${relicMaximumLevel}, got ${rates.length}.`,
    );
  }
  for (let at = 0; at < rates.length; at += 1) {
    const rate = rates[at];
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new RangeError(`A power-up rate must be a chance between 0 and 1; rate[${at}] is ${rate}.`);
    }
  }
  return rates;
}

/**
 * The chance a relic ever reaches `target`.
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
 * `target` is a parameter rather than a fixed `+15` because the question the
 * duplicate gate asks is not about the ceiling: it needs the chance of reaching
 * one level above the copy the account already holds (`RELIC-CANONICAL.md`
 * §8 rule 2). The same recursion answers both.
 *
 * **A target above `+15` is unreachable, and this says so itself.** The gate
 * asks for `incumbent + 1`, which is `16` whenever the incumbent is a finished
 * copy — a real call on a real account. The answer was already `0`, but only
 * because the published table has fifteen entries and the sixteenth read back
 * `undefined`: a curve one entry longer, which `verify:relic-maths` is entitled
 * to pass, had the relic climbing to a `+16` the game has no room for. The
 * ceiling is now a stated boundary rather than an accident of an array's
 * length.
 */
export function relicReachChance(
  level: number, durability: number, target: number, rates: RelicSuccessRates = relicPowerUpRates,
): number {
  checkedRates(rates);
  if (target > relicMaximumLevel) return 0;
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
 * Where the relic comes to rest, level by level: the chance it stops at each of
 * `+0` through `+15`.
 *
 * **This is the parent distribution, and the other two readings are moments of
 * it.** A relic stops in exactly one of two ways, which are the two boundaries:
 *
 * ```
 * D(15, d) = all of the mass on +15                    finished
 * D(l, 0)  = all of the mass on +l                     stopped where it stands
 * D(l, d)  = p(l)·D(l + 1, d) + (1 − p(l))·D(l, d − 1)
 * ```
 *
 * `relicReachChance(l, d, 15)` is this distribution's mass on `+15`, and
 * `relicExpectedStrength` is its expected strength index. `verify:relic-maths`
 * holds all three to each other at every `(level, durability)` pair.
 *
 * They are still computed separately because each scalar recursion is cheaper
 * than carrying sixteen numbers through the table, and because two recursions
 * written from different boundaries agreeing is a check worth having.
 */
export function relicFinalLevelChances(
  level: number, durability: number, rates: RelicSuccessRates = relicPowerUpRates,
): readonly number[] {
  checkedRates(rates);
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

/**
 * What the relic is expected to be worth when it finally stops, as a fraction of
 * a finished one.
 *
 * The same recursion, with the one boundary that `relicReachChance` gets wrong
 * for this question changed. There, a relic that runs out of durability below
 * the ceiling is worth nothing, because it never reached the target. Here it is
 * worth exactly what it became.
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
 * That difference is the whole reason this is not read off `P`. `P` answers `0`
 * for any relic that runs out of durability on the way, and an exceptional `+12`
 * with nothing left to spend is one of the best things an account can own — so a
 * model that judged on `P` alone would sell it. `V` instead reads its realised
 * two-part strength (75 % for an ATK/DEF/HP-reading +12; about 81.7 % for SPD),
 * and `V(l, d) − V(l, 0)` is what the power-up bar is read from: the published
 * rates (`RELIC-CANONICAL.md` §7.4) leave `P` near zero for everything, so it
 * separates nothing.
 */
export function relicExpectedStrength(
  level: number, durability: number, source: RelicSourceStat,
  rates: RelicSuccessRates = relicPowerUpRates, mainShare?: number,
): number {
  checkedRates(rates);
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
 * distribution. It cannot be read back off `V`: the strength index is not linear
 * in the level, so inverting it would answer a different question.
 */
export function relicExpectedLevel(chances: readonly number[]): number {
  return chances.reduce((mean, chance, at) => mean + chance * at, 0);
}

/**
 * The chance the very next attempt succeeds.
 *
 * This is the one quantity that needs no recursion — with durability left,
 * reaching `+l + 1` is precisely the game's published rate at `l` — and it lives
 * here anyway, because a caller that reaches into the rate table for the easy
 * case is a caller that will reach into it for the hard one. A relic at the
 * ceiling or out of durability has no next attempt, and says so with `0` rather
 * than with the rate of an attempt it cannot make.
 */
export function relicNextAttemptChance(
  level: number, durability: number, rates: RelicSuccessRates = relicPowerUpRates,
): number {
  checkedRates(rates);
  if (level >= relicMaximumLevel || durability <= 0) return 0;
  return rates[level] ?? 0;
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
 * land on", and it is a poor column on its own: it is where the relic most often
 * stalls, which under the published rates is a level near the start of the
 * climb, and it says nothing about the spread around it. A fresh relic with
 * three attempts stalls most often at `+7`, but with only 21 % of the mass
 * there.
 *
 * `level` is the **median**, and it is what the table prints: the level the
 * relic reaches or beats half the time. A fresh relic with three attempts reads
 * `+7` at 61 %, one with a single attempt reads `+5` at 56 %, a `+9` with two
 * reads `+10` at 58 %, and a spent one reads where it stands. It stays a whole
 * level, which a mean does not, and it answers the question a player actually
 * has. `chance` travels with it because a median is a statement about a tail,
 * and the tail is never exactly a half.
 *
 * The figures above are from the shipped curve and are checked, not recalled:
 * an earlier version of this comment claimed the mode was always `+15` and that
 * a fresh relic read `+10`, neither of which the code has ever produced.
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
