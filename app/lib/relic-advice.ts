import {
  relicEngravingLimit, relicMaximumLevel, relicNextLevelStrengthGain,
  relicOrdinaryLevelStrengthGain, relicPowerUpRates,
} from './relic-properties';
import type { Relic } from './relics';
import {
  relicExpectedLevel, relicFinalLevelChances, relicLanding, relicNextAttemptChance, relicReachChance,
} from './relic-power-up-model';
import type { RelicLanding, RelicSuccessRates } from './relic-power-up-model';
import { relicSynergy, relicSynergyBandLabels, relicSynergyBandOrder } from './relic-synergy';
import type { RelicSynergyBand } from './relic-synergy';

/**
 * What to do with each relic: the policy, and nothing but the policy.
 *
 * `docs/RELIC-CANONICAL.md` §8 owns this. **Every probability it reads comes
 * from `relic-power-up-model.ts` and is computed there**, so a verdict and the
 * chance printed beside it can never come from two different calculations. This
 * file decides what the numbers mean; it does not produce them.
 *
 * The three questions it answers in order: is the pair worth owning at all, can
 * a duplicate ever pass the copy beside it, and is this attempt where the next
 * stone should go.
 */

/**
 * Re-exported so that `relic-power-up-model.ts` stays the one place these are
 * defined while existing importers keep working. New code should import them
 * from the model directly — that is where their documentation lives.
 */
export {
  relicDuplicateMarginalStrength, relicExpectedLevel, relicExpectedStrength,
  relicFinalLevelChances, relicLanding, relicNextAttemptChance, relicReachChance,
} from './relic-power-up-model';
export type { RelicLanding, RelicSuccessRates } from './relic-power-up-model';

/**
 * What a band of fit is worth, as a multiplier.
 *
 * The multiplier makes the one synergy judgement matter without pretending
 * that the ordinal bands are measured utilities. Applied to an expected gain it
 * creates a decision score, not another probability — scores above 100 % are
 * expected.
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
 *
 * It decides only among relics the synergy gate has already admitted, and at the
 * top two stops it is the whole difference between them: both keep every band,
 * so `Wishful thinking` and `Burn it all` are separated by how good an attempt
 * has to look before the stones are worth it.
 *
 * **These move with `relicMinimumSynergyBands`, never apart from it.** A stop
 * whose threshold outruns its own gate admits a band and then refuses to spend
 * on any of it — the setting says Weak is worth keeping and then advises against
 * every Weak power-up, which is a tier gated twice. The two tables were one stop
 * out of step when the gate moved down a band and left these behind, and a
 * middling Weak attempt scoring 75 sat just under a threshold of 80.
 */
export const relicInvestmentThresholds: Record<RelicInvestmentSelectivity, number> = {
  1: 120,
  2: 80,
  3: 50,
  4: 35,
  5: 20,
};

/**
 * What each stop on the slider is called.
 *
 * The number is an index into two tables and nothing a reader can act on: `1`
 * does not say whether it means more power-ups or fewer, and neither does the
 * `180%` behind it, which is a score threshold rather than a chance. The names
 * say the one thing the control decides — how wide a net the account keeps — and
 * they run in the slider's own direction, narrowest on the left.
 *
 * Each name sits over the band `relicMinimumSynergyBands` keeps at that stop,
 * and the two tables are read together or not at all — a name one stop out of
 * step promises a fit the gate does not keep.
 *
 * **`2` is the ordinary setting, and the names are pitched around it.** It is
 * where the slider opens and what most accounts should stay on, so it is named
 * for the judgement it makes rather than for a temperament: only `1` is stricter
 * than ordinary, and the three above it climb from optimistic to indefensible.
 * `5` keeps every relic in the game and spends stones on pairs nothing can
 * redeem; it earns its name and exists so the scale has an end, not because
 * anyone should sit on it.
 */
export const relicInvestmentSelectivityLabels: Record<RelicInvestmentSelectivity, string> = {
  1: 'Picky',
  2: 'Balanced',
  3: 'Optimistic',
  4: 'Wishful thinking',
  5: 'Burn it all',
};

/**
 * The weakest fit each stop is willing to keep. The gate in `decide` sells
 * anything below it, and this is the first question asked of every relic.
 *
 * **The scale starts at Strong, not Exceptional.** An Exceptional-only stop sold
 * all but a handful of relics in a real library — including Strong pairs a
 * cautious player plainly wants to keep — so the most cautious setting was also
 * the most destructive one, which is not what its name promises. Keeping it
 * would have cost a sixth stop to say something no player asked for. The two
 * boldest stops therefore share a band: past Weak the gate has nothing left to
 * reject, and `relicInvestmentThresholds` is what still separates them.
 */
export const relicMinimumSynergyBands: Record<RelicInvestmentSelectivity, RelicSynergyBand> = {
  1: 'strong',
  2: 'neutral',
  3: 'weak',
  4: 'poor',
  5: 'poor',
};

/**
 * How likely a duplicate must be to pass the copy the account already holds
 * before its stones are worth spending, by how good the pair is.
 *
 * **This gate does not read the slider, and that is the point.** The slider says
 * how wide a net the account keeps; this asks a question the player has no taste
 * about — can this relic actually overtake the one beside it? A relic with a
 * 2 % chance of passing its incumbent is a bad investment at every setting, and
 * a `+0` challenger facing a `+5` is a good one at every setting. Letting the
 * slider move these would let a bold setting recommend stones on attempts that
 * are simply lost.
 *
 * Synergy sets the price of admission because it is what the attempt buys. An
 * Exceptional pair is worth a long shot; a Poor one is worth stones only when
 * passing is close to certain. The figures are read against the real overtake
 * chances (`RELIC-CANONICAL.md` §8.4), where a full-durability challenger passes
 * a `+5` incumbent 82 % of the time, a `+8` 22 %, a `+10` 4.3 % and a `+12`
 * 0.36 % — so these five thresholds sort duplicates by how high the incumbent
 * has climbed, which is the thing that actually decides the matter.
 *
 * **Exceptional is not exempt.** At 5 % a fresh challenger still tries against
 * an incumbent up to `+9` and gives up beyond it: against a `+12` it passes
 * about once in 280 attempts, and no pairing is good enough to make that a plan.
 */
export const relicOvertakeThresholds: Record<RelicSynergyBand, number> = {
  exceptional: 0.05,
  strong: 0.15,
  neutral: 0.30,
  weak: 0.50,
  poor: 0.70,
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
  /** Expected next-attempt gain adjusted for synergy, not a probability. */
  investmentScore: number;
  /** The level the relic is expected to stop at, as a mean. */
  expectedLevel: number;
  /** Where the relic comes to rest: the median level, and the mode beside it. */
  landing: RelicLanding;
  /** An equal-or-higher same-pair copy this relic must improve on, or `null`. */
  supersededBy: Relic | null;
  /** `P(l, d, incumbent's level + 1)`, or `null` when there is no incumbent. */
  overtakeChance: number | null;
};

const pairKey = (relic: Relic) => `${relic.mainProperty}:${relic.unique.definition.id}`;

const percent = (fraction: number) => {
  const value = fraction * 100;
  if (value >= 10 || Number.isInteger(value)) return `${Math.round(value)}%`;
  if (value >= 1) return `${value.toFixed(1).replace(/\.0$/, '')}%`;
  return `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
};
const investmentScore = (chance: number, weight: number, strengthGain: number) =>
  100 * chance * weight * strengthGain / relicOrdinaryLevelStrengthGain;

/**
 * The whole account's advice at once, because a verdict on one relic depends on
 * which other relics the account holds — and, since the engraving limit became
 * a real constraint, on how far the copy it is measured against has already
 * spread.
 *
 * `engravings` is the account's own count per relic id, as
 * `relicEngravingCounts` walks it off the roster. Omitting it reads every relic
 * as having room, which is the right answer for a check driving the recursions
 * with stated relics and the wrong one for the page.
 */
export function relicAdvice(
  relics: readonly Relic[], selectivity: RelicInvestmentSelectivity, rates: RelicSuccessRates = relicPowerUpRates,
  engravings?: ReadonlyMap<string, number>,
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
    /* One same-level copy has to be the incumbent too: a relic covers 150
       monsters, so equal permanent copies have no separate account value. The
       lower rid is the stable, oldest tie-breaker. */
    const incumbent = (pairs.get(pairKey(relic)) ?? []).reduce<Relic | null>((best, candidate) => {
      const canSupersede = candidate.id !== relic.id
        && (candidate.level > relic.level
          || (candidate.level === relic.level && candidate.obtainedOrder < relic.obtainedOrder));
      if (!canSupersede || best === null) return canSupersede ? candidate : best;
      if (candidate.level > best.level
        || (candidate.level === best.level && candidate.obtainedOrder < best.obtainedOrder)) return candidate;
      return best;
    }, null);
    /* Measured against the incumbent's present level. The duplicate score below
       uses the complete landing distribution, but the displayed chance remains
       the concrete chance to pass the copy the account already has. */
    const overtakeChance = incumbent === null
      ? null
      : relicReachChance(relic.level, relic.durability, incumbent.level + 1, rates);

    const chance = relicNextAttemptChance(relic.level, relic.durability, rates);
    const score = investmentScore(chance, weight, relicNextLevelStrengthGain(relic.level, relic.unique.definition.per));
    /* A copy that has run out of places is no longer an incumbent this relic can
       be redundant against — §8.1's premise is that one copy already reaches more
       monsters than the account fields, and a saturated copy has stopped doing
       so. See the note on `decide`. */
    const incumbentIsFull = incumbent !== null
      && (engravings?.get(incumbent.id) ?? 0) >= relicEngravingLimit;
    advice.set(relic.id, {
      ...decide({
        chance, score, overtakeChance, incumbent, incumbentIsFull,
        relic, threshold, band, minimumBand,
      }),
      reachChance,
      expectedGain: relicExpectedLevel(chances) - relic.level,
      nextChance: chance,
      investmentScore: score,
      expectedLevel: relicExpectedLevel(chances),
      landing: relicLanding(chances),
      supersededBy: incumbent,
      overtakeChance,
    });
  }
  return advice;
}

/**
 * The decision, in the order the rules outrank each other.
 *
 * **Synergy is the gate, and it is the first thing asked.** The slider names a
 * weakest fit the account is willing to hold, and a relic below it is sold
 * whatever else is true of it — before its level, its durability, its duplicates
 * or its next attempt are looked at at all. Everything after the gate answers a
 * different question, and only for relics that got past it: this pair is worth
 * owning, so is it worth spending stones on?
 *
 * The gate used to sit third, and the two rules that outranked it each let a
 * relic through that the setting had already rejected. A relic below `+3` was
 * powered up on a pair the account had said it did not want, on the grounds that
 * those levels are free — they are not. They are certain, which is a different
 * thing: the rate is 100 %, so no durability is spent, but the stones and gold
 * are charged exactly as at any other level. At the strictest setting the page
 * was therefore recommending stones on hopeless relics, which is the one thing
 * the gate exists to prevent. A relic that could not be powered up at all was
 * kept for the same reason, filling the account with finished relics of a pair
 * it had ruled out. Neither exception survives: a bad pairing is bad at every
 * level, and a guaranteed roll on one is a guaranteed waste.
 *
 * The next-attempt chance is exact: with durability left, reaching `+l + 1` is
 * precisely the game's published rate at `l`. Its realised strength gain
 * distinguishes an ordinary main-stat level from a unique-property tier. The
 * synergy multiplier turns that expected gain into a score for choosing where
 * scarce stones go; it must not be described as a probability.
 *
 * **Two gates run before any of that, and neither reads the slider's score.**
 * The synergy gate asks whether the pair is worth owning; the duplicate gate
 * asks whether a second copy of a pair can ever pass the first. Only a relic
 * that is worth owning and is not a hopeless duplicate reaches the question the
 * score exists to answer, which is where scarce stones do the most good.
 *
 * **The duplicate gate has one exception, and the 150-monster limit is what
 * created it.** §8.2 sells a same-pair copy that cannot expect to pass the one
 * the account already holds, and the premise underneath that — §1's, that one
 * relic already covers more monsters than an account fields — stopped being true
 * the moment §11 made capacity a constraint the page computes with. A copy
 * engraved on its full 150 cannot take a 151st monster whatever its level, so a
 * weaker duplicate of it is not redundant: it is the only way the account can
 * put that pair on another monster at all. Such a relic is judged on its own
 * next attempt, exactly as a relic with no incumbent is.
 */
function decide({
  chance, score, overtakeChance, incumbent, incumbentIsFull,
  relic, threshold, band, minimumBand,
}: {
  chance: number;
  score: number;
  overtakeChance: number | null;
  incumbent: Relic | null;
  incumbentIsFull: boolean;
  relic: Relic;
  threshold: number;
  band: RelicSynergyBand;
  minimumBand: RelicSynergyBand;
}): { verdict: RelicVerdict; reason: string } {
  if (relicSynergyBandOrder.indexOf(band) > relicSynergyBandOrder.indexOf(minimumBand)) {
    return { verdict: 'sell', reason: `${relicSynergyBandLabels[band]} fit: below threshold.` };
  }
  if (relic.level >= relicMaximumLevel || relic.durability === 0) {
    if (incumbent !== null && incumbentIsFull) {
      return { verdict: 'keep', reason: `Other copy is on ${relicEngravingLimit}.` };
    }
    if (incumbent !== null) return { verdict: 'sell', reason: `No power-up; +${incumbent.level} kept.` };
    return { verdict: 'keep', reason: 'Cannot power up.' };
  }
  /* The duplicate gate, and it is asked before the certain level below. A `+0`
     challenger standing beside a `+12` copy would otherwise be powered up on the
     strength of a guaranteed level it has no use for: the account already owns
     that pair three levels higher, and one relic covers more monsters than it
     fields. The question is not whether this attempt succeeds but whether the
     relic can ever get past the copy beside it, and the answer does not move
     with the slider. */
  if (incumbent !== null && !incumbentIsFull) {
    if (incumbent.level >= relicMaximumLevel) return { verdict: 'sell', reason: 'Cannot beat +15.' };
    const working = `Beat +${incumbent.level}: ${percent(overtakeChance ?? 0)}`;
    if ((overtakeChance ?? 0) >= relicOvertakeThresholds[band]) {
      return { verdict: 'power-up', reason: working };
    }
    return { verdict: 'sell', reason: working };
  }

  /* Certain, not free. `+0`, `+1` and `+2` each succeed at 100 % and so cost no
     durability, but the stones and gold are charged at every level — the game's
     own power-up panel prices a roll the same whether the rate is 100 % or 10 %.
     A guaranteed level on a pair worth keeping is still the best stone an
     account can spend, which is why this outranks the score; it is not outside
     the economy. */
  if (relic.level < 3) return { verdict: 'power-up', reason: `Sure +1: ${percent(chance)}` };

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
